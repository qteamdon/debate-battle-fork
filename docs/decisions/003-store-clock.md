# 003 — Clock in the event store


## Why

The timer was an LLM that slept. Cheap models skipped the sleeps. That is why even the timer used sonnet.

Sleeping is not a reasoning job.

## What we did

Add `debate_start_clock`. The store process publishes the four `ORCHESTRATOR:` checkpoints.

The debate skill starts that clock. It does not spawn a timer sub-agent.

Reset cancels the clock. A second start while it is running does nothing.

## What we did not do

We did not rewrite the summariser. It still polls.

We did not add OpenCode support.

## Upstream

The original README already called the timer fragile. This is the highest-value code PR to offer back.
