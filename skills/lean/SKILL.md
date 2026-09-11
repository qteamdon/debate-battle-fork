---
name: lean
description: Lean adversarial review of a decision or recommendation. One analyst drafts, two blind reviewers attack (empirical researcher + frame-challenger), a fresh reviser integrates. Produces a deployable memo at ~3-5x single-agent cost. Use when the user wants a quick adversarial check, a lean review, a pressure-test of a recommendation, or says lean/lite/fast/quick review.
---

# Lean Adversarial Review

**One analyst, two adversarial reviewers, one revision pass.** No MCP event stream, no visualisation, no judge, no convergence ceremony — files only.

**Host files:** `skills/lean/hosts/claude.md` or `skills/lean/hosts/opencode.md`. If `$ARGUMENTS` and `TaskOutput` exist, you are on Claude. Otherwise you are on OpenCode — read the OpenCode host file. There is no `$ARGUMENTS` on OpenCode; the topic is the current user message.

## Design Rationale

The full debate battle (the `debate` skill) is engineered to *expose* structural disagreement. That's expensive (~12-20x single-agent tokens) and the right call when you genuinely don't know what the right answer is. But many real decisions need the opposite: a *deployable* recommendation that has survived adversarial review.

Across observed full-debate runs, ~80% of the unique value sat in two roles — the strawman researcher (empirical kill-shots via aggressive web search) and the frame-challenger (category-error detection). The tension-pair debaters and convergence ceremony added marginal value above that baseline. Lean keeps the high-leverage roles and drops the ceremony:

1. **Strawman researcher** — finds what the analyst missed via aggressive web search and falsifies unverified claims. The single most cost-effective role.
2. **Frame-challenger** — interrogates whether the analyst is answering the right question, not whether the conclusion is right.

It drops:

- The tension-pair debaters. In observed runs, both members of a pair typically converged on the same verdict via slightly different routes. The framework diversity didn't change the answer — only how it was held.
- The convergence ceremony (CONVERGENCE events naming residual disagreements). Useful for exposing structural disagreement; unnecessary when the goal is a single deployable artifact.
- The event-stream protocol, OCC, falsification-on-position rules. The analyst sets a falsification criterion in their draft, but the bureaucracy of enforcing it across multiple debaters is dropped.
- The judge. Lean produces a final memo, not a ranking.

## When NOT to use this skill

Use the `cross-check` skill instead if the user **already has a position** and wants that view attacked. Lean writes a new draft first. Cross-check copies their words and skips the analyst.

Use the `debate` skill instead if:

- The framing itself is genuinely contested (multiple reasonable units of analysis).
- You want to *preserve* named residual disagreements rather than collapse to a recommendation.
- The decision is irreversible / multi-million / public-facing, and you want maximum adversarial pressure.
- You suspect the analyst's framework will have a systematic blind spot that diverse epistemic roles would catch — Lean has only one analyst, so framework-level bias is uncorrected.

## User Request

$ARGUMENTS

## Phase 1 — Parse Inputs

Extract these from the user request. Ask if `topic` is missing.

| Parameter | Default |
|---|---|
| `topic` | *(required)* |
| `materials_path` | current working directory |
| `analyst_time_budget_minutes` | 5 (research + draft only; revision is unbounded) |
| `recommendation_criteria` | "deployable verdict with falsification criteria, decision rules, and clear next-step actions" |
| `write_findings` | `true` — save the briefing to a dated file so you do not have to copy-paste |

No `agent_count`. The count is fixed: 1 analyst + 1 researcher + 1 frame-challenger + 1 reviser = 4 total agent invocations.

## Phase 2 — Workspace

```bash
mkdir -p debate-workspace/lean
```

No event-store reset. No visualisation server. Record start time for telemetry only.

## Phase 3 — Analyst Draft (foreground)

Spawn ONE general-purpose agent. It produces the first-pass deployable memo.

```
Task(
  subagent_type = "general-purpose",
  description = "Lean analyst",
  prompt = <ANALYST_PROMPT below>
)
```

### Analyst Prompt

Fill `{topic}`, `{materials_path}`, `{recommendation_criteria}`.

