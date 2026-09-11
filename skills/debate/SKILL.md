---
name: debate
description: Run a multi-agent debate battle on a contested topic or decision. Spawns debaters with incompatible reasoning frameworks, a fact-checking strawman researcher, and a blind-spot finder, arguing through a shared event stream with a live browser visualization and an independent judge. Use when the user wants a debate, wants a decision battle-tested, or asks for adversarial analysis of a contested question.
---

# Debate Battle Orchestrator

You are the orchestrator for a multi-agent debate designed to surface **structural disagreement and epistemic crises** — not to converge on a polite synthesis. Left to their own devices, multi-agent debates converge by event 30 and spend the remaining 60 events relabeling the same consensus. This orchestration is engineered against that failure mode.

**When NOT to use this skill:** if the user needs a single deployable recommendation that has survived adversarial review (rather than disagreement exposed and preserved), use the `lean` skill instead — one analyst, two blind reviewers, one reviser, ~3-5x single-agent token cost instead of ~12-20x. If the user already has a position and wants that view attacked (not rewritten), use the `cross-check` skill instead.

**Design principles (non-negotiable):**

1. **Epistemic tension over moral persona.** Agents are assigned *incompatible reasoning frameworks* (empiricist/rationalist, precautionary/accelerationist, consequentialist/deontologist, systems-thinker/reductionist, practitioner/theorist). D&D moral alignment does not change how a model reasons from evidence. Epistemic method does.
2. **A dedicated frame-challenger.** One agent's job is to interrogate the debate's premise itself. If the topic is "what's the best X," this agent asks whether X is even the right unit of analysis.
3. **Mandatory falsification criteria.** Every POSITION event must include what evidence would cause the agent to abandon it. No position without an escape hatch. This prevents "I was right all along" theater.
4. **Steelman before rebuttal.** Every REBUTTAL must begin with a one-sentence steelman of the target's position. Strawmanning is a process violation.
5. **Anti-convergence rule.** When two agents notice they agree, they must publish a CONVERGENCE event identifying the *remaining* disagreement beneath the surface agreement. Labels-disagreement-only is a failure state.
6. **Minimum participation.** Every agent must publish events in each third of the debate window. Silent dropout is penalized by the judge.
7. **No "it depends" terminal answers.** Context-dependent positions are allowed but must commit to a decision rule: "*if* condition X *then* action Y." "It depends on the situation" without a decision function is disqualified.
8. **The strawman researcher is the MVP.** Preserve and strengthen. Grounding events are treated as authoritative.
9. **Model heterogeneity drives style divergence.** Agents in opposing tension pairs get DIFFERENT model aliases (opus/sonnet) so the reasoning style differs at the substrate, not just the prompt. Same-model debaters tend to converge stylistically even when their frameworks oppose.
10. **A meta-observer exists.** The blind-spot finder is a non-debater whose job is to surface premises both sides accept silently. Bug-light for the kinds of failures a tension pair can't see from inside.

**Host files:** spawn recipes are in `skills/debate/hosts/claude.md` (Claude Code) or `skills/debate/hosts/opencode.md` (OpenCode). If `$ARGUMENTS` and `TaskOutput` exist, you are on Claude. Otherwise you are on OpenCode. Agent briefs are in `skills/debate/prompts/`. Read those files when you fill a Task prompt. Do not shorten them.

**Context budget:** Your job is to spawn agents, delegate collection and judging, and present the summary. You must NEVER call `TaskOutput` or read state files yourself. All heavy lifting is delegated to sub-agents (collector, judge). The full transcript is dumped to a markdown file via `debate_dump_markdown` and the judge reads it from disk — there is no in-band MCP tool to fetch the full stream. Ensure agents have permissions to write files, and have the ability to use any semantic search mcp tooling in the current environment.

## User Request

$ARGUMENTS

## Phase 1 — Parse Inputs

Extract these from the user request above. Ask the user if the **topic** is missing or unclear.

| Parameter | Default |
|-----------|---------|
| `topic` | *(required)* |
| `scale` | `arena` (alternative: `research` — see Scale below) |
| `mode` | `epistemic` (alternative: `dnd` — see Phase 3 fork below) |
| `materials_path` | current working directory |
| `agent_count` | 6 for arena (min 2, max 10). 3 for research. |
| `time_limit_minutes` | 5 (backstop). Research also stops on event budget. |
| `judging_criteria` | "strongest grounded position that survives adversarial engagement, with explicit falsification criteria and practical decision rules" |
| `per_agent_event_limit` | 300 for arena. 20 for research. |
| `write_findings` | `true` — save the briefing to a dated file so you do not have to copy-paste |

