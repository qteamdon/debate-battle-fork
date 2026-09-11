# 007 — Findings file

## Why

The briefing lived in chat. Working files lived under `debate-workspace/lean/` or similar. People still copied the answer into a note by hand. There was no flag they missed. The skills did not write a dated file.

## What we did

After each run, save the same briefing to `debate-workspace/findings/{YYYYMMDD} - {slug}-{n}.md`.

Default is on. Say `write_findings=false` to skip.

## What we did not do

We did not change the briefing shape.

We did not commit those files. `debate-workspace/` stays gitignored.

## Upstream

Small, useful, host-agnostic. Include with the other output changes.