Read `skills/lean/prompts/analyst.md`. Fill `{topic}`, `{materials_path}`, `{recommendation_criteria}`. Use that text as the Task prompt.

Wait for the analyst to return before proceeding.

## Phase 4 — Adversarial Review (parallel background)

Spawn TWO agents in **parallel** as background tasks. Both have read access to the analyst draft. **Neither sees the other's work** — diversity of attack is the point.

### Researcher Prompt

Fill `{topic}`, `{materials_path}`.

Read `skills/lean/prompts/researcher.md`. Fill `{topic}`, `{materials_path}`. Use that text as the Task prompt.

### Frame-Challenger Prompt

Fill `{topic}`, `{materials_path}`.

Read `skills/lean/prompts/frame-challenger.md`. Fill `{topic}`, `{materials_path}`. Use that text as the Task prompt.

Wait for **both** to complete (`TaskOutput(task_id, block=true)` for each, called in a single message).

## Phase 5 — Analyst Revision (foreground)

Spawn ONE NEW agent (not the original analyst — fresh eyes integrate critiques more honestly than the agent that produced the draft).

```
Task(
  subagent_type = "general-purpose",
  description = "Lean reviser",
  prompt = <REVISER_PROMPT below>
)
```

### Reviser Prompt

Fill `{topic}`.

Read `skills/lean/prompts/reviser.md`. Fill `{topic}`. Use that text as the Task prompt.

## Phase 6 — Present Results

Present a short briefing in this order. Do not dump the full memo into chat. Pull from the reviser return and `04-final-memo.md`. Use these headings:

```markdown
## What Survived
Claims that held. Say whether the verdict changed from the draft.

## What To Challenge
Ranked. Map this from What Changed / disputed claims.

## Killshot
Or "None."

## Framing
HOLDS / DRIFTS / FAILS and what that means.

## Residual Disagreement
Open questions the two reviews still split on, or "None."

## Next Steps
Three bullets from the memo.
```

Then list files: `debate-workspace/lean/01-analyst-draft.md`, `02-researcher-critique.md`, `03-frame-critique.md`, `04-final-memo.md`.

**Save the briefing** (the six headings above, not the full memo) to a findings file unless `write_findings` is false. Run `python3 scripts/findings_filename.py --topic "{topic}"` if the script exists; otherwise name it `{YYYYMMDD} - {slug}-{n}.md` under `debate-workspace/findings/` (slug = first 20 letters/digits of the topic, n starts at 1). Print `Saved to: {path}`.

If both reviewers returned no killshot and FRAMING HOLDS, say plainly: the draft survived adversarial review. That is confirmation, not a failed run.

If a killshot inverted the verdict, say so plainly in **Killshot**. Do not reorder the headings.

## Operational Notes

- **Why a fresh reviser, not the original analyst.** Authors over-weight their own draft. A fresh agent integrates critiques without defending its prior position. Costs one extra agent invocation; worth it.
- **Why blind reviewers.** If the researcher saw the frame-critique first, they'd anchor on framing. If the frame-challenger saw the researcher's findings, they'd anchor on empirics. Independent attack vectors > correlated attack vectors.
- **Why no event stream.** Three agents producing three files don't need an event log. The audit trail is the four files themselves.
- **Why no judge.** Three agents can't out-vote each other — the reviser integrates the two critiques into one memo. Judging is unnecessary.
- **Failure modes to watch.**
  - Reviewer collusion: reviewers should be blind; verify via prompts.
  - Reviser timidity: a fresh agent may be too deferential to the draft. If you see "the draft remains essentially correct" with no concrete changes, suspect this.
  - Researcher overreach: aggressive web search can produce false killshots. The reviser must judge source quality; surface this in the changelog.
  - Frame-challenger noise: manufactured framing crises are common. The FRAMING HOLDS verdict must be a real option, not just a safety release.
- **When to upgrade to a full debate mid-run.** If the frame-challenger returns FRAMING FAILS *and* the researcher returns a killshot that the reviser concedes — the original framing was systematically wrong. Offer the user the `debate` skill on the corrected framing.
