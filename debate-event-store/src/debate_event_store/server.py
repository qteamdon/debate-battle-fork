"""MCP server entry point for the debate event store."""

import asyncio
import json

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from .store import EventStore
from .web.server import WebServer

store = EventStore()
app = Server("debate-event-store")

# Lazily constructed on first `debate_visualize` or `debate_post_summary` call.
# Stays alive for the process lifetime once created.
web_server: WebServer | None = None


def _get_or_create_web_server() -> WebServer:
    global web_server
    if web_server is None:
        web_server = WebServer(store)
    return web_server


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="debate_publish",
            description=(
                "Publish an event to the debate stream. "
                "First publish is a position claim and requires the agent to have caught up to the tip (OCC). "
                "Subsequent publishes go through immediately."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Your agent ID (e.g. 'frank')",
                    },
                    "text": {
                        "type": "string",
                        "description": "Event text (max 1500 chars). Use prefix conventions: POSITION: / ARGUMENT: / REBUTTAL @name: / CONCEDE @name: / CRITIQUE @name: / ROLE:",
                        "maxLength": 1500,
                    },
                },
                "required": ["agent_id", "text"],
            },
        ),
        Tool(
            name="debate_catch_up",
            description=(
                "Get new events since your last read position. "
                "Your own events are filtered out. "
                "Updates your read position to the current tip."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Your agent ID",
                    },
                },
                "required": ["agent_id"],
            },
        ),
        Tool(
            name="debate_status",
            description="Get current debate stream status: tip, event count, and per-agent positions/publish counts.",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="debate_dump_markdown",
            description="Write the full debate transcript as a formatted markdown file to disk. Returns the file path.",
            inputSchema={
                "type": "object",
                "properties": {
                    "output_path": {
                        "type": "string",
                        "description": "File path to write the markdown to (e.g. '/tmp/debate.md')",
                    },
                },
                "required": ["output_path"],
            },
        ),
        Tool(
            name="debate_set_final_position",
            description=(
                "Store an agent's final position synthesis (post-convergence) "
                "for display in the Results overlay. The initial POSITION "
                "event is the agent's opening claim; this carries where they "
                "actually ended up after rebuttals, concessions, and "
                "convergence. Markdown is rendered as-is. Cleared on reset."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "The agent_id this final position belongs to.",
                    },
                    "markdown": {
                        "type": "string",
                        "description": "The agent's final position as markdown.",
                    },
                },
                "required": ["agent_id", "markdown"],
            },
        ),
        Tool(
            name="debate_set_verdict",
            description=(
                "Store the judge's final verdict in-memory alongside the event stream. "
                "Broadcasts a `verdict` SSE envelope to the visualisation so the "
                "results view updates without any disk roundtrip. Replaces any "
                "previously-set verdict for the current debate; cleared on reset."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "markdown": {
                        "type": "string",
                        "description": "The verdict as markdown text. Rendered as-is in the results overlay.",
                    },
                },
                "required": ["markdown"],
            },
        ),
        Tool(
            name="debate_reset",
            description="Reset the event store for a new debate. Clears all events and agent positions.",
            inputSchema={
                "type": "object",
                "properties": {
                    "per_agent_event_limit": {
                        "type": "integer",
                        "description": "Max events each agent can publish (default: 200)",
                        "default": 200,
                    },
                },
            },
        ),
        Tool(
            name="debate_visualize",
            description=(
                "Start (or reuse) the local debate visualisation web server. "
                "Idempotent: subsequent calls return the existing URL. "
                "Always binds to 127.0.0.1 — no external exposure."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "port": {
                        "type": "integer",
                        "description": "Preferred port (default 8770; falls back to next free port)",
                        "default": 8770,
                    },
                },
            },
        ),
        Tool(
            name="debate_get_recent_events",
            description=(
                "Read events with position > since_position as a structured list. "
                "Stateless: does NOT mutate any agent's read position. "
                "Intended for the summariser subagent (not for debaters — debaters use debate_catch_up)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "since_position": {
                        "type": "integer",
                        "description": "Return events with position strictly greater than this.",
                        "default": 0,
                    },
                },
            },
        ),
        Tool(
            name="debate_post_summary",
            description=(
                "Broadcast a summary envelope to the visualisation's summary SSE channel. "
                "Does NOT write to the event log — debaters never see it. "
                "Lazily auto-starts the web server if it isn't running yet."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Haiku summary text (markdown allowed).",
                    },
                    "tensions": {
                        "type": "array",
                        "description": "Detected tensions; arbitrary objects passed through to the client.",
                        "items": {"type": "object"},
                        "default": [],
                    },
                    "convergences": {
                        "type": "array",
                        "description": "Detected convergences; arbitrary objects passed through to the client.",
                        "items": {"type": "object"},
                        "default": [],
                    },
                },
                "required": ["text"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "debate_publish":
        result = await store.publish(arguments["agent_id"], arguments["text"])
    elif name == "debate_catch_up":
        result = await store.catch_up(arguments["agent_id"])
    elif name == "debate_status":
        result = await store.status()
    elif name == "debate_dump_markdown":
        result = await store.dump_markdown(arguments["output_path"])
    elif name == "debate_set_final_position":
        result = await store.set_final_position(
            arguments["agent_id"], arguments["markdown"]
        )
    elif name == "debate_set_verdict":
        result = await store.set_verdict(arguments["markdown"])
    elif name == "debate_reset":
        limit = arguments.get("per_agent_event_limit", 200)
        result = await store.reset(limit)
    elif name == "debate_visualize":
        # Loopback only — design invariant. We accept a port override but
        # never let a caller widen the bind beyond 127.0.0.1.
        port = arguments.get("port", 8770)
        ws = _get_or_create_web_server()
        already_running = ws.is_running
        url = ws.ensure_started(port=port)
        result = {
            "url": url,
            "host": ws.host,
            "port": ws.port,
            "already_running": already_running,
        }
    elif name == "debate_get_recent_events":
        since = arguments.get("since_position", 0)
        events = await store.get_recent(since)
        result = {"events": events, "tip": store.tip}
    elif name == "debate_post_summary":
        text = arguments["text"]
        tensions = arguments.get("tensions") or []
        convergences = arguments.get("convergences") or []
        # The summariser subagent may fire before the operator has opened the UI;
        # auto-start so it doesn't have to gate on visualize being called first.
        ws = _get_or_create_web_server()
        ws.ensure_started()
        envelope = {
            "type": "summary",
            "text": text,
            "tensions": tensions,
            "convergences": convergences,
            "as_of_position": store.tip,
        }
        ws.event_bus.publish_summary(envelope)
        result = {
            "success": True,
            "broadcast_to_clients": ws.event_bus.summary_subscriber_count(),
        }
    else:
        result = {"error": f"Unknown tool: {name}"}

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


def main() -> None:
    asyncio.run(_run())


async def _run() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options(),
        )


if __name__ == "__main__":
    main()
