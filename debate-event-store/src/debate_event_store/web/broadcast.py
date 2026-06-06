"""EventBus: the only path from EventStore to SSE clients.

The store mutates on the MCP stdio asyncio loop; SSE generators run on the
uvicorn loop in a separate thread. Synchronous `publish_*` methods are called
from the MCP loop (via EventStore hooks) and schedule the async fan-out onto
the captured uvicorn loop using `asyncio.run_coroutine_threadsafe`.

Per-client queues are bounded; on overflow we drop the OLDEST item so newest
data wins for slow consumers. We never block the publisher.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Literal

logger = logging.getLogger(__name__)

Channel = Literal["event", "summary", "reset"]
DEFAULT_QUEUE_MAXSIZE = 256


class EventBus:
    def __init__(self, queue_maxsize: int = DEFAULT_QUEUE_MAXSIZE) -> None:
        self._queue_maxsize = queue_maxsize
        # subscribers per channel; each subscriber is its own asyncio.Queue
        self._subscribers: dict[Channel, set[asyncio.Queue]] = {
            "event": set(),
            "summary": set(),
            "reset": set(),
        }
        self._loop: asyncio.AbstractEventLoop | None = None

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Bind the uvicorn event loop. Called from the daemon thread once."""
        self._loop = loop

    @property
    def loop(self) -> asyncio.AbstractEventLoop | None:
        return self._loop

    def subscribe(self, channel: Channel) -> asyncio.Queue:
        """Called from a route handler (uvicorn loop). Returns a new queue."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._queue_maxsize)
        self._subscribers[channel].add(queue)
        return queue

    def unsubscribe(self, channel: Channel, queue: asyncio.Queue) -> None:
        self._subscribers[channel].discard(queue)

    def subscriber_count(self, channel: Channel) -> int:
        return len(self._subscribers[channel])

    def summary_subscriber_count(self) -> int:
        return len(self._subscribers.get("summary", set()))

    # ---- Sync entry points (called from the MCP loop / EventStore hooks) ----

    def publish_event(self, payload: dict) -> None:
        self._schedule("event", payload)

    def publish_summary(self, payload: dict) -> None:
        self._schedule("summary", payload)

    def publish_reset(self, payload: dict) -> None:
        self._schedule("reset", payload)

    def _schedule(self, channel: Channel, payload: dict) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            # No web server attached, or it was stopped. Normal when the store
            # is used without the visualisation server, or during teardown.
            return
        # Cross-loop dispatch: store mutates on the MCP loop, fan-out runs on
        # the uvicorn loop. run_coroutine_threadsafe is the only safe bridge.
        # We close the coroutine on failure so it doesn't surface as a
        # "coroutine was never awaited" RuntimeWarning during teardown races.
        coro = self._fanout(channel, payload)
        try:
            asyncio.run_coroutine_threadsafe(coro, loop)
        except RuntimeError as exc:
            coro.close()
            logger.debug("EventBus.schedule dropped %s: %s", channel, exc)

    async def _fanout(self, channel: Channel, payload: dict) -> None:
        subscribers = list(self._subscribers[channel])
        for queue in subscribers:
            _put_drop_oldest(queue, payload)


def _put_drop_oldest(queue: asyncio.Queue, payload: dict) -> None:
    """put_nowait with drop-oldest semantics on QueueFull.

    Standalone helper so tests can exercise the policy without spinning up a
    full EventBus.
    """
    while True:
        try:
            queue.put_nowait(payload)
            return
        except asyncio.QueueFull:
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                # Race: another consumer drained between Full and our get.
                # Loop and try the put again.
                continue
