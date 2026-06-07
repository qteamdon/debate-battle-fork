"""In-memory event store for the debate stream.

OCC (optimistic concurrency control) is enforced narrowly: only on
position-claim events (POSITION or ROLE declarations). The check forces
an agent staking out their unique slot to first read every prior
position-claim — that's how position uniqueness is enforced. They see
what's taken, pick a different angle.

Non-claim events (ARGUMENT, REBUTTAL, CONCEDE, CRITIQUE, CONVERGENCE,
GROUNDING, MODERATOR) bypass OCC entirely so the rest of the debate
can race ahead without thundering-herd retries.
"""

import asyncio
import re
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

MAX_TEXT_LENGTH = 1500

# Position-claim events stake out an agent's unique slot. POSITION is the
# obvious one; ROLE is the Negative-Nancy / frame-challenger / observer
# escape hatch — those agents declare a role instead of a position but
# still claim a unique slot.
_CLAIM_RE = re.compile(r"^\s*(POSITION|ROLE)\s*:", re.IGNORECASE)


def _is_claim_text(text: str) -> bool:
    return bool(_CLAIM_RE.match(text))


@dataclass
class Event:
    position: int
    agent_id: str
    text: str
    timestamp: float


class EventStore:
    def __init__(
        self,
        on_event_published: Callable[[Event], None] | None = None,
        on_reset: Callable[[dict], None] | None = None,
    ) -> None:
        self._lock = asyncio.Lock()
        self._events: list[Event] = []
        self._agent_positions: dict[str, int] = {}
        self._agent_publish_counts: dict[str, int] = {}
        self._per_agent_event_limit: int = 200
        # The judge's final verdict, stored alongside the event stream so the
        # browser/MCP layer doesn't have to chase a file on disk whose location
        # depends on whichever cwd the orchestrator happens to be running from.
        self._verdict_markdown: str | None = None
        # Per-agent final positions written by the judge after reading state
        # files. The initial POSITION event in the stream is the agent's
        # opening claim; this map carries the *final* synthesis (after
        # convergence, concessions, etc.) so the Results view shows where
        # each agent actually ended up rather than where they started.
        self._final_positions: dict[str, str] = {}
        self._on_event_published = on_event_published
        self._on_reset = on_reset
        self._on_verdict_set: Callable[[str], None] | None = None

    def set_on_event_published(self, callback: Callable[[Event], None] | None) -> None:
        self._on_event_published = callback

    def set_on_reset(self, callback: Callable[[dict], None] | None) -> None:
        self._on_reset = callback

    def set_on_verdict_set(self, callback: Callable[[str], None] | None) -> None:
        self._on_verdict_set = callback

    @property
    def verdict_markdown(self) -> str | None:
        return self._verdict_markdown

    @property
    def final_positions(self) -> dict[str, str]:
        # Shallow copy so callers can't mutate our internal state.
        return dict(self._final_positions)

    @property
    def per_agent_event_limit(self) -> int:
        return self._per_agent_event_limit

    @property
    def tip(self) -> int:
        return len(self._events)

    def _last_claim_position(self) -> int:
        """Return the position of the most recent POSITION/ROLE event, or 0."""
        for ev in reversed(self._events):
            if _is_claim_text(ev.text):
                return ev.position
        return 0

    async def publish(self, agent_id: str, text: str) -> dict:
        """Publish an event to the stream.

        OCC fires ONLY on position-claim events (POSITION or ROLE). The
        agent's read position must be at or beyond the most recent prior
        claim, so they've seen what's already taken and can pick a
        different angle. Non-claim events (ARGUMENT, REBUTTAL, etc.)
        bypass OCC entirely — the rest of the debate runs unthrottled.

        The check uses the *claim frontier* (position of the last
        POSITION/ROLE event), not the tip. Once all agents have claimed,
        the frontier stops moving and intervening ARGUMENT/REBUTTAL
        events do not force retries.
        """
        if len(text) > MAX_TEXT_LENGTH:
            return {
                "success": False,
                "error": "text_too_long",
                "max_length": MAX_TEXT_LENGTH,
            }

        async with self._lock:
            published = self._agent_publish_counts.get(agent_id, 0)

            # Check per-agent event limit
            if published >= self._per_agent_event_limit:
                return {
                    "success": False,
                    "error": "event_limit_reached",
                    "limit": self._per_agent_event_limit,
                    "published": published,
                }

            # OCC: only on claim events (POSITION / ROLE). The agent must
            # have caught up at least to the most recent prior claim, so
            # they've seen every position already taken and can pick a
            # different angle. The check uses the claim frontier, not the
            # tip, so ARGUMENT/REBUTTAL traffic between catch_up and
            # publish does not trigger a retry.
            if _is_claim_text(text):
                last_claim_pos = self._last_claim_position()
                agent_read_pos = self._agent_positions.get(agent_id, 0)
                if agent_read_pos < last_claim_pos:
                    return {
                        "success": False,
                        "error": "occ_conflict",
                        "agent_position": agent_read_pos,
                        "last_claim_position": last_claim_pos,
                        "tip": self.tip,
                        "detail": (
                            "Call debate_catch_up before claiming a "
                            "POSITION or ROLE. You must see every prior "
                            "claim so you can pick a different angle."
                        ),
                    }

            event = Event(
                position=self.tip + 1,
                agent_id=agent_id,
                text=text,
                timestamp=time.time(),
            )
            self._events.append(event)
            self._agent_positions[agent_id] = self.tip  # tip is now +1
            self._agent_publish_counts[agent_id] = published + 1
            remaining = self._per_agent_event_limit - (published + 1)

            result = {
                "success": True,
                "position": self.tip,
                "tip": self.tip,
                "remaining_events": remaining,
            }

        # Hook fires after the lock releases so subscribers cannot deadlock the store.
        if self._on_event_published is not None:
            try:
                self._on_event_published(event)
            except Exception:
                pass

        return result

    async def catch_up(self, agent_id: str) -> dict:
        """Return events since the agent's last read position, excluding its own.

        Updates the agent's read position to the current tip regardless of
        which events were filtered. Returns compact markdown to minimize
        context window consumption in LLM agents.
        """
        async with self._lock:
            prev_pos = self._agent_positions.get(agent_id, 0)
            new_events = [
                e for e in self._events[prev_pos:]
                if e.agent_id != agent_id
            ]
            self._agent_positions[agent_id] = self.tip

            if new_events:
                lines = [f"**{e.position}|{e.agent_id}:** {e.text}" for e in new_events]
                events_md = "\n".join(lines)
            else:
                events_md = "(no new events)"

            return {
                "events_markdown": events_md,
                "new_event_count": len(new_events),
                "tip": self.tip,
            }

    async def status(self) -> dict:
        """Return current debate stream status."""
        async with self._lock:
            return {
                "tip": self.tip,
                "event_count": self.tip,
                "agents": {
                    aid: {
                        "read_position": pos,
                        "events_published": self._agent_publish_counts.get(aid, 0),
                    }
                    for aid, pos in self._agent_positions.items()
                },
            }

    async def get_all_events(self) -> dict:
        """Return the complete event stream as compact markdown."""
        async with self._lock:
            if not self._events:
                return {"events_markdown": "(no events)", "tip": 0}

            lines = [f"**{e.position}|{e.agent_id}:** {e.text}" for e in self._events]
            return {
                "events_markdown": "\n".join(lines),
                "event_count": self.tip,
                "tip": self.tip,
            }

    async def dump_markdown(self, output_path: str) -> dict:
        """Format all events as markdown and write directly to disk."""
        async with self._lock:
            if not self._events:
                return {"success": False, "error": "no_events"}

            lines: list[str] = []
            lines.append("# Debate Transcript\n")
            lines.append(f"**Events:** {self.tip}  ")
            agents = sorted(self._agent_publish_counts.keys())
            lines.append(f"**Participants:** {', '.join(agents)}\n")
            lines.append("---\n")

            for e in self._events:
                ts = datetime.fromtimestamp(e.timestamp).strftime("%H:%M:%S")
                lines.append(f"### [{e.position}] {e.agent_id} — {ts}\n")
                lines.append(f"{e.text}\n")

            path = Path(output_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("\n".join(lines))

            return {
                "success": True,
                "path": str(path.resolve()),
                "event_count": self.tip,
            }

    async def reset(self, per_agent_event_limit: int = 200) -> dict:
        """Clear all events and agent positions for a new debate."""
        async with self._lock:
            self._events.clear()
            self._agent_positions.clear()
            self._agent_publish_counts.clear()
            self._per_agent_event_limit = per_agent_event_limit
            self._verdict_markdown = None
            self._final_positions.clear()
            result = {
                "success": True,
                "per_agent_event_limit": per_agent_event_limit,
            }

        if self._on_reset is not None:
            try:
                self._on_reset({"per_agent_event_limit": per_agent_event_limit})
            except Exception:
                pass

        return result

    async def set_final_position(self, agent_id: str, markdown: str) -> dict:
        """Store an agent's *final* position synthesis (post-convergence).

        Called by the judge after reading the agent's state file. The initial
        POSITION event in the stream is the agent's opening claim; this map
        carries where they actually ended up. Cleared on reset.
        """
        if not isinstance(agent_id, str) or not agent_id:
            return {"success": False, "error": "agent_id_required"}
        if not isinstance(markdown, str):
            return {"success": False, "error": "markdown_not_string"}
        async with self._lock:
            self._final_positions[agent_id] = markdown
        return {"success": True, "agent_id": agent_id, "length": len(markdown)}

    async def set_verdict(self, markdown: str) -> dict:
        """Store the judge's final verdict in-memory alongside the event stream.

        The web layer broadcasts a `verdict` SSE envelope so the results view
        updates without any disk roundtrip. Disk persistence is the caller's
        problem — this store deliberately does not write the verdict to a file.
        """
        if not isinstance(markdown, str):
            return {"success": False, "error": "markdown_not_string"}
        async with self._lock:
            self._verdict_markdown = markdown

        if self._on_verdict_set is not None:
            try:
                self._on_verdict_set(markdown)
            except Exception:
                pass

        return {"success": True, "length": len(markdown)}

    async def get_recent(self, since: int = 0) -> list[dict]:
        """Return events with position > since as plain dicts.

        Pure read; does not mutate any agent's read position. Suitable for the
        web layer's snapshot and the upcoming `debate_get_recent_events` tool.
        """
        async with self._lock:
            return [asdict(e) for e in self._events if e.position > since]

    async def list_events(self) -> list[dict]:
        """Return the full event list as plain dicts (web layer convenience)."""
        async with self._lock:
            return [asdict(e) for e in self._events]
