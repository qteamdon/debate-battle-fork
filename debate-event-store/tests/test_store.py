"""Tests for the EventStore class."""

import pytest
from debate_event_store.store import EventStore, MAX_TEXT_LENGTH


@pytest.fixture
def store():
    return EventStore()


@pytest.mark.asyncio
async def test_empty_store_status(store):
    status = await store.status()
    assert status["tip"] == 0
    assert status["event_count"] == 0
    assert status["agents"] == {}


@pytest.mark.asyncio
async def test_publish_first_event_without_catchup_on_empty_stream(store):
    """First publish on an empty stream succeeds because agent_pos(0) == tip(0)."""
    result = await store.publish("frank", "POSITION: MIT is best")
    assert result["success"] is True
    assert result["position"] == 1
    assert result["tip"] == 1
    assert result["remaining_events"] == 199


@pytest.mark.asyncio
async def test_position_claim_blind_publish_rejected(store):
    """A second agent's POSITION publish without catch_up is rejected.

    OCC fires on claim events so the agent first reads every prior POSITION
    and can pick a different angle. This is the mechanism for position
    uniqueness — the agent, not the server, picks the unique stance.
    """
    await store.publish("alice", "POSITION: MIT is best")
    # bob publishes a POSITION without catching up — fails OCC.
    r = await store.publish("bob", "POSITION: AGPL preserves freedom")
    assert r["success"] is False
    assert r["error"] == "occ_conflict"
    assert r["last_claim_position"] == 1


@pytest.mark.asyncio
async def test_position_claim_succeeds_after_catch_up(store):
    """After catch_up, the agent sees prior claims and can publish their POSITION."""
    await store.publish("alice", "POSITION: MIT is best")

    catchup = await store.catch_up("bob")
    # Tolerate either return shape (the pre-existing aspirational tests
    # expect 'events'; the current store returns 'events_markdown').
    assert "events_markdown" in catchup or "events" in catchup

    r = await store.publish("bob", "POSITION: AGPL preserves freedom")
    assert r["success"] is True
    assert r["position"] == 2


@pytest.mark.asyncio
async def test_role_declaration_also_triggers_occ(store):
    """ROLE: Negative Nancy is a claim too — must catch_up before publishing."""
    await store.publish("alice", "POSITION: MIT is best")
    # bob tries to declare a ROLE without catching up.
    r = await store.publish("bob", "ROLE: Negative Nancy - I'll critique without advocating")
    assert r["success"] is False
    assert r["error"] == "occ_conflict"

    # After catch_up, the ROLE declaration works.
    await store.catch_up("bob")
    r = await store.publish("bob", "ROLE: Negative Nancy - I'll critique without advocating")
    assert r["success"] is True


@pytest.mark.asyncio
async def test_non_claim_events_bypass_occ(store):
    """ARGUMENT/REBUTTAL/etc. publish without catch_up — only claims are gated."""
    await store.publish("alice", "POSITION: MIT is best")
    # bob publishes a non-claim event without ever catching up.
    r = await store.publish("bob", "ARGUMENT: MIT has more adoption")
    assert r["success"] is True
    assert r["position"] == 2


@pytest.mark.asyncio
async def test_occ_uses_claim_frontier_not_tip(store):
    """ARGUMENT events between catch_up and POSITION publish must not retrigger OCC.

    This avoids the thundering-herd problem: the tip moves with every event but
    the claim frontier moves only when a POSITION/ROLE lands. Once an agent
    has caught up past the last claim, intervening arguments do not invalidate
    their claim attempt.
    """
    # alice claims, then publishes arguments — these move the tip but NOT
    # the claim frontier.
    await store.publish("alice", "POSITION: MIT is best")
    await store.publish("alice", "ARGUMENT: MIT has 3x enterprise PRs")
    await store.publish("alice", "ARGUMENT: smaller compliance burden")

    # bob catches up at this point — reads tip=3, last claim still at pos 1.
    await store.catch_up("bob")

    # Alice publishes more arguments — tip moves, claim frontier doesn't.
    await store.publish("alice", "ARGUMENT: easier integration")
    await store.publish("alice", "ARGUMENT: huge ecosystem")
    # tip is now 5, but the last claim is still position 1.

    # bob publishes POSITION without re-catching-up. Under tip-equality OCC this would
    # fail (bob_pos=3 != tip=5). Under claim-scoped OCC it succeeds because bob has
    # seen every claim (bob_pos=3 >= last_claim_pos=1).
    r = await store.publish("bob", "POSITION: AGPL preserves freedom")
    assert r["success"] is True
    assert r["position"] == 6


@pytest.mark.asyncio
async def test_subsequent_publishes_unconstrained(store):
    """Non-claim events publish freely after the agent's claim — no OCC."""
    await store.publish("frank", "POSITION: MIT is best")

    # alice catches up, claims her position (OCC fires on the claim).
    await store.catch_up("alice")
    await store.publish("alice", "POSITION: AGPL is the way for freedom")

    # frank publishes a NON-claim event without catching up — succeeds.
    # OCC only applies to claim events; subsequent arguments are free.
    result = await store.publish("frank", "ARGUMENT: MIT has more adoption")
    assert result["success"] is True
    assert result["position"] == 3


