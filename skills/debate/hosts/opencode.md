# OpenCode host

OpenCode can load this skill. It does not use Claude's `TaskOutput`, `$ARGUMENTS`, or `sonnet` / `opus` aliases.

## Request

There is no `$ARGUMENTS`. The topic is the current user message.

## Spawn

Use the Task tool with these named agents (see `opencode.json`):

- Debaters, strawman, summariser → `debate-worker`
- Researcher / web-heavy seats → `debate-research`
- Judge / synthesizer / reviser → `debate-editor`

Do not pass `model: "sonnet"` or `model: "opus"`. Pin cheap models on `debate-worker` and `debate-research` in `opencode.json` if you want. Leave `debate-editor` on the primary model.

There is no `TaskOutput(task_id, block=true)`. Wait the way OpenCode waits for child tasks.

## Tools

MCP tools may show up as `debate_publish` or as `debate-events_debate_publish`. Use the names in your tool list. The clock is `debate_start_clock` (or the prefixed form). Do not spawn a timer agent.

## Skills path

This repo exposes skills through `.opencode/skills/` (symlinks to `skills/`).
