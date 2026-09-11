# 005 — Shared prompts plus a thin host layer


## Why

The debate skill mixed Claude `Task(...)` calls with the actual agent briefs. OpenCode cannot run that. Two huge copies would drift.

## What we did

Move agent briefs into `prompts/`. Keep phases in `SKILL.md`. Put spawn notes in `hosts/claude.md`. Leave `hosts/opencode.md` as a stub.

Prompt files have no `Task(` and no `$ARGUMENTS`.

Collector stays in the debate skill because it uses `TaskOutput`.

## What we did not do

We did not wire OpenCode.

We did not change how a debate argues.

## Upstream

Claude behaviour stays the same. They can ignore the OpenCode stub.
