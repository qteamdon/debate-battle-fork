# debate-battle

Real-time multi-agent debate for Claude Code. Event-sourced, fact-checked in-flight, independently judged, and watchable live in your browser.

## The Problem

LLMs are sycophants. Ask one to brainstorm and it validates everything. Ask it to critique and it pulls punches. Ask it to play devil's advocate and it builds a straw man just to knock it down for you. Every idea is a good idea. AI psychosis ensues.

This isn't a prompting problem. It's a training problem. Models optimise for human preference, and humans prefer agreement. Single-agent ideation is an echo chamber with better grammar.

You can't prompt your way out of a reward function.

## What's new

The 6-agent live debate is still here. These changes make it cheaper to use, easier to read, and easier to keep.

| What | Why | How to use |
|---|---|---|
| **cross-check** skill | You already have a view. You want it attacked, not rewritten. | `/debate-battle:cross-check We should ship X next quarter.` |
| **lean** (unchanged idea) | You want a recommendation written, then attacked. | `/debate-battle:lean Should we ship X?` |
| **Short briefing** | The old judge write-up was a wall of text. | Every skill now answers in the same six headings. Rankings stay in an appendix / the Results overlay. |
| **Clock in the store** | The timer was an LLM that slept. Cheap models skipped the sleeps. | The skill starts `debate_start_clock`. You do not spawn a timer agent. |
| **Research scale** | A 6-agent show is too much for "go deep". | `/debate-battle:debate scale=research Go deep: should we ship X?` |
| **Findings file** | People copied the answer out of chat. There was no flag they missed. | Default on. Look for `Saved to: debate-workspace/findings/YYYYMMDD - slug-n.md`. Say `write_findings=false` to skip. |
| **OpenCode** | The plugin was Claude Code only. | From a clone: `opencode`. Pin cheap models in `opencode.json` if you want. |

Short notes on why each change was made live in [`docs/decisions/`](docs/decisions/).

## The Fix

Don't ask one model to disagree with itself. Spawn six agents with incompatible reasoning frameworks, force them to argue through a shared append-only event stream, fact-check them in real time, and let an independent judge rank what survives.

Disagreement has to be structural, not prompted. An empiricist and a rationalist reach different conclusions from the same evidence because their frameworks are incompatible, not because one was told to be contrarian.

## Install

### Claude Code

Inside Claude Code:

```
/plugin marketplace add utilitydelta/debate-battle
/plugin install debate-battle@debate-battle
```