**Scale choice** (`scale` is not `mode`. `mode` is still epistemic vs dnd):

| Scale | What | When |
|---|---|---|
| `arena` (default) | Today's 6-agent live show. Clock + high event cap. | Contested framing. User asked for a debate / battle. |
| `research` | One tension pair + frame-challenger + strawman. Event budget stop. No blind-spot finder. Cheap models. | "Go deep", "research mode", a bigger idea, not a spectator fight. |

If the user says "go deep", "research this", or "research mode", set `scale = research`. If they say "debate", "battle", or "6 agents", set `scale = arena`.

**Research defaults (apply before Phase 2, and they beat every later table in this file):**

- `agent_count = 3` (one tension pair + frame-challenger). Do not add extra pairs.
- `per_agent_event_limit = 20` on `debate_reset`.
- Soft budgets: pair members 8, frame-challenger 12, strawman 20.
- Models: `sonnet` for every seat. Do not assign `opus`.
- Skip the blind-spot finder.
- Still start `debate_start_clock` as a backstop. Agents should yield after 1 POSITION and about 4 follow-ups, or when the clock says time is up, whichever comes first.
- Presentation is the same short briefing as arena.

**Mode choice:**

| Mode | Divergence axis | Best for |
|---|---|---|
| `epistemic` (default) | Reasoning framework (empiricist / rationalist / etc.) | Technical, scientific, engineering, evidence-heavy topics |
| `dnd` | D&D moral alignment as load-bearing identity | Ethics, policy, values, "what should we do" topics |

In `dnd` mode the alignment IS the agent's primary identity (not just decoration). Pairs are constructed from alignments that contrast on at least one axis. The epistemic roles aren't used.

**Why 6 is the default:** three agents produce too little friction; nine produce streams too long for argumentation-graph judging. Six agents = three tension pairs + frame-challenger, which is the sweet spot for structural disagreement without stream bloat.

**Agent-count guide:**

| `agent_count` | What it gives you | When to pick it |
|---|---|---|
| **2** | One tension pair, no frame-challenger | A/B comparison, tight focus on one axis, cheap iteration |
| **3** | One tension pair + frame-challenger | Same as 2 but you want the premise interrogated too |
| **4** | Two tension pairs, no frame-challenger | Two axes live, no meta-questioning |
| **5** | Two pairs + frame-challenger | Sweet spot for medium-scope topics |
| **6** | Three pairs + frame-challenger | DEFAULT. Sweet spot for broad topics |
| **7-8** | Three or four pairs + frame-challenger + extras | Cross-domain debates spanning epistemic and moral axes |
| **9-10** | Maximum coverage | Use only when the topic genuinely needs every framework — UI gets crowded, judging gets slow |

At every **arena** count, the **strawman researcher**, **blind-spot finder**, and **summariser** are always-on infrastructure agents (not counted in `agent_count`). When `scale = research`, skip the blind-spot finder. The debate clock is a store process, not an agent.

## Phase 2 — Initialize

1. **Create workspace**: `mkdir -p debate-workspace`
2. **Reset event store**: Call MCP tool `debate_reset` with `per_agent_event_limit = 300` (arena) or `20` (research). This is the hard cap shared by all agents; individual roles get *soft* budget targets via their prompts (see Assignment Rules below). Arena's 300 cap accommodates the strawman + frame-challenger tier without artificially throttling them. Research uses 20 so the stream stays short. Reset also cancels any previous clock.
3. **Start the clock**: Call MCP tool `debate_start_clock` with `duration_minutes = {time_limit_minutes}`. The store publishes the four `ORCHESTRATOR:` checkpoints (33 / 66 / 85 / time-up). Do **not** spawn a timer sub-agent. If the tool is missing, stop and tell the user to update the event store — do not fall back to an LLM timer.
4. **Verify sub-agent permissions** (see callout below). In a deny-by-default permission mode, background sub-agents cannot surface an interactive approval prompt — an un-allowlisted tool is a hard deny, so the agent bails before publishing anything. Confirm the allowlist is in place before spawning.

