# Lean Mode — Research Findings

*Comparative evaluation of single-agent baseline vs full multi-agent debate vs a leaner four-agent variant, across three live experiments. Documents the design and empirical justification for the `lean` skill.*

Date: May 2026. Methodology: ad-hoc comparative simulations, n=3. Treat as suggestive, not conclusive.

---

## Question

Is the full multi-agent debate framework worth the extra tokens for high-stakes decisions? And if part of its value can be captured with fewer agents, what is the minimum viable structure?

## Methods tested

| Method | Agents | Tokens (vs baseline) | Wall-clock |
|---|---|---|---|
| **Single-agent baseline** | 1 (analyst) | 1.0× | ~4 min |
| **Lean Mode** | 4 (analyst → researcher + frame-challenger → reviser) | ~3.7× | ~10 min |
| **Full Debate** | 8+ (6 debaters + strawman + summariser + timer + judge + orchestrator) | ~14–16× | ~13 min |

All methods given the same topic and source materials. The baseline and Lean Mode were both instructed to ignore the full debate's workspace to prevent contamination.

## Experiments

### Experiment 1 — QLD E-Bike Bill (structured-evidence domain)

A legislative-analysis task. All source documents (bill text, explanatory notes, committee report, ministerial speech) were on disk. The "right answer" required structured reading of provided materials, not open research.

**Result:** Both methods reached the same verdict (pass with specific amendments; drop the licence mandate; amend the blanket 10 km/h footpath limit).

- Debate added sharper framings: a "proxy fallacy" coinage from the rationalist, vote-by-clause from the frame-challenger, enforcement-throughput quantification (80 speed tickets / 12 weeks statewide), a modal-shift CBA (250-400 averted deaths/yr from car-mode-shift), and a strawman blind-spot audit (battery / drink-riding / parental liability under-engaged).
- Baseline added deployment-readiness: a $30M / 4-year council funding number, pre-registered metrics (ED rate per 10k trips, fatalities, ped-strike rate, helmet compliance), a specific competency-module spec, a statutory definition of "high pedestrian area," 11 named studies with URLs.

**Verdict for this domain:** Debate produced more *intellectually interesting* framings; baseline produced a more *deployable* memo for an actual legislator. For most policy-analysis tasks where source materials are complete, single agent is roughly equivalent in usable output.

### Experiment 2 — Surf School Pitch (open-research domain)

A business-pitch evaluation. Topic: a 40-something with $80k savings wants to start a learn-to-surf business on the Gold Coast targeting retirees marketed through retirement villages. The pitch contained no source documents beyond the founder's own words; the killer facts (if any) lived on the public internet.

**Result:** Both methods reached NO-GO. But the debate found one fact the baseline missed: **Surf Life Saving Queensland runs the same product ("Water Safe Seniors / Surf Skills 50+") for free, state-wide.** The strawman researcher surfaced it; it falsified the pitch's load-bearing "nobody chasing the silver dollar" claim and demolished the debate's only conditional-GO position (the accelerationist).

- Debate added: the SLSQ killshot, village median age 82 (verified via a 14-village QLD study), negative-skew bet structure (capped upside vs unbounded downside), employee-first sequencing, 8 collective blind spots from the strawman's FINAL-SUMMARY, and a pattern-match diagnosis ("founder projected hobby onto fantasy demographic").
- Baseline added: a named competitor operator's contact details, three concrete product pivots, a per-village procurement workflow table, a "What NOT to Do" enumeration, a specific ACL s.139A citation.

**Verdict for this domain:** Debate's value was substantial here. The strawman researcher's web-search role earned its keep. Single-agent web search missed the killer fact because the analyst was focused on commercial competitors, not government/free programs.

### Experiment 3 — Lean Mode on Surf School (post-design validation)

Designed and tested a four-agent middle path: analyst draft → researcher + frame-challenger in parallel (blind to each other) → fresh-eyes reviser. No MCP event stream, no visualisation, no convergence rules, no judge. Files only.

**Unexpected result: Lean Mode produced the strongest output of the three methods.**

