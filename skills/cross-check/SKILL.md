---
name: cross-check
description: Pressure-test a position the user already has. Copies their words, then two blind reviewers attack (empirical researcher + frame-challenger) and a fresh synthesizer writes a short briefing. Use when the user wants a cross-check of their thinking, says "am I wrong", wants their plan attacked, or asks for a quick challenge of an existing view. Do not use when they want a new recommendation written from scratch (use lean) or a full live debate (use debate).
---

# Cross-Check

**The user already has a position. Attack it. Do not rewrite it first.**

**Host files:** `skills/cross-check/hosts/claude.md` or `skills/cross-check/hosts/opencode.md`. If `$ARGUMENTS` and `TaskOutput` exist, you are on Claude. Otherwise you are on OpenCode — read the OpenCode host file. There is no `$ARGUMENTS` on OpenCode; the position is the current user message.

Two reviewers, blind to each other. One short briefing. No MCP event stream, no live UI, no 6-agent arena, no analyst draft.

## Why this is not `lean`

`lean` asks an analyst to write a recommendation, then attacks that draft. That is the right tool when the user wants an answer produced.

This skill is the right tool when the user already stated a view and wants it pressure-tested. Copy their words. Do not invent a position. Do not "improve" the wording before review.

## When NOT to use this skill

- The user wants a **new** recommendation written and then reviewed → use `lean`.
- The framing is genuinely contested and they want disagreement preserved across several frameworks, live → use `debate`.
- There is no position at all, only a vague topic, and they will not supply one when asked → stop and ask. Do not invent a position.

## User Request

$ARGUMENTS

## Phase 1 — Parse Inputs

Extract these from the user request. **Position is required.** If they only named a topic, ask them to state the view they want attacked.

| Parameter | Default |
|---|---|
| `position` | *(required — the user's own view, plan, or claim)* |
| `topic` | short label for the position; derive from the position if missing |
| `materials_path` | current working directory |
| `write_findings` | `true` — save the briefing to a dated file so you do not have to copy-paste |

No `agent_count`. Fixed: 1 researcher + 1 frame-challenger + 1 synthesizer = 3 agent invocations. The orchestrator writes the user's position itself. That is not an agent.

## Phase 2 — Workspace and capture

```bash
mkdir -p debate-workspace/cross-check
```

No event-store reset. No visualisation server.

**Write the user's position yourself.** Use the Write tool. Do not spawn an agent to do this. Do not steelman, summarise, or tidy the argument. Copy their words. You may add a title and a one-line topic.

Write to `debate-workspace/cross-check/00-user-position.md`:

```markdown
# User Position — {topic}

## In the user's words

{position}
```

If the request has no position, ask. Wait. Do not invent a position.

## Phase 3 — Adversarial review (parallel background)

Spawn TWO agents in **parallel** as background tasks. Both read `00-user-position.md`. **Neither reads the other's file.**

```
Task(
  subagent_type = "general-purpose",
  description = "Cross-check researcher",
  run_in_background = true,
  prompt = <RESEARCHER_PROMPT below>
)

Task(
  subagent_type = "general-purpose",
  description = "Cross-check frame-challenger",
  run_in_background = true,
  prompt = <FRAME_PROMPT below>
)
```

### Researcher Prompt

Fill `{topic}`, `{materials_path}`.

Read `skills/cross-check/prompts/researcher.md`. Fill `{topic}`, `{materials_path}`. Use that text as the Task prompt.

### Frame-Challenger Prompt

Fill `{topic}`, `{materials_path}`.

Read `skills/cross-check/prompts/frame-challenger.md`. Fill `{topic}`, `{materials_path}`. Use that text as the Task prompt.

Wait for **both** to complete (`TaskOutput(task_id, block=true)` for each, called in a single message).

## Phase 4 — Synthesize (foreground)

Spawn ONE NEW agent. Not a reviewer. Fresh eyes. Its job is a short briefing for the human, not a new recommendation they did not ask for.

```
Task(
  subagent_type = "general-purpose",
  description = "Cross-check synthesizer",
  prompt = <SYNTHESIZER_PROMPT below>
)
```

### Synthesizer Prompt

Fill `{topic}`.

Read `skills/cross-check/prompts/synthesizer.md`. Fill `{topic}`. Use that text as the Task prompt.

Wait for the synthesizer to return.

## Phase 5 — Present Results

Present in this order. Do not add extra sections. Do not paste the full critique files into chat.

1. **What survived**
2. **What to challenge** (ranked)
3. **Killshot**, if any — or say none
4. **Framing** (HOLDS / DRIFTS / FAILS) and the better question if the frame moved
5. **Residual disagreement** — if the two reviews conflict, say so. Do not pick a winner in chat.
6. **Next steps** (three bullets)
7. **Files:** `00-user-position.md`, `01-researcher-critique.md`, `02-frame-critique.md`, `03-briefing.md` under `debate-workspace/cross-check/`
8. **Save the briefing** to a findings file unless `write_findings` is false. Run `python3 scripts/findings_filename.py --topic "{topic}"` if the script exists; otherwise name it `{YYYYMMDD} - {slug}-{n}.md` under `debate-workspace/findings/` (slug = first 20 letters/digits of the topic, n starts at 1). Write the same six headings you showed in chat. Print `Saved to: {path}`.

If there was no killshot and FRAMING HOLDS, say plainly: the position survived a cross-check. That is confirmation, not a failed run.

If a killshot breaks the position, lead with that.

If FRAMING FAILS **and** there is a killshot, offer the `debate` skill on the better question. If they now want a new recommendation written, offer `lean`.

## Operational Notes

- **Why no analyst.** The user is the analyst. An extra draft would be a different document than the one they asked us to check.
- **Why the orchestrator copies the words.** Sub-agents "helpfully" rewrite. That would cross-check a steelman, not the user.
- **Why blind reviewers.** Same as `lean`. Independent attacks beat correlated ones.
- **Why a synthesizer, not a reviser.** A reviser produces a new memo. A synthesizer reports what happened to the existing view.
- **Failure modes.** Synthesizer defends the user. Synthesizer writes a new plan. Frame-challenger invents a crisis (FRAMING HOLDS must stay real). Researcher overreaches on a weak source — the synthesizer must judge source quality.
