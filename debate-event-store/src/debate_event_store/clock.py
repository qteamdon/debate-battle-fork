"""Wall-clock checkpoints for a live debate.

Sleeping is not a reasoning job. This publishes the four ORCHESTRATOR
checkpoint events from the event-store process so no timer sub-agent
is required.
"""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .store import EventStore

ORCHESTRATOR_ID = "orchestrator"

# Keep these strings stable. Debaters, the strawman, the summariser, and
# the collector all watch for "Time is up".
CHECKPOINT_MESSAGES: tuple[tuple[float, str], ...] = (
    (
        0.33,
        "ORCHESTRATOR: 33% elapsed. Every agent should have published by now. Silent agents will be flagged by the judge.",
    ),
    (
        0.66,
        "ORCHESTRATOR: 66% elapsed. If your conclusion matches another agent's, publish a CONVERGENCE event identifying the residual disagreement. Surface-level synthesis is a failure mode.",
    ),
    (
        0.85,
        "ORCHESTRATOR: 85% elapsed. Final arguments. Revisit your falsification criteria — has any evidence hit it?",
    ),
    (
        1.0,
        "ORCHESTRATOR: Time is up. All agents must yield.",
    ),
)

MAX_DURATION_SECONDS = 3600.0
MIN_DURATION_SECONDS = 0.05


class DebateClock:
    """One asyncio task. Reset cancels it. A second start while running is a no-op."""

    def __init__(self, store: EventStore) -> None:
        self._store = store
        self._task: asyncio.Task[None] | None = None
        self._duration_seconds: float | None = None
        self._started_monotonic: float | None = None
        self._finished = False
        self._published: list[float] = []

    def snapshot(self) -> dict:
        running = self._task is not None and not self._task.done()
        return {
            "running": running,
            "finished": self._finished,
            "duration_seconds": self._duration_seconds,
            "published_fractions": list(self._published),
        }

    async def start(self, duration_seconds: float) -> dict:
        try:
            duration = float(duration_seconds)
        except (TypeError, ValueError):
            return {"success": False, "error": "invalid_duration"}
        if duration < MIN_DURATION_SECONDS:
            return {
                "success": False,
                "error": "duration_too_short",
                "min_seconds": MIN_DURATION_SECONDS,
            }
        if duration > MAX_DURATION_SECONDS:
            return {
                "success": False,
                "error": "duration_too_long",
                "max_seconds": MAX_DURATION_SECONDS,
            }

        if self._task is not None and not self._task.done():
            return {
                "success": True,
                "already_running": True,
                "duration_seconds": self._duration_seconds,
                "published_fractions": list(self._published),
            }

        if self._finished:
            return {
                "success": False,
                "error": "clock_finished",
                "detail": "Call debate_reset before starting a new clock.",
            }

        self._duration_seconds = duration
        self._started_monotonic = time.monotonic()
        self._published = []
        self._finished = False
        self._task = asyncio.create_task(self._run())
        return {
            "success": True,
            "already_running": False,
            "duration_seconds": duration,
            "checkpoints": [frac for frac, _ in CHECKPOINT_MESSAGES],
        }

    async def cancel(self) -> dict:
        task = self._task
        self._task = None
        self._duration_seconds = None
        self._started_monotonic = None
        self._finished = False
        self._published = []
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        return {"success": True, "cancelled": True}

    async def _run(self) -> None:
        assert self._duration_seconds is not None
        assert self._started_monotonic is not None
        start = self._started_monotonic
        duration = self._duration_seconds
        try:
            for fraction, text in CHECKPOINT_MESSAGES:
                delay = (start + duration * fraction) - time.monotonic()
                if delay > 0:
                    await asyncio.sleep(delay)
                result = await self._store.publish(ORCHESTRATOR_ID, text)
                if result.get("success"):
                    self._published.append(fraction)
            self._finished = True
        except asyncio.CancelledError:
            raise