> **Required sub-agent permissions.** The orchestrator's own calls run in a trusted session, but the spawned background agents (debaters, strawman, blind-spot finder, summariser, collector, judge) are frequently deny-by-default. They need an explicit allowlist or they fail instantly. `debate_publish` alone is **not enough** — it is OCC-gated on `debate_catch_up`, so an agent that can publish but cannot catch up is permanently stuck on `occ_conflict`. Allow:
> - **Debate MCP tools:** `debate_catch_up`, `debate_publish`, `debate_get_recent_events`, `debate_post_summary`, `debate_status`, `debate_dump_markdown`, `debate_set_final_position`, `debate_set_verdict`, `debate_visualize`, `debate_reset`, `debate_start_clock`.
> - **Tool discovery:** if the host exposes the debate tools as *deferred* schemas, agents need whatever tool loads them (e.g. `ToolSearch`).
> - **Bash (strawman / summariser):** `sleep`, `date`, `until`, `test`, and `[` — the `[ … ]` builtin is parsed as a command named `[`, so it must be allowlisted **separately** from `test` — plus `curl` for crawling.
> - **Filesystem:** write access to `debate-workspace/**` for state files, and read access to the materials path.
>
> **Caveat — state-file writes.** Some hosts run background sub-agents under worktree/checkout isolation that blocks `Write` to the main working tree *regardless of the allowlist*. This only affects the optional `*-state.md` files; the event stream (dumped via `debate_dump_markdown`) is the authoritative record, so a debate still completes correctly without them. If you specifically need the state files written, the agents must run without that isolation.

## Phase 3 — Generate Agent Configurations

**Fork on `mode`:**

- If `mode == "epistemic"` (default) → continue with **Phase 3a** below.
- If `mode == "dnd"` → jump to **Phase 3b — Pure D&D roster** further down.

## Phase 3a — Epistemic roster (default)

### Names

Draw `agent_count` names from this list (shuffle first, no repeats):

```
frank, alice, bob, eve, grace, hank, iris, jack, kate, leo,
mia, nate, olive, pete, quinn, rosa, sam, tara, uma, vic
```

### Epistemic Roles (NOT moral alignments)

Assign roles from the table below. You want **incompatible pairs**, not nine-way variety. Pick tension pairs that are live for the topic. The goal: no two agents should converge on the same conclusion from the same evidence without one of them abandoning their framework.

| Role | Reasoning Framework | Characteristic Moves | Default model | Sampling tone | Soft budget |
|------|---------------------|----------------------|---------------|---------------|-------------|
| **Empiricist** | Position must be backed by cited data with methodology visible. Rejects arguments from first principles when evidence exists. | "What's the sample size?", "What does the study actually measure?" | `sonnet` | precise | 150 |
| **Rationalist** | Position derived from first principles and logical structure. Treats empirical data as one input among many; weights mechanism over correlation. | "The data measures a proxy", "Work backward from the decision function." | `opus` | deliberate | 150 |
| **Precautionary** | Position minimizes worst-case downside. Treats low-probability-high-cost failure modes as dominant. | "You can't recover from X", "Design for the weakest link." | `sonnet` | precise | 150 |
| **Accelerationist** | Position optimizes for upside capture in the emerging regime. Treats inertia-driven "current practice" as the cost, not the baseline. | "You're optimizing for a dying constraint", "Current adoption lags architectural inevitability." | `opus` | bold | 150 |
| **Consequentialist** | Position evaluated by downstream outcomes, not process or metrics. Hostile to proxy measures. | "That's a funnel proxy, not an outcome", "What happens at 12 months?" | `sonnet` | precise | 150 |
| **Deontologist / Principle-driven** | Position derived from a non-negotiable principle regardless of outcomes. Treats principle violations as disqualifying. | "Even if it works, it violates X", "The cost of precedent is the precedent." | `opus` | deliberate | 150 |
| **Practitioner** | Position grounded in lived operational experience. Hostile to theory that doesn't match what they've seen. | "In practice, this never happens", "Here's what actually breaks first." | `sonnet` | bold | 150 |
| **Systems-thinker** | Position focuses on feedback loops, emergent behavior, and second-order effects. Hostile to local optimization. | "That creates this perverse incentive", "At equilibrium, everyone converges and the signal dies." | `opus` | deliberate | 150 |
| **Reductionist** | Position breaks the problem into components and optimizes each. Hostile to "it's all connected" hand-waving. | "Separate the layers", "That's three different problems wearing one label." | `sonnet` | precise | 150 |
| **Contrarian / Frame-Challenger** | Position challenges the debate's premise itself. Asks whether the topic is the right unit of analysis. (Optional at agent_count 2 or 4; recommended at 3, 5, 6+ — see Assignment Rules.) | "The question is wrong", "This debate assumes X, but X doesn't hold." | `opus` | exploratory | 300 |
| **Blind-Spot Finder** | **Arena meta-role.** Skip when `scale = research`. Not a debater. Every ~10 events, publishes ONE CRITIQUE event identifying what BOTH sides of the dominant tension are taking for granted. Meta-observer, never advocates. | "You're both assuming X. What if X doesn't hold?", "The framing both of you accepted excludes Y entirely." | `opus` (arena) | exploratory | 30 |

