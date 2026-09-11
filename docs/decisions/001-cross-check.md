# 001 — Cross-check skill


## Why

People often already have a view. They want it attacked, not rewritten.

The full debate is a 6-agent live show. That is too much for "am I wrong?"

`lean` writes a new recommendation, then attacks that draft. That wastes a pass when the user already stated a position.

## What we did

Add a `cross-check` skill.

It copies the user's words. Two reviewers attack them in parallel. A third agent writes a short briefing.

It does not spawn an analyst. It does not run the live UI. It does not force one answer if the two critiques disagree.

## What we did not do

We did not change how `debate` or `lean` run.

We did not add OpenCode support. That comes later.

## Upstream

This is a new skill in the same style as `lean`. It is safe to offer on its own.
