# debate-event-store

An MCP server providing an in-memory event-sourced stream for multi-agent debates, plus an embedded FastAPI + SSE web UI for live visualisation.

## Installation

If you installed the debate-battle plugin, you already have this: the plugin's `.mcp.json` registers the server automatically against the plugin's install directory.

To run it standalone (not published to PyPI):

```bash
uv run --directory /path/to/debate-battle/debate-event-store debate-event-store
```

Or build and install the wheel (see "Building a wheel" below). The wheel ships with the built React SPA, so no Node toolchain is required at install time.

## Usage

### As an MCP server

MCP configuration (`.mcp.json` or `~/.claude.json`):

```json
{
  "mcpServers": {
    "debate-events": {
      "command": "uv",
      "args": [
        "run", "--directory",
        "/path/to/debate-battle/debate-event-store",
        "debate-event-store"
      ]
    }
  }
}
```

With the wheel installed, `"command": "debate-event-store"` works directly, as does `python -m debate_event_store.server`.

Inside the MCP session, call `debate_visualize` to start the embedded web server (it binds to `127.0.0.1:8770` by default; loopback only — no external exposure). The tool returns the URL.

### Visualisation only (no MCP)

```bash
python -m debate_event_store.web.server
```

This starts the FastAPI server standalone on `http://127.0.0.1:8770`. Useful for testing the UI against a fresh empty store.

### Try the UI with a canned debate

```bash
cd debate-event-store
uv run python scripts/ui_demo.py
```

The script publishes a 10-event debate sequence (positions, rebuttals with steelmen, a grounding, a concede, a moderator inject, a convergence) plus a haiku summary, then keeps the server alive. Open `http://127.0.0.1:8770` to see every panel populated.

## MCP tools

| Tool | Description |
|------|-------------|
| `debate_publish` | Publish an event. First publish enforces OCC (position claim). |
| `debate_catch_up` | Get new events since last read position (own events filtered out). |
| `debate_status` | Get current stream status. |
| `debate_dump_markdown` | Write the transcript to disk as markdown. The judge reads this file. |
| `debate_set_final_position` | Store a per-agent final position summary, replacing the opening POSITION in the web UI's Results overlay. Called by the judge. |
| `debate_set_verdict` | Store the judge's final verdict in-memory alongside the event stream and broadcast it via SSE so the web UI's Results overlay updates live. |
| `debate_start_clock` | Start the in-process clock. Publishes four ORCHESTRATOR checkpoints. Idempotent while running. |
| `debate_reset` | Reset the store for a new debate. Also cancels a running clock. |
| `debate_visualize` | Start the embedded web server (idempotent, 127.0.0.1 only). |
| `debate_get_recent_events` | Stateless read since a position. For the summariser. |
| `debate_post_summary` | Broadcast a summary envelope to the SSE channel. **Never writes to the event log** — debaters never see it. For the summariser. |

## HTTP endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | The SPA shell |
| GET | `/api/status` | `{tip, event_count, agents, per_agent_event_limit}` |
| GET | `/api/events` | Full structured event list |
| GET | `/api/stream` | SSE — snapshot on connect, then `event` / `summary` / `reset` envelopes |
| POST | `/api/moderator` | Body: `{text}`. Publishes via `agent_id="moderator"` after prefix normalisation |

## Architecture

The MCP stdio server and the FastAPI server share a single `EventStore` but run on separate event loops. The FastAPI server lives in a daemon thread; an `EventBus` bridges store mutations from the MCP loop to per-client SSE subscribers on the uvicorn loop via `asyncio.run_coroutine_threadsafe`. See [`../docs/architecture.md`](../docs/architecture.md) for the full architecture.

The summariser is a separate Claude Code subagent spawned by the `debate` skill. It posts summaries via `debate_post_summary` — those go to a side-channel only humans see, never to the event log.

## Development

```bash
# Backend
uv venv .venv && source .venv/bin/activate
uv pip install -e ".[dev]"
pytest -v

# Frontend
cd src/debate_event_store/web/frontend
npm install
npm run build      # builds to ../static/dist/
npm run dev        # Vite dev server with /api proxy to 127.0.0.1:8770
```

## Building a wheel

```bash
cd src/debate_event_store/web/frontend && npm install && npm run build
cd ../../../..   # back to debate-event-store/
uv build --wheel
```

The wheel includes the built `web/static/dist/` bundle and excludes the Vite source tree.