- Found a brand-new killshot neither prior method surfaced: **the Gold Coast Council surf-school permit window was CLOSED for ~14 months.** The founder could not legally operate as a new entity. Every recommendation in the original analyst draft (90-day sprint, MVP, village pilot) silently assumed permit access.
- Found a fresh constitutional finding: **Qld Retirement Villages Act 1999 requires a resident *majority vote* for new recurring village services**, not just a coordinator decision. Both prior methods treated village procurement as "procurement-heavy"; neither identified the statutory vote mechanism.
- Integrated a cardiac steelman: 55+ surfer sudden-arrhythmic-death mortality (0.052/100k) is *below* all-cause crude mortality (1.36/100k) at that age, so surfing is *net protective* for older surfers at population level. Operator-asymmetry argument retained; population-health framing softened. Neither prior method engaged this nuance.
- Frame-challenger verdict: FRAMING DRIFTS. Identified that the founder was making a life-allocation decision masquerading as a business pitch; "become an employee at an existing operator first" was elevated from a footnote to the headline recommendation.

Cost: ~164k tokens (44k analyst + 58k researcher + 23k frame-challenger + 39k reviser), or ~26% of full-debate cost.

## Why Lean Mode beat Full Debate (structural hypothesis)

This was not expected. The Lean Mode design target was "~80% of value at ~30% of cost." It overshot. Three structural reasons appear to explain it:

1. **The researcher had a sharper target.** Attacking a static written draft is more analytical than fact-checking a moving event stream. The full-debate strawman was *reactive*: it fact-checked claims as they appeared, so it could only verify what agents asserted. The Lean researcher could systematically interrogate the draft's *unstated assumptions*. The permit-closure finding is exactly this kind of finding: nobody in the debate *claimed* "permits are open," so the strawman had nothing to fact-check; the draft *assumed* permit availability without stating it, and the Lean researcher caught the assumption by attacking the document.

2. **The fresh-eyes reviser integrated cleanly.** Full debate ends with a judge summary compiling convergence/divergence across 6 agents. The Lean reviser produces a single integrated memo where every researcher finding has a clear disposition (cited / conceded / weaponised / explicitly rejected with reason). The output is deployment-ready, not analysis-ready.

3. **The framing critique landed harder.** The full debate's frame-challenger competed with 5 other position-holders for bandwidth. The Lean frame-challenger had the analyst's draft as a single target and produced a sharp DRIFTS verdict with specific reframing. The reviser obeyed the verdict cleanly.

The deeper observation: **the full debate's ceremony (tension pairs, convergence rules, OCC, event stream) is engineered to *expose* structural disagreement.** That's expensive and the right call when you genuinely don't know the right answer. For decisions where you have a draft answer and want adversarial review of it, the ceremony is overhead, not value.

## Token & wall-clock data (Experiment 3 detail)

| Phase | Agent | Tokens | Wall-clock |
|---|---|---|---|
| Analyst draft | 1 general-purpose | 44,405 | 3.5 min |
| Researcher | 1 general-purpose (background) | 57,654 | 3.2 min |
| Frame-challenger | 1 general-purpose (background, parallel) | 23,385 | 1.7 min |
| Reviser | 1 general-purpose (fresh) | 39,021 | 3.0 min |
| **Total** | **4 agent invocations** | **~164,500** | **~10 min** |

Compare to full debate (Experiment 2): ~600–700k tokens across 8+ agents over ~13 min.
Compare to baseline (Experiment 2): ~44k tokens, one agent, ~4 min.

## Key design decisions (validated by Experiment 3)

1. **Researcher + frame-challenger run in parallel, blind to each other.** Independent attack vectors beat correlated ones. If the researcher saw the frame-critique, they'd anchor on framing. If the frame-challenger saw the researcher's findings, they'd anchor on empirics.
2. **Reviser is a fresh agent, not the original analyst.** Authors over-weight their own draft. A fresh agent integrates critiques without motivated defence of prior position. Cost: one extra invocation. Worth it.
3. **No event stream, no MCP, no judge.** Three files of input → one file of output. The audit trail is the four files themselves.
4. **Frame-challenger has a tri-state verdict (HOLDS / DRIFTS / FAILS).** Manufactured framing crises produce noise; the prompt explicitly guards against this. FRAMING HOLDS must be a real option.
5. **Honest-integration rule.** Every researcher finding (VERIFIED / DISPUTED / UNSUBSTANTIATED / MISSING-EVIDENCE / KILLSHOT) must be either cited / conceded / weaponised / explicitly rejected with reason in the final memo. Ignoring a finding is a process violation visible in the changelog.

