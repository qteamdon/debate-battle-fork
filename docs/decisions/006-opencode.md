# 006 — OpenCode install path

## Why

The original plugin is Claude Code only. OpenCode can read `SKILL.md`. It cannot run Claude `TaskOutput` or `sonnet` / `opus` names.

People who want cheaper or local models need a way in that does not break the Claude plugin.

## What we did

Add `opencode.json` with the local MCP server and three hidden subagents.

Add `.opencode/skills/` symlinks so OpenCode finds the same skill folders.

Write OpenCode host notes. Claude host notes stay.

README says how to run it.

## What we did not do

We did not rewrite every Task call into two copies.

We did not change the Claude plugin install path.

We did not pick a default local model. Users pin that in `opencode.json`.
