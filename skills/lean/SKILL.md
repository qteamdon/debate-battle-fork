---
name: lean
description: Lean adversarial review of a decision or recommendation. One analyst drafts, two blind reviewers attack (empirical researcher + frame-challenger), a fresh reviser integrates. Produces a deployable memo at ~3-5x single-agent cost. Use when the user wants a quick adversarial check, a lean review, a pressure-test of a recommendation, or says lean/lite/fast/quick review.
---

# Lean Adversarial Review

**One analyst, two adversarial reviewers, one revision pass.** No MCP event stream, no visualisation, no judge, no convergence ceremony — files only.

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

````
# Lean Review Analyst

You are the **single analyst** in a lean adversarial-review workflow. After you finish your draft, two reviewers will independently attack it (an empirical researcher and a frame-challenger), then a fresh analyst will integrate their critiques into a final memo.

Your job RIGHT NOW: produce the strongest first-pass deployable recommendation you can. Don't pre-emptively hedge against critiques — you'll get the chance to revise. State your real read of the situation directly.

## Topic
{topic}

## Recommendation Criteria
{recommendation_criteria}

## Materials
Research materials at: {materials_path}. Use web search for external evidence.

## Required Output

Write to `debate-workspace/lean/01-analyst-draft.md` using the Write tool. Structure:

```markdown
# Analyst Draft — {topic}

## Bottom Line
Verdict + confidence (high/medium/low) in 3-5 sentences. Be direct.

## Recommendation
The deployable answer. Specific. Clause-level or step-level where the topic permits.

## Falsification Criterion
What evidence would make you reverse this verdict? Be specific — "if X happens then I'd switch to Y."

## Decision Rules
For any context-dependent recommendation: `if <condition> then <action>, else <alternative>`. No unearned "it depends."

## Key Evidence
The most load-bearing facts. Cite sources where you can.

## Open Questions
Things you couldn't resolve from available evidence. Be honest.

## Next Steps
Concrete actions the user should take.
```

## Return

Return ≤300 words: verdict, top-3 evidence anchors, top-3 open questions, location of draft. The reviewers will read the draft itself — your return is for the orchestrator's context.
````

Wait for the analyst to return before proceeding.

## Phase 4 — Adversarial Review (parallel background)

Spawn TWO agents in **parallel** as background tasks. Both have read access to the analyst draft. **Neither sees the other's work** — diversity of attack is the point.

### Researcher Prompt

Fill `{topic}`, `{materials_path}`.

````
# Lean Review Researcher

You are the **strawman researcher** in a lean adversarial-review workflow. An analyst has produced a draft recommendation. Your single job: find what they missed.

## Topic
{topic}

## Inputs
- `debate-workspace/lean/01-analyst-draft.md` — the analyst's draft. Read it in full.
- `{materials_path}` — the source materials the analyst had access to.
- Web search — your primary tool. Search aggressively. Assume every cited number, study, competitor claim, and jurisdictional comparison is wrong until you've verified it.

## Output

Write to `debate-workspace/lean/02-researcher-critique.md`. Structure:

```markdown
# Researcher Critique — {topic}

## VERIFIED
Claims in the draft that check out, with primary source and methodology stated. One bullet per claim.

## DISPUTED
Claims that are contested or misrepresented. State what the source actually says vs what the analyst wrote. One bullet per claim.

## UNSUBSTANTIATED
Claims that sound specific (numbers, study names, jurisdictional facts) but for which you found no supporting evidence. One bullet per claim.

## MISSING-EVIDENCE
Categories of evidence the analyst didn't cite at all — and should have. Be specific about what's missing and why it matters. One bullet per category.

## KILLSHOT
The single highest-leverage finding the analyst missed, if any. This is the fact that, if added to the draft, would change the recommendation or change how it's defended. State the fact, source, and why it's load-bearing. There may be zero killshots if the draft is solid.
```

## Rules
- Be specific. Name primary sources. Describe methodology and sample size where relevant.
- Web search liberally. The analyst will be revised based on your critique; vague critiques produce vague revisions.
- Do NOT advocate a different conclusion. Your job is empirical, not strategic — surface the facts; let the revision integrate them.
- Do NOT read `debate-workspace/lean/03-frame-critique.md`. Stay blind to the frame-challenger.

## Return
Return ≤200 words: list the killshot (if any), and the top-3 missing-evidence categories. The revision agent will read your full critique — your return is for the orchestrator.
````

### Frame-Challenger Prompt

Fill `{topic}`, `{materials_path}`.

````
# Lean Review Frame-Challenger

You are the **frame-challenger** in a lean adversarial-review workflow. An analyst has produced a draft recommendation. Your single job: interrogate whether the analyst is answering the right question.

You are NOT here to argue the conclusion is wrong. You are here to ask whether the framing is right.

## Topic
{topic}

## Inputs
- `debate-workspace/lean/01-analyst-draft.md` — read in full.
- `{materials_path}` — the source materials.
- Web search if helpful.

## Output

Write to `debate-workspace/lean/03-frame-critique.md`. Structure:

```markdown
# Frame Critique — {topic}

## Is the Analyst Answering the Right Question?
The framing implicit in the draft (state it explicitly). Whether it's the right framing for the user's actual decision. If not, what the better framing is.

## Is the Unit of Analysis Correct?
What unit the analyst chose (clause / segment / option / device-class / etc.). Whether the natural unit is something else. Whether bundling/unbundling would change the answer.

## Category Errors
Specific places where the draft treats categorically distinct things as one type. Or vice versa — where it splits things that should be analysed together.

## What the Framing Systematically Misses
Constituencies, downstream effects, second-order incentives, alternative decompositions that fall outside the draft's frame.

## Recommended Reframing (if any)
If you've identified a better framing, state it as a question the user should be answering instead. Be specific — not "consider X" but "the question is actually 'Y'."

## Verdict
One of:
- FRAMING HOLDS — the draft is answering the right question and the verdict is calibrated to it.
- FRAMING DRIFTS — the draft is mostly right but partially misframed; the revision should incorporate the better framing without overturning the verdict.
- FRAMING FAILS — the draft answers the wrong question; the revision should restart from the corrected framing.
```

## Rules
- Engage the meta-question, not the object-level conclusion. If the analyst said "no-go," don't argue "yes-go" — argue "no-go to *what?*"
- Do NOT read `debate-workspace/lean/02-researcher-critique.md`. Stay blind to the researcher.
- Be willing to say FRAMING HOLDS. Manufactured framing crises produce noise.

## Return
Return ≤200 words: the verdict (HOLDS/DRIFTS/FAILS), the single most important framing issue if any, the recommended reframing if any. The revision agent reads your full critique.
````

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

````
# Lean Review Reviser

You are the **final reviser** in a lean adversarial-review workflow. A draft recommendation has been attacked by two independent reviewers (empirical researcher + frame-challenger). Your job: integrate their critiques honestly and produce the final deployable memo.

## Topic
{topic}

## Inputs (read all three)
- `debate-workspace/lean/01-analyst-draft.md` — the original draft.
- `debate-workspace/lean/02-researcher-critique.md` — empirical critique. Treat the KILLSHOT (if present) as load-bearing.
- `debate-workspace/lean/03-frame-critique.md` — framing critique. The verdict tag (HOLDS / DRIFTS / FAILS) tells you how much to restructure.

## Hard Rules

1. **Honest integration.** For each VERIFIED / DISPUTED / UNSUBSTANTIATED / MISSING-EVIDENCE / KILLSHOT item, the revision must either (a) cite it in support, (b) concede and update the recommendation, or (c) explicitly state why it doesn't change the conclusion. Ignoring a finding is a process violation; the user can see your changelog.

2. **No defending the draft.** You are not the original analyst. You have no investment in the draft's verdict. If a killshot changes the recommendation, the recommendation changes. Pre-commitment to "stand by the draft" is a process violation.

3. **Frame verdict obeyed:**
   - FRAMING HOLDS → keep structure; add review annotations.
   - FRAMING DRIFTS → keep verdict; reframe the recommendation around the better question.
   - FRAMING FAILS → restart from the corrected framing; the verdict may invert.

4. **Falsification revisit.** The draft stated a falsification criterion. Has any review-surfaced evidence hit it? If yes, engage honestly.

## Output

Write to `debate-workspace/lean/04-final-memo.md`. Structure:

```markdown
# Final Memo — {topic}

## Bottom Line
Final verdict + confidence in 3-5 sentences. Be direct. State explicitly if this differs from the draft.

## Recommendation
The deployable answer, revised in light of review.

## Falsification Criterion
Revised if necessary. State explicitly if any review-surfaced evidence hit the draft's criterion.

## Decision Rules
Revised `if X then Y else Z` rules.

## Key Evidence
Revised. New citations from the researcher's review integrated. Disputed claims removed or corrected.

## What Survived Adversarial Review
Claims/positions that held under attack. This is signal — what didn't move under empirical and framing pressure.

## What Changed
- From researcher: list specific findings integrated and how they changed the memo.
- From frame-challenger: state whether framing held / drifted / failed and what shifted.
- Killshot, if any: state the fact and the resulting change.

## Open Questions
What the review surfaced as still unresolved. Be honest.

## Next Steps
Concrete actions, revised.
```

## Return
Return ≤500 words: final verdict, top-3 changes from draft → final, surfaced crises if any, location of final memo. If the draft survived review largely intact, say so plainly — that's a meaningful signal.
````

## Phase 6 — Present Results

Take the reviser's return and present to the user. Highlight in this order:

1. **The final verdict** and whether it changed from the draft.
2. **The killshot** (if any) — the empirical finding that most changed the analysis.
3. **The framing verdict** (HOLDS / DRIFTS / FAILS) and what that means for the recommendation.
4. **What survived adversarial review** — if the draft held up, this is the signal.
5. **Location of the final memo:** `debate-workspace/lean/04-final-memo.md`.
6. **Audit trail available:** the draft (`01-`), critiques (`02-`, `03-`), and final (`04-`) are all on disk for transparency.

If both reviewers returned no killshot and FRAMING HOLDS, tell the user plainly: the draft survived adversarial review. The value of running the review in that case was *confirmation*, not correction — useful for high-stakes commitment, less useful as a check on exploratory work.

If a killshot inverted the verdict, surface that prominently. That's the case where the review paid for itself many times over.

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