## When to use which mode

| Context | Recommended |
|---|---|
| Low-stakes / reversible / routine | Single agent |
| You've already iterated multi-round with a model | Single agent |
| Source materials are crystallised; closed-research domain | Single agent or Lean |
| Concrete go/no-go decision | **Lean** |
| Pre-commitment review of an existing draft | **Lean** |
| Open-research domain where killer facts may be in the wild | **Lean** |
| Default for $10k+ decisions | **Lean** |
| Framing is genuinely contested (multiple reasonable units of analysis) | Full debate |
| Need to preserve named residual disagreements | Full debate |
| Irreversible / multi-million / public-facing | Full debate |
| Suspect systematic single-framework bias | Full debate |

The intuitive heuristic, "full debate for high-stakes," should be revised. Most concrete high-stakes decisions are better served by Lean. Full debate's marginal value lies in *exposing* disagreement, not *resolving* it.

## What Lean does NOT replace

- **Named residual disagreements.** The full debate ended Experiment 2 with two agents unresolved on whether the silver-wave thesis survives the vehicle's failure. Lean collapses to one recommendation. If you want to preserve genuine residual disagreement, Lean won't.
- **Multi-framework dialectic.** Lean has one analyst's framework. The full debate has six. If the analyst's framework has a systematic blind spot, Lean's reviewers can catch *content* gaps but not necessarily *framework* gaps.
- **Convergence-theatre detection.** Lean has no analog to the debate skill's convergence-discipline rule. For genuinely contested topics this might matter.

## Failure modes observed across experiments

1. **Timer sub-agents exited early** in both full-debate runs: agents handed a list of long sleeps tend to skip them and publish all warnings back-to-back. The debate skill now gives the timer absolute Unix-timestamp targets and a chunked busy-wait loop, which fixed it.
2. **Workspace state files denied** for some sub-agents (Write permission on `debate-workspace/`). Mitigated by the `debate_set_final_position` MCP tool storing final stances in the event store.
3. **Summariser sub-agent exited early** for the same reason as the timer; resolved the same way (and by moving the summariser off haiku, which skipped poll iterations).
4. **Reviser timidity risk** (Lean): a fresh agent integrating critiques may be too deferential to the draft. The prompt explicitly warns against this; observed once in soft form. Not severe, worth monitoring.

## Open questions

1. **Sample size is n=3 simulations.** The "Lean beats full debate" finding rests on one experiment. Needs replication on harder topics where the analyst draft is likely to have systematic blind spots.
2. **Does Lean underperform when the framing is genuinely contested?** Untested. Hypothesis: yes. When "what's the right question?" has multiple defensible answers, six debaters surface them better than one frame-challenger.
3. **Could Lean use a stronger reviewer setup?** Two researchers with different search strategies? A second frame-challenger? Each addition has measurable cost.
4. **Does the blind-reviewers design hold up?** Could a single combined reviewer produce equivalent output at lower cost? Untested.
5. **Failure mode of an analyst with poor framework choice.** If the original analyst picks the wrong unit of analysis, the frame-challenger should catch it, but only if the right framing is reachable from the materials. Untested on cases where the right framing requires domain expertise the analyst lacks.

## Conclusion

Across two structured comparisons and one Lean validation run, the multi-agent debate framework's value did not scale with agent count. The dominant value came from two roles: a dedicated empirical researcher (strawman) and a frame-challenger. The remaining ceremony (tension-pair debaters, convergence rules, judge synthesis) added marginal value above this baseline.

Lean preserves these two high-leverage roles in a smaller four-agent structure, replaces the event-stream protocol with simple file-passing, and produces a deployable artifact rather than a panel of preserved disagreements. In the one direct comparison run, it produced strictly better output than the full debate at ~26% of the cost. n=1, so caution, but it reframes the cost-benefit calculation for most high-stakes concrete decisions.

The full debate remains the right tool when the goal is *exposing* structural disagreement, not *resolving* it into a single recommendation. For everything else, Lean is probably the better default.
