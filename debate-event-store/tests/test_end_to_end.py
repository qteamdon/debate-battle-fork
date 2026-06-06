"""Phase 8 end-to-end smoke test.

Exercises the full path: publish events -> simulate the summariser by calling
the `debate_post_summary` MCP tool -> connect a SSE consumer to /api/stream ->
assert the summary envelope arrives -> assert the summariser's output never
entered the event log.

This is the load-bearing invariant of the design: summaries are for the human
spectator only. Debaters never see them via `debate_catch_up` or
`debate_get_all_events`.
"""

from __future__ import annotations

import asyncio
import json
import socket

import httpx
import pytest

import debate_event_store.server as server_mod
from debate_event_store.server import call_tool, store


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def _read_sse_message(line_iter) -> dict:
    data_parts: list[str] = []
    async for line in line_iter:
        if line == "":
            if data_parts:
                return json.loads("\n".join(data_parts))
            continue
        if line.startswith("data:"):
            data_parts.append(line[len("data:"):].lstrip())
    raise RuntimeError("SSE stream ended without delivering a message")


@pytest.fixture(autouse=True)
async def _reset_state():
    """Reset the global store and tear down the module-level web server.

    Phase 8 reuses the same global `store` + `web_server` as test_mcp_tools.py,
    so the autouse fixture must clean both between cases. Without this the
    web_server captured by Phase 2 tests would linger and the SSE connection
    would attach to a stale port.
    """
    await store.reset(200)
    yield
    if server_mod.web_server is not None:
        try:
            server_mod.web_server.stop()
        except Exception:
            pass
        server_mod.web_server = None


async def _wait_for_summary_subscriber(ws, timeout: float = 2.0) -> None:
    """Poll until the SSE generator has finished its registration.

    Without this, `debate_post_summary` may broadcast before the route handler
    has called `bus.subscribe("summary")`, causing the assertion below to
    block forever. Pattern lifted from test_mcp_tools.py.
    """
    deadline = asyncio.get_event_loop().time() + timeout
    while ws.event_bus.summary_subscriber_count() < 1:
        if asyncio.get_event_loop().time() > deadline:
            raise AssertionError("SSE summary subscriber never registered")
        await asyncio.sleep(0.02)


@pytest.mark.asyncio
async def test_summary_reaches_browser_but_not_event_log():
    """The headline Phase 8 invariant: summariser output reaches the SSE
    summary channel but never enters the event log. Debaters calling
    `debate_catch_up` or `debate_get_all_events` should see ONLY the events
    they published, not haiku's commentary."""
    port = _free_port()
    r = await call_tool("debate_visualize", {"port": port})
    url = json.loads(r[0].text)["url"]

    # Publish a couple of "agent" events. These are the only things that should
    # ever show up in `debate_get_all_events`.
    await store.catch_up("alice")
    await store.publish("alice", "POSITION: MIT")
    await store.catch_up("bob")
    await store.publish("bob", "POSITION: AGPL")
    pre_tip = store.tip
    assert pre_tip == 2

    summary_text = "MIT and AGPL diverge on enforcement"
    received_summary: dict | None = None

    async with httpx.AsyncClient(timeout=10.0) as client:
        async with client.stream("GET", f"{url}/api/stream") as resp:
            assert resp.status_code == 200
            line_iter = resp.aiter_lines()

            snapshot = await _read_sse_message(line_iter)
            assert snapshot["type"] == "snapshot"
            assert len(snapshot["events"]) == 2

            ws = server_mod.web_server
            assert ws is not None
            await _wait_for_summary_subscriber(ws)

            # Simulate the summariser subagent. This is the call the haiku
            # subagent will make in production (see docs/SUMMARISER_SUBAGENT.md).
            await call_tool(
                "debate_post_summary",
                {
                    "text": summary_text,
                    "tensions": [
                        {"a": "alice", "b": "bob", "topic": "license enforcement"},
                    ],
                    "convergences": [],
                },
            )

            envelope = await asyncio.wait_for(
                _read_sse_message(line_iter), timeout=5.0
            )
            received_summary = envelope

    assert received_summary is not None
    assert received_summary["type"] == "summary"
    assert received_summary["text"] == summary_text
    assert received_summary["tensions"] == [
        {"a": "alice", "b": "bob", "topic": "license enforcement"},
    ]
    assert received_summary["convergences"] == []
    # as_of_position must reflect the tip at the moment the summary was posted.
    assert received_summary["as_of_position"] == pre_tip

    # Invariant: nothing the summariser said may have entered the event log.
    # If it did, debaters would receive it via catch_up and the haiku
    # perspective would bias their next event.
    assert store.tip == pre_tip
    all_events = await store.get_all_events()
    md = all_events.get("events_markdown", "")
    assert summary_text not in md
    assert "license enforcement" not in md


@pytest.mark.asyncio
async def test_summary_with_momentum_adjustments_passes_through():
    """Phase 8 contract: the summariser MAY embed `momentum_adjustments` in
    the summary envelope to drive `MomentumStore.applyEnrichment` on the
    frontend. The backend treats it as opaque pass-through; the SSE consumer
    sees it verbatim. (The current `debate_post_summary` tool doesn't accept
    a `momentum_adjustments` argument explicitly, so we exercise the
    pass-through by simulating a future-shape envelope directly through the
    event bus — keeping the test honest about wire compatibility without
    requiring a backend tweak in the final phase.)"""
    port = _free_port()
    r = await call_tool("debate_visualize", {"port": port})
    url = json.loads(r[0].text)["url"]

    await store.catch_up("alice")
    await store.publish("alice", "POSITION: MIT")

    async with httpx.AsyncClient(timeout=10.0) as client:
        async with client.stream("GET", f"{url}/api/stream") as resp:
            assert resp.status_code == 200
            line_iter = resp.aiter_lines()

            snapshot = await _read_sse_message(line_iter)
            assert snapshot["type"] == "snapshot"

            ws = server_mod.web_server
            assert ws is not None
            await _wait_for_summary_subscriber(ws)

            # Direct bus publish simulates a richer summariser envelope that
            # includes momentum adjustments. This is the wire shape Phase 8's
            # SummaryStore.applyEnrichmentToMomentum consumes.
            ws.event_bus.publish_summary({
                "type": "summary",
                "text": "alice swings momentum on her steelman",
                "tensions": [],
                "convergences": [],
                "as_of_position": store.tip,
                "momentum_adjustments": [
                    {
                        "event_position": 1,
                        "agent_id": "alice",
                        "delta": 0.5,
                        "takedown_blurb": "clean targeting of the prior-injection objection",
                    },
                ],
            })

            envelope = await asyncio.wait_for(
                _read_sse_message(line_iter), timeout=5.0
            )

    assert envelope["type"] == "summary"
    assert envelope["momentum_adjustments"] == [
        {
            "event_position": 1,
            "agent_id": "alice",
            "delta": 0.5,
            "takedown_blurb": "clean targeting of the prior-injection objection",
        },
    ]

    # Invariant holds regardless of envelope shape.
    md = (await store.get_all_events()).get("events_markdown", "")
    assert "swings momentum" not in md
    assert "takedown_blurb" not in md
