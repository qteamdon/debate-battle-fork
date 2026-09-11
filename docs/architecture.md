# Architecture

How the live debate system fits together: one event store, two event loops, and a strict boundary between what agents see and what humans see.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   Claude Code (debate skill)                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Debater agents   │  │ Strawman         │  │ Summariser    │  │
│  │ (mixed models)   │  │ (web search)     │  │               │  │
│  │ catch_up,publish │  │ catch_up,publish │  │ get_recent,   │  │
│  └────────┬─────────┘  └────────┬─────────┘  │ post_summary  │  │
│           │                     │            └────────┬──────┘  │
└───────────┼─────────────────────┼─────────────────────┼─────────┘
            │  MCP tools (stdio)  │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  debate-event-store process                     │
│                                                                 │
│  EventStore ──hooks──► EventBus ──multiplexed SSE──► FastAPI    │
│  (asyncio lock,        (event / summary /           (uvicorn in │
│   append-only log)      reset channels)              daemon     │
│                                                      thread,    │
│                                                      :8770)     │
│                                                        │        │
│                                                        ▼        │
│                                              Browser SPA        │
│                                              React + MobX + D3  │
└─────────────────────────────────────────────────────────────────┘
```

The MCP stdio server and the FastAPI web server share a single `EventStore` but run on **separate asyncio event loops**. FastAPI lives in a daemon thread; an `EventBus` bridges store mutations from the MCP loop to per-client SSE subscribers on the uvicorn loop via `asyncio.run_coroutine_threadsafe`. Each SSE client gets its own `asyncio.Queue`; the bus fans out to all of them.

The web server starts on demand (the `debate_visualize` MCP tool, idempotent) and binds to `127.0.0.1` only. No auth, no external exposure.

## The event/summary boundary

This is the load-bearing invariant of the whole design.

The **event log** is the agents' shared world. Everything a debater publishes lands there, and every debater sees it on their next `debate_catch_up`.

The **summary channel** is a side channel only humans see. The summariser subagent reads the stream statelessly via `debate_get_recent_events` and pushes commentary via `debate_post_summary`, which broadcasts to SSE and **never** writes to the event log. If summaries entered the log, debaters would see "the current tide is X" on their next catch-up: meta-commentary leaking into object-level argument, biasing the debate it describes.

`tests/test_end_to_end.py::test_summary_reaches_browser_but_not_event_log` asserts this boundary holds.

Why the summariser is a Claude Code subagent and not a Python background task: the orchestrator already spawns debaters and the strawman as subagents, so the summariser is a prompt, not a service. The debate clock is in the store (not a subagent). No `anthropic` dependency in the Python process, no API key plumbing; it reuses Claude Code's model auth.

## HTTP surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | The SPA shell (built assets ship in the repo and the wheel) |
| GET | `/api/status` | `{tip, event_count, agents, per_agent_event_limit}` |
| GET | `/api/events` | Full structured event list |
| GET | `/api/stream` | SSE: snapshot on connect, then envelopes below |
| POST | `/api/moderator` | Body `{text}`. Publishes to the event log as `agent_id="moderator"` |

The moderator endpoint is the UI's only write surface. Moderator events land in the log like any other event, so agents see them on their next catch-up. That's the point: the human operator can steer the debate mid-flight.

## SSE envelopes

```jsonc
{"type": "snapshot", "events": [...], "status": {...}, "summary": {...}}   // on connect
{"type": "event", "event": {"position": 42, "agent_id": "alice", "text": "...", "timestamp": 1700000000.0}}
{"type": "summary", "text": "...", "tensions": [...], "convergences": [...], "as_of_position": 42}
{"type": "verdict", "markdown": "..."}                                      // judge's final verdict
{"type": "final_position", "agent_id": "alice", "markdown": "..."}          // per-agent final stance
{"type": "reset", "per_agent_event_limit": 300}
```

The summary envelope also accepts an optional `momentum_adjustments` array:

```jsonc
"momentum_adjustments": [
  {"event_position": 36, "agent_id": "alice", "delta": 0.5,
   "takedown_blurb": "clean targeting of the prior-injection objection"}
]
```

The frontend applies these on top of its own instant scoring, deduped on `(event_position, agent_id)`. The base summariser prompt doesn't emit them; they're an opt-in enrichment hook.

## Momentum scoring

The chart never waits on a model. The frontend computes a basic momentum signal instantly from each event; the summariser can enrich later.

| Trigger | Frontend (instant) |
|---|---|
| REBUTTAL or CRITIQUE landed on @X | author +1, @X −1 |
| CONCEDE received | +2 |
| CONCEDE issued | −2 |
| CONVERGENCE issued (honest surfacing) | +0.5 |
| GROUNDING: VERIFIED on your claim | +0.5 |
| GROUNDING: DISPUTED on your claim | −1 |
| Grounding engaged within 2 events | +0.5 |

A takedown (a steelmanned rebuttal that visibly drops the target's momentum, or a received concede) emits a ⚡ marker on the timeline at the loser's line. Click it and the event stream jumps to the moment.

## The UI

Layout, top to bottom: header (topic, live badge, stats), then a three-column body, then the moderator inject footer.

- **Momentum & takedowns timeline** (centerpiece). X is wall-clock time, so lulls and bursts are visible. Y is signed momentum per agent, one line per agent coloured by role hue. Auto-scrolls to now; a scrubber replays history with the event stream synced to scrubber position.
- **Position graph** (right rail). Force-directed D3. Node mass = current momentum, so winners are physically heavier and pull the layout toward them. Fresh rebuttals are red springs pushing nodes apart; concedes are green springs snapping them together. No seeded positions: coalitions emerge or they don't.
- **Haiku Mind** (right rail). Current tide in 2-3 sentences, live tensions/convergences, and a strawman feed surfacing VERIFIED / DISPUTED / UNSUBSTANTIATED tags separately so they don't drown in the stream.
- **Event stream**. Reverse-chrono cards, type badges, mention chips, filter chips.
- **Agents rail** (left). Per-agent cards with budget burn bars and event-type breakdowns. Click any agent for a drill-down overlay: full timeline, engagement radial, an N×N rebuttal/concede heatmap, and a quality scorecard that regex-checks the debate rules (falsification clause present, rebuttals open with steelman, groundings engaged within 2 events, published in every third).
- **Results overlay**. Populated by the judge via `debate_set_final_position` (per-agent final stances, ranked) and `debate_set_verdict` (the full verdict markdown). This is the canonical home of "who won".

Three users drove the design: the **operator** running the debate (intervention timing, quality signals, moderator inject), the **spectator** who got sent the URL mid-debate (topic banner, Haiku Mind, takedown drama), and the **framework hacker** debugging whether agents actually follow the rules (drill-down, scorecard, heatmap). Every panel serves at least one of them; anything that didn't got cut.

## Frontend stack

Vite + React 18 + TypeScript + MobX 6 + tsyringe, MVVM-style: ViewModels are `*Store.ts` classes with `makeAutoObservable`, Views are `observer()` components, DI via `useResolve<T>(TOKEN)`.

D3 v7 is layout-only. A `ForceSimulationService` computes positions on each simulation tick into MobX observables; React owns the SVG and re-renders through `observer`. D3 never touches the DOM.

| Store | Owns |
|---|---|
| `ConnectionStore` | SSE connection state, reconnect |
| `EventStreamStore` | events, tip, computed by-agent/by-type/mention-graph |
| `AgentRosterStore` | per-agent state derived from the stream |
| `SummaryStore` | current tide, tensions, convergences, enrichment application |
| `MomentumStore` | per-agent momentum series, takedowns, instant scoring |
| `PositionGraphStore` | force simulation state, node mass from momentum |
| `TimelineViewStore` | scrubber, auto-scroll, back-to-live pill |
| `DrillDownStore` | focused agent, computed quality scorecard |
| `FiltersStore` / `ModeratorInputStore` | filter chips / inject input |

Built assets are committed at `web/static/dist/` and ship in the wheel, so neither plugin users nor `pip` users need a Node toolchain. Rebuild with `npm run build` in `web/frontend/` when you change the SPA.
