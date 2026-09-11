"""In-process debate clock: four ORCHESTRATOR checkpoints, no LLM."""

import asyncio
import json

import pytest

import debate_event_store.server as server_mod
from debate_event_store.clock import CHECKPOINT_MESSAGES, DebateClock
from debate_event_store.server import call_tool, clock, store


@pytest.fixture(autouse=True)
async def _reset():
    await clock.cancel()
    await store.reset(200)
    yield
    await clock.cancel()
    if server_mod.web_server is not None:
        try:
            server_mod.web_server.stop()
        except Exception:
            pass
        server_mod.web_server = None


def _orchestrator_texts(events: list[dict]) -> list[str]:
    return [e["text"] for e in events if e["agent_id"] == "orchestrator"]


@pytest.mark.asyncio
async def test_clock_publishes_four_checkpoints_in_order():
    local = DebateClock(store)
    result = await local.start(0.2)
    assert result["success"] is True
    assert result["already_running"] is False
    await asyncio.sleep(0.45)
    events = await store.list_events()
    texts = _orchestrator_texts(events)
    assert texts == [msg for _, msg in CHECKPOINT_MESSAGES]
    assert local.snapshot()["finished"] is True
    assert local.snapshot()["published_fractions"] == [0.33, 0.66, 0.85, 1.0]


@pytest.mark.asyncio
async def test_second_start_while_running_is_idempotent():
    first = await call_tool("debate_start_clock", {"duration_seconds": 2})
    d1 = json.loads(first[0].text)
    assert d1["success"] is True
    assert d1["already_running"] is False

    second = await call_tool("debate_start_clock", {"duration_seconds": 2})
    d2 = json.loads(second[0].text)
    assert d2["success"] is True
    assert d2["already_running"] is True

    await asyncio.sleep(0.05)
    events = await store.list_events()
    # Still early; at most the 33% mark, never a doubled set.
    texts = _orchestrator_texts(events)
    assert len(texts) <= 1
    assert len(texts) == len(set(texts))


@pytest.mark.asyncio
async def test_reset_cancels_clock_so_no_further_publishes():
    await call_tool("debate_start_clock", {"duration_seconds": 5})
    await call_tool("debate_reset", {"per_agent_event_limit": 200})
    await asyncio.sleep(0.3)
    events = await store.list_events()
    assert events == []
    snap = clock.snapshot()
    assert snap["running"] is False
    assert snap["finished"] is False


@pytest.mark.asyncio
async def test_start_after_finish_requires_reset():
    await call_tool("debate_start_clock", {"duration_seconds": 0.15})
    await asyncio.sleep(0.4)
    again = await call_tool("debate_start_clock", {"duration_seconds": 0.15})
    data = json.loads(again[0].text)
    assert data["success"] is False
    assert data["error"] == "clock_finished"

    await call_tool("debate_reset", {})
    ok = await call_tool("debate_start_clock", {"duration_seconds": 0.15})
    assert json.loads(ok[0].text)["success"] is True


@pytest.mark.asyncio
async def test_duration_minutes_and_status_clock_field():
    r = await call_tool("debate_start_clock", {"duration_minutes": 0.01})
    data = json.loads(r[0].text)
    assert data["success"] is True
    assert abs(data["duration_seconds"] - 0.6) < 1e-6

    status = json.loads((await call_tool("debate_status", {}))[0].text)
    assert "clock" in status
    assert status["clock"]["running"] is True


@pytest.mark.asyncio
async def test_missing_duration_errors():
    r = await call_tool("debate_start_clock", {})
    data = json.loads(r[0].text)
    assert data["success"] is False
    assert data["error"] == "duration_required"
