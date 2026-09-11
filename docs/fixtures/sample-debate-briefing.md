# Debate Briefing

## What Survived

The claim that the current architecture can ship without a rewrite held. Two agents conceded the OCC design is sound. No grounding disputed the core mechanism.

## What To Challenge

1. Treating "operators will use all three panes" as a success metric. That is a proxy, not an outcome.
2. The assumption that a 5-minute window is enough for every topic. The strawman never checked run-length against topic difficulty.

## Killshot

None. The frame-challenger asked whether a live arena is the right unit of analysis for a cross-check. That is a better product question. It does not falsify the event store.

## Framing

The question that should have been debated: "when does a user need a 6-agent arena, and when do they need a file-only cross-check?" The original "is the architecture over-engineered?" still matters, but it is downstream.

## Residual Disagreement

Alice still wants the arena as the default. Bob wants it opt-in. They agree the store should stay. They do not agree on the default skill.

## Next Steps

- Keep the arena. Do not delete it.
- Add a cross-check skill for people who already have a position.
- Measure which skill people actually invoke before changing the default.

## Appendix — Rankings

### 1st — alice (empiricist) — Keep the arena; measure before cutting
**Position:** Keep the arena. Measure which skill people invoke before changing the default.

### 2nd — bob (rationalist) — Arena opt-in; cross-check as default
**Position:** Arena stays. It should be opt-in.

Process notes live here so the briefing above stays short.