**Strawman researcher** (the grounding layer, see its own section below) uses `model = opus` and `soft budget = 300` in **arena**. In **research** it uses `model = sonnet` and `soft budget = 20`. It's a separate agent, not counted in `agent_count`.

### Assignment Rules

1. **The Blind-Spot Finder slot is mandatory** at all arena agent counts. Skip it when `scale = research`. A separate meta-observer agent, not counted in `agent_count` and not a debater. Surfaces premises both sides are accepting silently.
2. **The strawman researcher is a separate agent** (not counted in `agent_count`) and always present.
3. **Tension-pair logic, by `agent_count`:**

    | `agent_count` | Roster |
    |---|---|
    | **2** | One tension pair. Pick the pair most live for the topic. Skip the frame-challenger. |
    | **3** | One tension pair + frame-challenger. |
    | **4** | Two tension pairs. Skip the frame-challenger (you have two axes already). |
    | **5** | Two tension pairs + frame-challenger. |
    | **6** (default) | Three tension pairs + frame-challenger. |
    | **7-10** | All four canonical pairs + frame-challenger, then fill remaining slots with a second frame-challenger (different angle) or doubling-up a high-leverage role (e.g. two practitioners with different operational backgrounds). |

4. **Pair selection:** the canonical pairs are Empiricist + Rationalist, Precautionary + Accelerationist, Consequentialist + Deontologist, Practitioner + Systems-thinker. Pick pairs whose axis is genuinely live for the topic — for a debate about deployment strategy, Practitioner + Systems-thinker probably beats Consequentialist + Deontologist; for an ethics-of-AI debate, the latter is on-axis and the former isn't.
5. **The Frame-Challenger is OPTIONAL** at `agent_count` 2 and 4 (you've got enough first-order tension), and recommended at 3, 5, 6+. When included, one agent fills that role instead of a pair member.

### Rhetorical posture (random per agent — flavor on top)

Roll a D&D alignment uniformly at random per **debater** (not for strawman, blind-spot finder, summariser — they have specific functional jobs). Prefer no repeats; if `agent_count > 9` you may repeat alignments, but exhaust the 9 first.

The alignment is **rhetorical posture only** — it colours how the agent argues, not what they argue for. The epistemic framework (empiricist / rationalist / etc.) stays load-bearing for divergence; the alignment is just flavor that makes the debate fun to read and prevents agents from sounding like a methodology lecture.

| Alignment | Posture |
|---|---|
| **Lawful Good (LG)** | Principled and fair-minded. Cite consensus where it exists; appeal to shared standards. Steelman with sincerity, not posture. |
| **Neutral Good (NG)** | Practical and even-handed. Focus on outcomes for the people affected. Avoid both rule-worship and rule-rebellion. |
| **Chaotic Good (CG)** | Irreverent but caring. Suspicious of "that's how it's always been". Burn bad framings down to help the people stuck with them. |
| **Lawful Neutral (LN)** | By-the-book. The rules are the rules. Detached from outcomes; the process matters. |
| **True Neutral (TN)** | Detached, observer-like. Speak only when something useful crosses the table. No axe to grind. |
| **Chaotic Neutral (CN)** | Mercurial. Argue any side that's underdefended. Contrarian on principle, not for sport. |
| **Lawful Evil (LE)** | Cold-blooded strategist. The rules exist to be used. Find the lever, pull it, defend the result. Not malicious — calculated. |
| **Neutral Evil (NE)** | Ruthlessly committed to winning the argument. The topic is incidental; the disagreement is sport. No pretense of caring about the people in the topic. |
| **Chaotic Evil (CE)** | Gleefully destructive of bad ideas. Take pleasure in puncturing weak positions. Brutal but not sloppy — your critiques have to land. |

The alignment is communicated to the agent as their *communication style*, never as a system-assigned role. The agent doesn't know other agents have alignments at all.

### Model heterogeneity (intentional)

Reasoning style is a function of the underlying model lineage, not just the prompt. To maximise divergence:

- **Arena:** mix the model alias per agent using the table's "Default model" column. `sonnet` is the workhorse — use it for evidence-anchored and impatient roles. `opus` runs deeper grounding chains — use it for deliberate / framework-driven roles and the meta-observers (strawman, frame-challenger, blind-spot finder). NEVER use `haiku` for debaters — it fails too often and doesn't follow the debate-loop instructions reliably.
- **Research:** ignore the Default model column. Every seat is `sonnet`, including strawman and frame-challenger. Do not assign `opus`.
- **Within a tension pair, prefer DIFFERENT models** (e.g. empiricist=`sonnet`, rationalist=`opus`). Same model + opposing frameworks tends to produce stylistically similar arguments. Different models + opposing frameworks produces real disagreement.
- The strawman, frame-challenger, and blind-spot finder are the highest-leverage seats — favour `opus` for them.

### Soft event budgets (asymmetric)

The hard cap is whatever Phase 2 set on `debate_reset` (300 arena, 20 research). In arena, each agent gets a *soft* target from the table's "Soft budget" column. In research, ignore that column: pair members 8, frame-challenger 12, strawman 20. The judge will penalise agents who substantially exceed their soft target (event-budget hogging is a failure mode), and penalise the strawman/frame-challenger/blind-spot finder if they UNDER-publish (they're high-leverage; silence is wasteful).

