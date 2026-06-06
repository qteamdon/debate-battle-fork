"""Tests for the FastAPI + SSE web layer."""

import asyncio
import json
import socket
import time

import httpx
import pytest

from debate_event_store.store import EventStore
from debate_event_store.web.broadcast import _put_drop_oldest
from debate_event_store.web.server import WebServer


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def store() -> EventStore:
    return EventStore()


@pytest.fixture
def web_server(store: EventStore):
    server = WebServer(store)
    port = _free_port()
    url = server.ensure_started(host="127.0.0.1", port=port)
    yield server, url
    server.stop()


async def test_event_bus_drops_oldest_on_full_queue() -> None:
    """A bounded queue keeps the newest payload when oversubscribed."""
    q: asyncio.Queue = asyncio.Queue(maxsize=3)
    for i in range(5):
        _put_drop_oldest(q, {"i": i})

    drained: list[dict] = []
    while not q.empty():
        drained.append(q.get_nowait())

    assert len(drained) == 3
    assert drained[-1] == {"i": 4}
    # The oldest (0, 1) were dropped — 2, 3, 4 survive.
    assert drained == [{"i": 2}, {"i": 3}, {"i": 4}]


async def test_web_server_starts_and_serves_status(web_server, store: EventStore) -> None:
    _server, url = web_server

    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")
    await store.catch_up("alice")
    await store.publish("alice", "POSITION: AGPL")

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{url}/api/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tip"] == 2
        assert data["event_count"] == 2
        assert data["per_agent_event_limit"] == 200
        assert "frank" in data["agents"]

        resp = await client.get(f"{url}/api/events")
        assert resp.status_code == 200
        events_data = resp.json()
        assert events_data["tip"] == 2
        assert len(events_data["events"]) == 2
        assert events_data["events"][0]["agent_id"] == "frank"
        assert events_data["events"][1]["agent_id"] == "alice"
        assert "timestamp" in events_data["events"][0]


async def test_sse_stream_delivers_snapshot_then_event(web_server, store: EventStore) -> None:
    _server, url = web_server

    await store.catch_up("frank")
    await store.publish("frank", "POSITION: MIT")

    async with httpx.AsyncClient(timeout=10.0) as client:
        async with client.stream("GET", f"{url}/api/stream") as resp:
            assert resp.status_code == 200

            line_iter = resp.aiter_lines()
            snapshot = await _read_sse_message(line_iter)
            assert snapshot["type"] == "snapshot"
            assert len(snapshot["events"]) == 1
            assert snapshot["events"][0]["agent_id"] == "frank"
            assert snapshot["status"]["tip"] == 1

            # Give the SSE generator a beat to register its subscription
            # against the EventBus before we publish.
            await asyncio.sleep(0.1)

            # Now publish a new event. The hook fires on the store's loop
            # (which here is the test loop), the EventBus schedules onto the
            # uvicorn loop, the SSE generator consumes from its queue.
            await store.catch_up("alice")
            await store.publish("alice", "POSITION: AGPL")

            envelope = await asyncio.wait_for(_read_sse_message(line_iter), timeout=5.0)
            assert envelope["type"] == "event"
            assert envelope["event"]["agent_id"] == "alice"
            assert envelope["event"]["position"] == 2


async def _read_sse_message(line_iter) -> dict:
    """Read one SSE message (lines until blank), return the parsed `data` field."""
    data_parts: list[str] = []
    async for line in line_iter:
        if line == "":
            if data_parts:
                return json.loads("\n".join(data_parts))
            continue
        if line.startswith("data:"):
            data_parts.append(line[len("data:"):].lstrip())
        # ignore `id:`, `event:`, `:` (comment/ping) lines for assertion purposes
    raise RuntimeError("SSE stream ended without delivering a message")


def test_ensure_started_is_idempotent(store: EventStore) -> None:
    server = WebServer(store)
    try:
        port = _free_port()
        url1 = server.ensure_started(host="127.0.0.1", port=port)
        url2 = server.ensure_started(host="127.0.0.1", port=port)
        assert url1 == url2
    finally:
        server.stop()


def test_event_store_hook_callback_fires(store: EventStore) -> None:
    """Sanity: the store invokes on_event_published after the lock releases."""
    captured: list = []
    store.set_on_event_published(lambda e: captured.append(e))

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(store.catch_up("frank"))
        loop.run_until_complete(store.publish("frank", "POSITION: MIT"))
    finally:
        loop.close()

    assert len(captured) == 1
    assert captured[0].agent_id == "frank"
    assert captured[0].position == 1


async def test_reset_hook_fires(store: EventStore) -> None:
    captured: list = []
    store.set_on_reset(lambda p: captured.append(p))
    await store.reset(per_agent_event_limit=42)
    assert captured == [{"per_agent_event_limit": 42}]


async def test_moderator_post_prepends_prefix(web_server, store: EventStore) -> None:
    _server, url = web_server
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{url}/api/moderator",
            json={"text": "the agents should focus"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["position"] == 1

    events = await store.list_events()
    assert len(events) == 1
    assert events[0]["agent_id"] == "moderator"
    assert events[0]["text"] == "MODERATOR: the agents should focus"


async def test_moderator_post_preserves_existing_prefix(
    web_server, store: EventStore
) -> None:
    _server, url = web_server
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{url}/api/moderator",
            json={"text": "MODERATOR: shut up alice"},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    events = await store.list_events()
    assert events[0]["text"] == "MODERATOR: shut up alice"


async def test_moderator_post_preserves_other_prefixes(
    web_server, store: EventStore
) -> None:
    _server, url = web_server
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{url}/api/moderator",
            json={"text": "CONVERGENCE: alice and bob both agree on X"},
        )
        assert resp.status_code == 200

    events = await store.list_events()
    assert events[0]["text"] == "CONVERGENCE: alice and bob both agree on X"


async def test_moderator_post_counts_against_limit(store: EventStore) -> None:
    await store.reset(per_agent_event_limit=1)
    server = WebServer(store)
    try:
        port = _free_port()
        url = server.ensure_started(host="127.0.0.1", port=port)

        async with httpx.AsyncClient(timeout=5.0) as client:
            r1 = await client.post(f"{url}/api/moderator", json={"text": "first"})
            r2 = await client.post(f"{url}/api/moderator", json={"text": "second"})

        d1 = r1.json()
        d2 = r2.json()
        assert d1["success"] is True
        assert d2["success"] is False
        assert d2["error"] == "event_limit_reached"
    finally:
        server.stop()


async def test_get_recent_does_not_mutate_positions(store: EventStore) -> None:
    await store.catch_up("frank")
    await store.publish("frank", "a")
    await store.publish("frank", "b")

    before = await store.status()
    recent = await store.get_recent(since=1)
    after = await store.status()

    assert before["agents"] == after["agents"]
    assert [e["position"] for e in recent] == [2]


# Suppress the synchronous-test asyncio_mode auto fixture noise
test_event_bus_drops_oldest_on_full_queue.__test__ = True
