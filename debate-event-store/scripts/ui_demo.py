"""Standalone UI smoke. Starts the embedded web server, publishes a small
canned debate sequence, then keeps the server alive so you can browse the SPA.

Usage:
    uv run python -m debate_event_store.scripts.ui_demo

Or, from the repo root:
    cd debate-event-store && uv run python scripts/ui_demo.py

Then open http://127.0.0.1:8770 in a browser.

The sequence exercises every panel in the UI: positions trigger the agents
rail; rebuttals + concedes drive momentum and emit a takedown; a grounding
event populates the strawman feed; a moderator inject lands with the magenta
accent; a fake haiku summary lands in the Haiku Mind panel.
"""

from __future__ import annotations

import asyncio
import signal

from debate_event_store.store import EventStore
from debate_event_store.web.server import WebServer


CANNED_EVENTS: list[tuple[str, str]] = [
    ("alice", "POSITION: MIT is best. Falsification: if a single major project switches from MIT to AGPL citing freedom, that weakens my claim."),
    ("bob", "POSITION: AGPL preserves user freedom. Falsification: if AGPL kills enterprise adoption of a project we both rate as important, AGPL fails."),
    ("eve", "ROLE: Negative Nancy. I will critique both positions and refuse to advocate."),
    ("alice", "ARGUMENT: MIT has 3x enterprise PR adoption vs AGPL according to GitHub data."),
    ("bob", "REBUTTAL @alice: Steelman: you read enterprise PR count as health. But that is selection bias — enterprises pick MIT because it lets them extract value, not because it serves users."),
    ("alice", "GROUNDING: VERIFIED 3x enterprise PRs (re: #4 by @alice)"),
    ("eve", "CRITIQUE @alice: Steelman: enterprise PR volume is a signal. But it does not address bob's user-freedom argument at all."),
    ("alice", "CONCEDE @bob: fair point on selection bias — adoption volume is not user benefit."),
    ("moderator", "MODERATOR: focus on the user-facing licensing concerns, not the corporate adoption framing."),
    ("bob", "CONVERGENCE: alice and bob both agree adoption volume is not a proxy for user benefit."),
]


async def main() -> None:
    store = EventStore()
    web = WebServer(store)
    url = web.ensure_started(port=8770)

    print()
    print("=" * 60)
    print(f"  Live Debate UI demo running at: {url}")
    print("  Open that URL in a browser.")
    print(f"  Publishing {len(CANNED_EVENTS)} canned events with a 600ms gap.")
    print("  Ctrl-C to stop the server.")
    print("=" * 60)
    print()

    # Each agent's first publish needs a catch_up to claim its position
    # (OCC). Subsequent publishes by the same agent go through immediately.
    seen: set[str] = set()
    for i, (agent_id, text) in enumerate(CANNED_EVENTS, start=1):
        if agent_id not in seen:
            await store.catch_up(agent_id)
            seen.add(agent_id)
        result = await store.publish(agent_id, text)
        if not result.get("success"):
            print(f"  ! event {i} failed: {result}")
        else:
            print(f"  event {i}: {agent_id} -> {text[:60]}{'...' if len(text) > 60 else ''}")
        await asyncio.sleep(0.6)

    # Drop a fake summary through the EventBus so the Haiku Mind panel fills
    # in. In production this comes from the summariser subagent calling
    # debate_post_summary; here we go directly to the bus to keep the demo
    # self-contained.
    web.event_bus.publish_summary({
        "type": "summary",
        "text": "Alice and Bob have reframed adoption volume as a poor proxy for user benefit. Eve is keeping both honest.",
        "tensions": [{"a": "alice", "b": "bob", "topic": "what counts as success"}],
        "convergences": [{"agents": ["alice", "bob"], "topic": "adoption is not user benefit"}],
        "as_of_position": store.tip,
    })
    print()
    print("  Canned sequence delivered. Server stays alive — browse the UI.")
    print()

    # Keep the process alive until Ctrl-C. The daemon-thread uvicorn server
    # exits when the process does.
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()
    web.stop()
    print("  bye.")


if __name__ == "__main__":
    asyncio.run(main())