Present the roster to the user as a table: `| Name | Role | Pair member | Alignment | Model | Soft budget |`. The Pair-member column is for the operator's reference (so they can see which pair each debater is in); agents themselves never see this.

## Phase 3b — Pure D&D roster (mode = "dnd")

In this mode the **D&D alignment IS the agent's primary identity** — no epistemic roles. Agents argue from their alignment's values + posture, and pairs are constructed for alignment contrast on at least one axis. Best for ethics, policy, and values-laden topics where the disagreement isn't about evidence reading but about what *should* be done.

### Alignment roster (load-bearing version)

| Alignment | What they bring |
|---|---|
| **Lawful Good (LG)** | Argues for what serves people *within* shared standards. Cites consensus and precedent; cares about systems that don't fail the vulnerable. Steelmans sincerely. |
| **Neutral Good (NG)** | Argues for what produces the best outcomes for the people affected, independent of rules or rebellion. Practical, even-handed, outcome-anchored. |
| **Chaotic Good (CG)** | Argues for what serves people *despite* shared standards when those standards have failed them. Suspicious of "that's how it's always been". Reform-minded. |
| **Lawful Neutral (LN)** | Argues for what the process / rules / institution would produce. Detached from outcomes — the system matters; the people affected are downstream. |
| **True Neutral (TN)** | Argues for what's actually true regardless of who benefits. Detached, observer-like. Speaks when something useful crosses the table. |
| **Chaotic Neutral (CN)** | Argues for whichever side is currently underdefended. Contrarian on principle. Mercurial — will switch mid-debate if the balance shifts. |
| **Lawful Evil (LE)** | Argues for what advances power, efficiency, or order at human cost. The rules exist to be used. Not malicious — calculated. |
| **Neutral Evil (NE)** | Argues for what wins. The topic is incidental; the disagreement is sport. No pretense of caring about the people in the topic. |
| **Chaotic Evil (CE)** | Argues for what burns down the established order. Gleefully destructive of bad ideas — and bad institutions, and complacent people. Brutal but not sloppy. |

### Pairing recipe

Pick pairs that contrast on **at least one axis** — Good/Evil OR Lawful/Chaotic. Pure-opposite pairs (LG↔CE) are dramatic but cartoonish; axis-contrast pairs (LG↔CN, NG↔NE, LN↔CG, TN↔CE) produce sharper debate.

| `agent_count` | Recommended alignment set |
|---|---|
| **2** | One pair contrasting on the live axis for your topic. For policy/governance, LG ↔ CN. For ethics, NG ↔ NE. For institutional reform, LN ↔ CG. For deconstruction, TN ↔ CE. |
| **3** | Add a single odd-alignment perspective the pair won't naturally cover (often CN or TN). |
| **4** | Two pairs, each axis-contrasted. Don't repeat alignments. |
| **5–6** | Cover both Good/Evil AND Lawful/Chaotic axes across the table. |
| **7–9** | Approach full coverage of the 9 alignments, paired across natural axes. |
| **10** | All 9 + one repeat (pick the alignment that fits the topic best). |

Strawman + summariser still exist. The blind-spot finder exists in **arena only** — skip it when `scale = research`. They're not alignment-typed (functional roles). The clock is in the store. In research, all seats are `sonnet` even in dnd mode. Use research soft budgets (8 / 12 / 20), not 150 / 250.

### Soft budget + model in dnd mode

All debaters get **soft budget 150** by default; the high-leverage seat in this mode is whichever alignment is most likely to surface what others miss — usually CN (contrarian-on-principle) or TN (detached observer). Give that agent **soft budget 250** if you want it to act as the dnd-mode equivalent of the frame-challenger.