Requires [uv](https://docs.astral.sh/uv/) on your PATH. The plugin registers the bundled MCP event store automatically; the web UI ships pre-built, no Node toolchain needed.

### OpenCode

**Purpose.** Run the same skills outside Claude Code, including on cheaper or local models.

**Implementation.** `opencode.json` starts the event store as a local MCP server named `debate-events`. `.opencode/skills/` symlinks to `skills/` so OpenCode can load them. Named subagents `debate-worker`, `debate-research`, and `debate-editor` are hidden; pin cheap models on the first two in `opencode.json` if you want. Spawn notes are in `skills/*/hosts/opencode.md`. The Claude plugin files are unchanged.

**How to use.** From a clone of this repo, with `uv` on your PATH:

```
opencode
```

Then ask for a cross-check, a lean review, or a debate. Say `scale=research` if you want the small roster. Open http://127.0.0.1:8770 for a live debate.

If MCP tools show up as `debate-events_debate_publish`, use those names. Do not pass `model: "sonnet"`.

You get three skills:

| Skill | What it does | Cost |
|---|---|---|
| `/debate-battle:cross-check` | Pressure-test a position you already have. Two blind reviewers, one short briefing. Files only | ~2–4x single agent |
| `/debate-battle:lean` | Adversarial review. One analyst drafts, two blind reviewers attack, a fresh reviser integrates. Files only | ~3-5x single agent |
| `/debate-battle:debate` | The full battle. 2-10 debaters, strawman researcher, blind-spot finder, live visualization, judge | ~12-20x single agent |

Pick `cross-check` if you already have a view. Pick `lean` if you want a recommendation written, then attacked. Pick `debate` if the question itself is contested and you want disagreement kept.

### `cross-check`

**Purpose.** Attack a view you already hold. Do not rewrite it first.

**Implementation.** The orchestrator copies your words into `debate-workspace/cross-check/00-user-position.md`. A researcher and a frame-challenger attack that file in parallel, blind to each other. A third agent writes a short briefing. No live UI. No event store. Three agent calls.

**How to use.**

```
/debate-battle:cross-check We should migrate the monolith to microservices next quarter. Materials in ./docs
```

State the position in the same message. If you only name a topic, the skill will ask. Output lands in `debate-workspace/cross-check/`.

### `lean`

**Purpose.** Produce a deployable recommendation that has survived two independent attacks.

**Implementation.** One analyst writes a draft. A researcher and a frame-challenger attack it in parallel, blind to each other. A fresh reviser integrates. Files only. Four agent calls.

**How to use.**

```
/debate-battle:lean Should we migrate the monolith to microservices? Materials in ./docs
```

Output lands in `debate-workspace/lean/`. The file that matters is `04-final-memo.md`.

### `debate`

**Purpose.** Expose structural disagreement on a contested question. Keep named residual disagreements. Watch it live.

**Implementation.** Spawns 2–10 debaters (default 6) plus a strawman researcher, a blind-spot finder, a summariser, a collector, and a judge. The event store runs the debate clock (no timer agent). They argue through the MCP event store. The browser UI is at http://127.0.0.1:8770.

**How to use.**

```
/debate-battle:debate Should we migrate the monolith to microservices? Materials in ./docs
```

Open http://127.0.0.1:8770 before agents start publishing. `cross-check` and `lean` do not use this UI.

### Research scale

**Purpose.** Go deep on a bigger idea without a 6-agent crowd. Keep disagreement. Spend fewer tokens.

**Implementation.** Same event store and short briefing as arena. Roster is one tension pair plus a frame-challenger plus the strawman. Hard cap is 20 events per agent. Every seat uses `sonnet`. No blind-spot finder. The store clock is only a backstop; agents should stop after one POSITION and about four follow-ups.

**How to use.**

```
/debate-battle:debate scale=research Go deep: should we migrate the monolith to microservices?
```

Or say "research mode" / "go deep" in the request. Default with no hint is still the 6-agent arena.

## What you get back

Chat from every skill is a short briefing, in this order:

1. What Survived
2. What To Challenge
3. Killshot
4. Framing
5. Residual Disagreement
6. Next Steps

Rankings, process scores, and event stats stay in an appendix. For a live debate they also land in the Results overlay. They do not get pasted into chat.

The briefing above the appendix must stay under 600 words. A sample is in [`docs/fixtures/sample-debate-briefing.md`](docs/fixtures/sample-debate-briefing.md).

### Findings file

**Purpose.** Keep the briefing on disk so you do not have to copy-paste out of chat. This is on by default. You were not missing a flag before — the old skills did not write a dated file.

**Implementation.** After the briefing is shown, the orchestrator writes the same six headings to `debate-workspace/findings/`. The name is `{YYYYMMDD} - {slug}-{n}.md`. `slug` is the query, lowercase, letters and digits, max 20 characters. `n` is 1, then 2 if that name already exists. `python3 scripts/findings_filename.py --topic "..."` builds the path. Say `write_findings=false` to skip.

**How to use.** Run a skill as usual. At the end you should see `Saved to: debate-workspace/findings/20260911 - should-we-migrate-th-1.md`. That folder is gitignored.

No topic handy? Populate every UI panel with a canned debate:

```bash
cd debate-event-store
uv run python scripts/ui_demo.py
```

## Does It Actually Work?

Tested against a single-agent baseline on the same topics with the same materials. Three experiments, n=3, so treat this as suggestive rather than conclusive. Full writeup in [`docs/lean-mode-findings.md`](docs/lean-mode-findings.md).

**Open-research topics: yes, decisively.** Evaluating a surf-school business pitch, the debate's strawman researcher found that Surf Life Saving Queensland already runs the same product for free, state-wide. That one fact falsified the pitch's load-bearing "nobody is chasing this market" claim and demolished the debate's only conditional-GO position. The single-agent baseline ran web searches too and missed it, because it was scanning commercial competitors, not government programs.

**Structured-evidence topics: roughly a tie.** Analysing a draft e-bike bill where every source document was on disk, debate and baseline reached the same verdict. The debate produced sharper framings; the baseline produced a more deployable memo. When the materials are complete, one agent is usually enough.

**The surprise: lean review beat the full debate on its own turf.** Re-running the surf-school evaluation, the four-agent lean pipeline found a killshot neither the full debate nor the baseline surfaced: the council's surf-school permit window was closed for 14 months, so the founder couldn't legally operate at all. Attacking a static draft turns out to be sharper than fact-checking a moving stream, because a reviewer can interrogate what the draft *assumed*, not just what agents *claimed*. At ~26% of the full debate's token cost. One run, so hold it loosely.

So: reach for `cross-check` when you already have a view and want it attacked. Reach for `lean` when you need a deployable recommendation written and then pressure-tested. Reach for `debate` when the framing itself is contested and you want disagreement exposed and preserved, not resolved away.

## How a Debate Runs

The orchestrator parses your topic, builds a roster, and spawns everything in parallel:

- **Debaters** (2-10, default 6) in epistemic tension pairs: empiricist vs rationalist, precautionary vs accelerationist, consequentialist vs deontologist, practitioner vs systems-thinker. Plus a frame-challenger whose whole job is attacking the premise of the debate itself.
- **Strawman researcher.** The grounding layer. Pre-researches the topic, then monitors the stream and publishes `GROUNDING:` events: VERIFIED, DISPUTED, UNSUBSTANTIATED. An agent that keeps pushing a DISPUTED claim is visibly arguing in bad faith, and the judge notices.
- **Blind-spot finder.** A meta-observer. Every ~10 events it publishes one critique naming what both sides of the dominant tension are taking for granted.
- **Summariser.** Feeds the live UI's "Haiku Mind" panel through a side channel the debaters never see.
- **Clock.** The event store, not an LLM, publishes warnings at 33%, 66%, 85%, and time-up.

### Debate clock

**Purpose.** Mark thirds of the debate window without spending a model on sleep.

**Implementation.** `debate_start_clock` starts an asyncio task in the event-store process. It publishes four `ORCHESTRATOR:` events. A second start while it is running is a no-op. `debate_reset` cancels it.

**How to use.** The `debate` skill calls it in Phase 2. You do not start it by hand unless you are driving the store yourself:

```
debate_start_clock duration_minutes=5
```

Roles get different models on purpose. Same model plus opposing frameworks produces stylistically similar arguments. Different models plus opposing frameworks produces real disagreement.

Agents never see the roster. Each one gets only its own briefing and discovers the others' frameworks by reading POSITIONs as they land. Telling an agent who its rival is would script the disagreement instead of letting it emerge.

When time is up, a collector reaps the background agents and a judge reads the full transcript. Chat gets the short briefing above. Rankings and process scores go to the Results overlay as an appendix.

## The Hard Rules

Naive multi-agent debates converge by event 30 and spend the remaining 60 events relabelling the same consensus. The orchestration is engineered against that failure mode:

1. **Falsification on POSITION.** Every position must state what evidence would kill it. A position without an escape hatch is a belief, not an argument.
2. **Steelman before rebuttal.** Every REBUTTAL opens with the strongest version of the target's claim. Strawmanning is a process violation.
3. **Convergence discipline.** Two agents who notice they agree must publish the disagreement that remains underneath. Surface synthesis is a failure state.
4. **No unearned "it depends".** Context-dependent positions need a decision rule: if X then Y, else Z.
5. **Minimum participation.** Publish in every third of the window or the judge ranks you last.

The judge scores rule compliance, framework fidelity, and grounding engagement. Not persuasiveness. It judges from a bias-redacted roster, with an optional two-pass mode that scores argument merit on anonymised events before deanonymising for process compliance.

## Two Debate Modes

| Mode | Divergence axis | When |
|---|---|---|
| `epistemic` (default) | Reasoning framework | Technical, scientific, evidence-heavy topics |
| `dnd` | D&D moral alignment as load-bearing identity | Ethics, policy, values. The fight is over what should be done, not what the evidence says |

In `dnd` mode the alignments argue from their values: Lawful Good cites consensus and protects the vulnerable, Chaotic Neutral defends whichever side is underdefended, Lawful Evil finds the lever and pulls it. Axis-contrast pairs (LG vs CN, NG vs NE) produce sharper debate than cartoon opposites.

In `epistemic` mode a random alignment is still rolled per debater, but as rhetorical posture only. It colours how the agent argues, not what it argues for. Keeps the stream from reading like a methodology lecture.

## The Live UI

The orchestrator starts an embedded FastAPI + SSE server on 127.0.0.1:8770. Loopback only.

- **Momentum timeline.** The centerpiece. Who's pulling ahead, takedowns marked with ⚡ as they land, replay scrubber.
- **Position graph.** Live force-directed map of conflicts and coalitions. Momentum is node mass; concedes snap nodes together.
- **Haiku Mind.** The current tide in a few sentences, regenerated live, plus a strawman fact-check feed.
- **Drill-down.** Click an agent for their full timeline plus a quality scorecard: did they steelman, did they engage groundings.
- **Moderator inject.** The one write surface. Steer the debate mid-flight; agents see your event on their next catch-up.
- **Results overlay.** Final rankings and the judge's verdict, pushed live when judging completes.

Architecture notes in [`docs/architecture.md`](docs/architecture.md).

## Why an Event Store

Debates are sequential and adversarial. Event sourcing buys four things:

- **Immutability.** A published argument can't be quietly revised. Sycophantic drift leaves a trail.
- **Total ordering.** The judge reconstructs not just what was argued but when, and which rebuttals landed.
- **Per-agent cursors.** Agents catch up at their own pace and never re-read their own events. Context windows stay small.
- **Replayability.** One log feeds every post-hoc analysis: momentum scoring, position drift, consensus velocity.

The store is in-memory, single-process, behind one asyncio lock. Debates produce hundreds of events, not millions. Optimising throughput here solves a problem that doesn't exist.

## Repo Layout

| Path | What |
|---|---|
| `skills/debate/` | The full-battle orchestrator. This is the product; the store is plumbing |
| `skills/debate/prompts/` | Host-agnostic agent briefs. `SKILL.md` reads these and fills them. |
| `skills/debate/hosts/` | Spawn recipes per host. Claude and OpenCode are both documented. |
| `skills/lean/` | The lean adversarial-review pipeline |
| `skills/cross-check/` | Pressure-test a position the user already has |
| `docs/decisions/` | Short notes on why a change was made |
| `docs/fixtures/` | Sample briefing used to check length and heading order |
| `debate-event-store/` | The MCP server: event store, FastAPI + SSE web server, React SPA |
| `.mcp.json` | Registers the bundled MCP server when the plugin is installed |
| `docs/` | Architecture and the comparative experiment findings |

### Shared prompts

**Purpose.** Keep agent briefs free of Claude `Task` calls so another host can reuse them.

**Implementation.** Each skill folder has `prompts/` (the briefs) and `hosts/` (how to spawn). `SKILL.md` still runs the phases. It reads the prompt files and fills `{placeholders}`. Claude spawn recipes live in `hosts/claude.md`. OpenCode spawn recipes live in `hosts/opencode.md`.

**How to use.** Do not paste a shorter brief. Read the file named in `SKILL.md` and send that text to the sub-agent.

## Development

```bash
python3 scripts/validate_skills.py
python3 scripts/test_findings_filename.py

cd debate-event-store
uv venv .venv && source .venv/bin/activate
uv pip install -e ".[dev]"
pytest -v
```

Frontend changes: `npm run build` in `debate-event-store/src/debate_event_store/web/frontend/` (the built bundle is committed so consumers don't need Node).

## License

MIT. See `LICENSE`.