@pytest.mark.asyncio
async def test_catch_up_filters_own_events(store):
    """catch_up excludes the agent's own events."""
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT is best")

    await store.catch_up("alice")
    await store.publish("alice", "POSITION: AGPL is best")

    # frank catches up — should only see alice's event
    catchup = await store.catch_up("frank")
    assert catchup["new_event_count"] == 1
    assert "alice" in catchup["events_markdown"]
    assert "frank" not in catchup["events_markdown"]
    assert catchup["tip"] == 2


@pytest.mark.asyncio
async def test_catch_up_at_tip_returns_empty(store):
    """If agent is already at tip, catch_up reports no new events."""
    await store.catch_up("frank")
    catchup = await store.catch_up("frank")
    assert catchup["new_event_count"] == 0
    assert catchup["events_markdown"] == "(no new events)"


@pytest.mark.asyncio
async def test_text_too_long(store):
    """Events exceeding MAX_TEXT_LENGTH are rejected."""
    long_text = "x" * (MAX_TEXT_LENGTH + 1)
    result = await store.publish("frank", long_text)
    assert result["success"] is False
    assert result["error"] == "text_too_long"
    assert result["max_length"] == MAX_TEXT_LENGTH


@pytest.mark.asyncio
async def test_event_limit_reached(store):
    """Agent is blocked after reaching the per-agent event limit."""
    await store.reset(per_agent_event_limit=3)

    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")
    await store.publish("frank", "ARGUMENT: adoption")
    await store.publish("frank", "ARGUMENT: ecosystem")

    result = await store.publish("frank", "ARGUMENT: one more")
    assert result["success"] is False
    assert result["error"] == "event_limit_reached"
    assert result["limit"] == 3
    assert result["published"] == 3


@pytest.mark.asyncio
async def test_get_all_events(store):
    """get_all_events returns the complete stream."""
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")
    await store.catch_up("alice")
    await store.publish("alice", "POSITION: AGPL")

    result = await store.get_all_events()
    assert result["tip"] == 2
    assert result["event_count"] == 2
    lines = result["events_markdown"].splitlines()
    assert len(lines) == 2
    assert "frank" in lines[0]
    assert "alice" in lines[1]


@pytest.mark.asyncio
async def test_reset_clears_everything(store):
    """reset clears all state and sets the new event limit."""
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")

    result = await store.reset(per_agent_event_limit=50)
    assert result["success"] is True
    assert result["per_agent_event_limit"] == 50

    status = await store.status()
    assert status["tip"] == 0
    assert status["agents"] == {}


@pytest.mark.asyncio
async def test_status_tracks_agents(store):
    """status reports per-agent read positions and publish counts."""
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")
    await store.catch_up("alice")
    await store.publish("alice", "POSITION: AGPL")

    status = await store.status()
    assert status["tip"] == 2
    assert status["agents"]["frank"]["read_position"] == 1
    assert status["agents"]["frank"]["events_published"] == 1
    assert status["agents"]["alice"]["read_position"] == 2
    assert status["agents"]["alice"]["events_published"] == 1


@pytest.mark.asyncio
async def test_multiple_agents_position_claiming_flow(store):
    """3 agents claim positions; OCC enforces catch_up before each claim."""
    # frank claims on an empty stream — no prior claims, OCC passes trivially.
    r = await store.publish("frank", "POSITION: MIT")
    assert r["success"] is True

    # alice catches up, sees frank's claim, picks a different angle.
    await store.catch_up("alice")
    r = await store.publish("alice", "POSITION: AGPL")
    assert r["success"] is True

    # bob tries to claim without catching up — fails OCC.
    r = await store.publish("bob", "POSITION: BSL")
    assert r["success"] is False
    assert r["error"] == "occ_conflict"

    # bob catches up, sees both positions, claims a different one.
    await store.catch_up("bob")
    r = await store.publish("bob", "POSITION: Dual licensing")
    assert r["success"] is True

    # All three can now freely argue — no OCC on non-claim events.
    r = await store.publish("frank", "ARGUMENT: MIT has 3x enterprise PRs")
    assert r["success"] is True
    r = await store.publish("alice", "REBUTTAL @frank: AWS Elasticsearch proves MIT fails")
    assert r["success"] is True


@pytest.mark.asyncio
async def test_negative_nancy_flow(store):
    """An agent can declare as Negative Nancy instead of claiming a position."""
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")

    await store.catch_up("eve")
    r = await store.publish("eve", "ROLE: Negative Nancy — I will critique all positions without advocating for one")
    assert r["success"] is True

    # eve can still publish critiques
    r = await store.publish("eve", "CRITIQUE @frank: No evidence for adoption claim")
    assert r["success"] is True


@pytest.mark.asyncio
async def test_publish_advances_read_position(store):
    """On successful publish, the agent's read position advances to the new tip."""
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")

    status = await store.status()
    assert status["agents"]["frank"]["read_position"] == 1

    await store.publish("frank", "ARGUMENT: more adoption")
    status = await store.status()
    assert status["agents"]["frank"]["read_position"] == 2


@pytest.mark.asyncio
async def test_concurrent_publishes_after_first(store):
    """Multiple agents publishing concurrently after their first publish."""
    # Set up: both agents claim positions
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")
    await store.catch_up("alice")
    await store.publish("alice", "POSITION: AGPL")

    # Both publish arguments without catching up — both should succeed
    r1 = await store.publish("frank", "ARGUMENT: MIT point 1")
    r2 = await store.publish("alice", "ARGUMENT: AGPL point 1")
    assert r1["success"] is True
    assert r2["success"] is True

    assert (await store.status())["tip"] == 4
