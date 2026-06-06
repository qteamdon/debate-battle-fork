"""Tests for Phase 2 MCP tools: debate_visualize, debate_get_recent_events, debate_post_summary."""

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


@pytest.fixture(autouse=True)
async def _reset_state():
    """Reset the global store and tear down the module-level web server."""
    await store.reset(200)
    yield
    # Tear down web_server between tests so port + state don't bleed.
    if server_mod.web_server is not None:
        try:
            server_mod.web_server.stop()
        except Exception:
            pass
        server_mod.web_server = None


@pytest.mark.asyncio
async def test_debate_visualize_idempotent():
    port = _free_port()
    r1 = await call_tool("debate_visualize", {"port": port})
    d1 = json.loads(r1[0].text)
    assert d1["already_running"] is False
    assert d1["url"].startswith("http://127.0.0.1:")
    url1 = d1["url"]

    r2 = await call_tool("debate_visualize", {"port": port})
    d2 = json.loads(r2[0].text)
    assert d2["already_running"] is True
    assert d2["url"] == url1


@pytest.mark.asyncio
async def test_debate_get_recent_events_stateless():
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")
    await store.publish("frank", "ARGUMENT: short license")
    await store.publish("frank", "ARGUMENT: low compliance burden")

    r = await call_tool("debate_get_recent_events", {"since_position": 1})
    data = json.loads(r[0].text)
    assert data["tip"] == 3
    assert [e["position"] for e in data["events"]] == [2, 3]
    assert data["events"][0]["text"] == "ARGUMENT: short license"
    assert data["events"][0]["agent_id"] == "frank"

    # The call must not have moved any agent's read position. Bob catches up
    # and should still see all three events.
    r2 = await call_tool("debate_catch_up", {"agent_id": "bob"})
    bob_data = json.loads(r2[0].text)
    # Tolerate either return shape: 'events' (structured) or 'events_markdown'.
    if "events" in bob_data:
        assert len(bob_data["events"]) == 3
    else:
        assert bob_data["events_markdown"].count("\n") == 2  # 3 lines


@pytest.mark.asyncio
async def test_debate_get_recent_events_default_since_zero():
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")

    r = await call_tool("debate_get_recent_events", {})
    data = json.loads(r[0].text)
    assert [e["position"] for e in data["events"]] == [1]


@pytest.mark.asyncio
async def test_debate_post_summary_does_not_write_to_log():
    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")
    pre_tip = store.tip

    r = await call_tool(
        "debate_post_summary",
        {
            "text": "tide is shifting toward MIT",
            "tensions": [{"a": "frank", "b": "alice", "topic": "license"}],
            "convergences": [],
        },
    )
    data = json.loads(r[0].text)
    assert data["success"] is True
    assert "broadcast_to_clients" in data

    assert store.tip == pre_tip

    all_events = await store.get_all_events()
    md = all_events.get("events_markdown", "")
    assert "tide is shifting" not in md
    assert "summary" not in md.lower() or "summary" not in "tide is shifting"


@pytest.mark.asyncio
async def test_debate_post_summary_optional_tensions_convergences():
    r = await call_tool("debate_post_summary", {"text": "quiet round, nothing to flag"})
    data = json.loads(r[0].text)
    assert data["success"] is True


@pytest.mark.asyncio
async def test_debate_post_summary_auto_starts_web_server():
    """The summariser may fire before debate_visualize is called."""
    assert server_mod.web_server is None
    r = await call_tool("debate_post_summary", {"text": "first signal"})
    data = json.loads(r[0].text)
    assert data["success"] is True
    assert server_mod.web_server is not None


@pytest.mark.asyncio
async def test_debate_post_summary_reaches_sse_client():
    port = _free_port()
    r = await call_tool("debate_visualize", {"port": port})
    url = json.loads(r[0].text)["url"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        async with client.stream("GET", f"{url}/api/stream") as resp:
            assert resp.status_code == 200
            line_iter = resp.aiter_lines()

            # First message is the snapshot.
            snapshot = await _read_sse_message(line_iter)
            assert snapshot["type"] == "snapshot"

            # Poll until the SSE generator has registered as a summary
            # subscriber, instead of sleeping a fixed interval. Removes the
            # flakiness on slow CI without slowing the fast path.
            ws = server_mod.web_server
            assert ws is not None
            deadline = asyncio.get_event_loop().time() + 2.0
            while ws.event_bus.summary_subscriber_count() < 1:
                if asyncio.get_event_loop().time() > deadline:
                    raise AssertionError("SSE summary subscriber never registered")
                await asyncio.sleep(0.02)

            await call_tool(
                "debate_post_summary",
                {
                    "text": "tide is shifting",
                    "tensions": [],
                    "convergences": [],
                },
            )

            envelope = await asyncio.wait_for(
                _read_sse_message(line_iter), timeout=5.0
            )
            assert envelope["type"] == "summary"
            assert envelope["text"] == "tide is shifting"
            assert envelope["tensions"] == []
            assert envelope["convergences"] == []
            assert "as_of_position" in envelope


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
