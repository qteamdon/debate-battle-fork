# Claude Code host

This is the current working host. Spawn and wait as follows.

- User request is `$ARGUMENTS`.
- Spawn with `Task(subagent_type = "general-purpose", run_in_background = ..., model = "sonnet" | "opus")`.
- Wait with `TaskOutput(task_id, block = true)`.
- Model aliases: `sonnet`, `opus`. Do not use `haiku` for debaters.
- MCP tools come from the plugin `.mcp.json`.
- Collector stays in `SKILL.md` because it uses `TaskOutput`.