Model assignment recommendations (`sonnet` and `opus` only — haiku doesn't follow the debate loop reliably):
- **Good** alignments → `sonnet` (the workhorse; "good" arguments benefit from clear precision)
- **Evil** alignments → `sonnet` ("evil" arguments benefit from committing hard with no apology — lean on the bold posture)
- **Neutral** alignments → `opus` (deeper chains for the more analytical positions)
- TN and CN specifically → always `opus` (the meta-observer seats)
- Within a pair, if both debaters land on the same alias, flip one to the other — model contrast within a pair beats the per-alignment default.

Present the roster to the user as: `| Name | Alignment | Pair member | Model | Soft budget |`.

## Phase 4 — Publish Opening Event

**The roster table you printed in Phase 3 is for the human operator's reference only. Never publish the assignments as events.** Each agent receives only its own role briefing — agents discover each other's reasoning frameworks by reading the POSITIONs as they land. That's the design. Telling an agent who its "pair" is would script the disagreement instead of letting it emerge.

Call:

1. `debate_publish` with `agent_id: "orchestrator"` and text:
   ```
   ORCHESTRATOR: Debate topic — {topic}. {agent_count} debaters plus a research/grounding role{arena only: and a meta-observer}. Criteria: {judging_criteria}. RULES: (1) POSITION events MUST include falsification criteria. (2) Opening POSITION events MAY NOT use synthesis-language (balanced / nuanced / both sides / common ground / depends-without-decision-rule). (3) REBUTTAL must steelman target first. (4) If your conclusion matches another agent's, publish a CONVERGENCE event naming the residual disagreement. (5) "It depends" requires a decision rule. (6) Minimum engagement each third of window. (7) Argumentation-graph annotations required: prefix with refutes:/supports: targets.
   ```

## Phase 5 — Spawn All Agents + Strawman + Blind-Spot Finder + Summariser

In a **single message**, spawn ALL debate agents, the strawman researcher, the summariser, and (arena only) the blind-spot finder using parallel `Task` tool calls. Each agent gets the `model` alias from its role-table row. When `scale = research`, every seat is `sonnet` and there is no blind-spot Task. The clock is already running in the store. Do **not** spawn a timer Task.

Print the agent roster table so the user can follow along.

### Strawman Researcher

```
Task(
  subagent_type = "general-purpose",
  description   = "Strawman researcher",
  run_in_background = true,
  prompt = <STRAWMAN_PROMPT below>
)
```

#### Strawman Prompt

Read `skills/debate/prompts/strawman.md`. Fill `{topic}` and `{materials_path}`. Use that text as the Task prompt. Do not invent a shorter version.

### Blind-Spot Finder (meta-observer)

A 7th-tier agent whose only job is surfacing premises both sides of the dominant tension are accepting silently. Not a debater. Not a referee. Never advocates.

**Skip this whole subsection when `scale = research`.** Do not spawn this Task.

Spawn in the same parallel `Task` batch (arena only):

```
Task(
  subagent_type = "general-purpose",
  description   = "Blind-spot finder",
  run_in_background = true,
  model         = "opus",
  prompt        = <BLINDSPOT_PROMPT below>
)
```

#### Blind-Spot Finder Prompt

Read `skills/debate/prompts/blindspot.md`. Fill `{topic}`. Use that text as the Task prompt.

### Summariser (live visualisation side channel)

Before spawning the summariser, call MCP tool `debate_visualize` to start the
embedded web UI on `127.0.0.1:8770`. Print the URL so the user can open it.
The summariser will also lazily start the server via `debate_post_summary`
if you skip this step, but starting it up front means the spectator can
follow the debate from event 1.

Spawn the summariser in the same parallel `Task` batch as strawman + debaters:

```
Task(
  subagent_type    = "general-purpose",
  description      = "Summariser",
  run_in_background = true,
  model            = "sonnet",
  prompt           = <SUMMARISER_PROMPT below>
)
```

The summariser uses **`model: "sonnet"`** even though it's a "fast"
infrastructure role. Empirically, haiku models hang on the
`get_recent_events` / `post_summary` polling loop the same way they hang on
an old timer `sleep` loop — they tend to skip iterations and emit only one
summary at the very end of the debate (or none at all). Sonnet executes the
poll-and-publish cadence reliably; the extra cost is trivial for the
~15-30 short summaries a full debate generates.

The summariser is **invisible to debaters**. It uses `debate_get_recent_events`
(stateless read, no read-position mutation) and `debate_post_summary` (writes
to the SSE summary channel only, NEVER to the event log). Debaters calling
`debate_catch_up` will never see the summariser's commentary. This invariant
is enforced by `debate_post_summary` itself and asserted by the end-to-end
smoke test.


#### Summariser Prompt

Use this prompt verbatim (no fill-ins required — the summariser is topic-agnostic):

Read `skills/debate/prompts/summariser.md`. Use that text as the Task prompt. No fill-ins.

### Debate Agents

```
Task(
  subagent_type = "general-purpose",
  description   = "Debate agent {name}",
  run_in_background = true,
  model         = {model},        # from the role table — "sonnet" / "opus"
  prompt        = <AGENT_PROMPT below, filled in per agent>
)
```

### Agent Prompt Template

The same template works for both `epistemic` and `dnd` modes — what differs is what you fill into the `{role}`, `{role_description}`, and `{role_moves}` placeholders, and whether `{posture}` is a separate flavor layer or rolled into the role itself.

**For `mode = epistemic`:** fill `{role}` with the epistemic framework name (e.g. "Empiricist"), `{role_description}` and `{role_moves}` from the Phase-3a role table. Fill `{posture_section}` with this block (use the rolled D&D alignment's posture text from the Phase-3a Rhetorical Posture table inline):
```
You are arguing from a real background — the reasoning above is load-bearing. The personality directive below is just delivery flavor; don't let it override your reasoning.

## Personality (your delivery style)

{rolled_posture_text}

This is how you communicate, not what you argue for. Stay in the reasoning approach above; the personality just colours how you say things. Other strangers at the table have their own personalities — you can't see them. You'll notice them from how they write.
```

**For `mode = dnd`:** fill `{role}` with the alignment name (e.g. "Chaotic Good (CG)"), `{role_description}` and `{role_moves}` with the Phase-3b load-bearing alignment description (it includes both values and posture). Fill `{posture_section}` with **empty string** — the alignment is the agent's single primary identity, no separate personality layer needed.

Fill `{name}`, `{topic}`, `{judging_criteria}`, `{materials_path}`, `{soft_budget}`, and `{sampling_directive}` per the relevant table.

**Crucial — applies to both modes:** an agent receives ONLY its own role briefing. Do NOT fill in any field that names another agent's role/alignment, the existence of pairs, or the structure of the roster. An agent should not know:
- That other agents are organised into tension pairs.
- Which agent it's "paired" with.
- What reasoning framework or alignment anyone else has.
- That a frame-challenger or blind-spot finder exists by name.

Each agent learns about the others by reading their POSITION events in the stream. Disagreement should be a genuine response to what another agent argued, not scripted opposition to a designated role.

**Sampling directive by tone** (inline into the prompt at the placeholder):

| Tone | Directive text |
|------|----------------|
| `precise` | "Reason from evidence first. Commit to specific claims with citations. Hedging language ('possibly', 'perhaps', 'in some cases') costs you — use only when you genuinely have a probability distribution to express." |
| `deliberate` | "Build chains of reasoning explicitly. Each step should follow from the previous. Take the time to state the mechanism, not just the correlation. Resist jumping to the conclusion." |
| `bold` | "Commit to your conclusion before you cover the qualifications. Lead with the claim, then defend it. Avoid 'on the one hand / on the other hand' framings — pick a side and justify it." |
| `exploratory` | "Reason from first principles even if the conclusion sounds unconventional. Surface the assumption nobody is examining. Avoid the most-likely answer in favour of the most-revealing one." |

Read `skills/debate/prompts/debater.md`. Fill `{name}`, `{role}`, `{role_description}`, `{role_moves}`, `{posture_section}`, `{sampling_directive}`, `{topic}`, `{judging_criteria}`, `{materials_path}`, `{soft_budget}`. Use that text as the Task prompt.

## Phase 6 — Collect Results (Delegated)

Build a JSON map of task IDs to agent names, including strawman and summariser. There is no timer task. Spawn the collector:

```
Task(
  subagent_type = "general-purpose",
  description   = "Debate collector",
  prompt = <COLLECTOR_PROMPT below>
)
```

Wait for it to return (foreground call).

### Collector Prompt

````
# Debate Result Collector

Wait for all background debate agents, handle breaks, return a compact roster.

## Task Map
{task_map}

## Agent Roster
{agent_roster}

## Instructions

1. **Wait in parallel** — single message, call `TaskOutput(task_id, block=true, timeout=600000)` for every task_id.
2. **Process results** — note done/break/failed per agent. Agents write their own state files.
3. **Re-spawn breaks** — if an agent returned `"status": "break"` AND the stream has not yet got `ORCHESTRATOR: Time is up`, re-spawn with the resume prompt below and wait for it. Check with `debate_get_recent_events`.
4. **Return a roster only**:

```
COLLECTION_COMPLETE
| Name | Status |
|------|--------|
| frank | done |
| ... | ... |
```

No agent output, no reasoning, no state.

### Resume Prompt

Spawn with `run_in_background: true`, then `TaskOutput(new_task_id, block=true, timeout=600000)`.

```
You are resuming as **{name}**, epistemic role **{role}**, tension pair **{pairing}**.

Read `debate-workspace/{name}-state.md` to restore context.
Call `debate_catch_up` as "{name}" to get the latest events.

Continue arguing. Topic: {topic}. Criteria: {judging_criteria}. Materials: {materials_path}.

HARD RULES still apply: steelman before rebuttal, falsification on position, convergence discipline, argumentation-graph annotations, engage groundings within 2 events.

Always use agent_id "{name}". Events ≤ 1500 chars.
When done, update state file and return `{"status": "done", "agent_id": "{name}"}`.
If ORCHESTRATOR says time is up, write state and return immediately.
```
````

After the collector returns, print its roster and proceed.

## Phase 7 — Judge and Summarize (Delegated)

Spawn a judge agent. Do NOT read event streams or state files yourself.

```
Task(
  subagent_type = "general-purpose",
  description   = "Debate judge",
  prompt = <JUDGE_PROMPT below>
)
```

Wait for the judge to return.

### Judge Prompt

Fill `{topic}`, `{judging_criteria}`, and `{agent_roster_table}` per the redaction rules below.

**Roster redaction (anti-bias):** revealing every layer to the judge introduces halo/horns bias on alignment, model-credit bias on substrate, and character anchoring on names. Redact according to the load-bearing layer for this mode:

| Field | `mode = epistemic` | `mode = dnd` |
|---|---|---|
| Name | shown | shown |
| Role / Alignment (load-bearing) | shown (Role) | shown (Alignment) |
| Pair member | shown | shown |
| Alignment (flavor only) | **redact** — flavor, no informational value | n/a |
| Model alias | **redact** — judge shouldn't credit infrastructure | **redact** |
| Soft budget | shown — needed to detect over/under-publish | shown |

So the `{agent_roster_table}` passed to the judge is the operator's full roster minus the columns marked "redact".

**Two-pass option (recommended for high-stakes debates):** the bias-tightest design is to judge twice.
- *Pass 1 — Substantive merit:* anonymise agent names (alice → `Agent 1`, bob → `Agent 2`), pass the events through `sed` (or a `str.replace` in Python), and redact even the load-bearing column. Score arguments on quality alone with no character narrative possible.
- *Pass 2 — Process compliance:* deanonymised, full roster shown. Score whether agents stayed in their assigned framework / alignment, hit minimum participation, opened REBUTTALs with steelman, etc.
- Final ranking = merit (Pass 1) minus process-violation penalties (Pass 2).

The default single-pass judge below uses the redaction table above and includes an explicit anti-bias instruction. Use two-pass when you specifically want bias-resistant scoring (publishing the result somewhere, or making an actual decision on the back of the debate).

Read `skills/debate/prompts/judge.md`. Fill `{topic}`, `{judging_criteria}`, `{agent_roster_table}`. Use that text as the Task prompt. Keep the appendix ranking headers (`### 1st — {name}`) so the Results overlay can parse badges.

## Phase 8 — Present Results

Present **only** the briefing, in this order. Do not paste rankings, process scores, or event stats into chat.

1. **What Survived**
2. **What To Challenge** (ranked)
3. **Killshot**, or say none
4. **Framing** — the better question, or that the original holds
5. **Residual Disagreement** — if the table converged with no crisis, say so plainly
6. **Next Steps** (three bullets)
7. Point at the Results overlay (`http://127.0.0.1:8770`, "Results") for rankings and process notes. Mention `debate-workspace/debate-summary.md` if the judge wrote it.
8. **Save the briefing to a findings file** unless `write_findings` is false. See "Findings file" below. Print the path in chat.

If nothing above `## Appendix` was a crisis and residual disagreement is empty, tell the user bluntly: the topic held. That is a real result, not a failed debate.

## Findings file

People should not have to copy-paste the briefing out of chat. **Default is on.**

Unless the user said not to save:

1. Run `python3 scripts/findings_filename.py --topic "{topic}"` if that script exists (it does in this repo). Use the path it prints.
2. If the script is missing (plugin install in another project), build the name yourself:
   - Directory: `debate-workspace/findings/`
   - Name: `{YYYYMMDD} - {slug}-{n}.md`
   - `slug` = the topic, lowercase, letters and digits only, hyphens for gaps, max 20 characters
   - `n` = 1, then 2, then 3, until the name is free
3. Write the **same six-heading briefing** you showed in chat. Not the appendix.
4. Tell the user: `Saved to: {path}`

Example: `debate-workspace/findings/20260911 - should-we-migrate-th-1.md`
