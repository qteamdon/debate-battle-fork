"""FastAPI + SSE server embedded in the debate-event-store MCP package.

Boots a uvicorn server on a daemon thread with its own event loop. The
EventStore mutates on the MCP stdio loop; this server's routes live on the
uvicorn loop. The EventBus bridges the two threads via
`asyncio.run_coroutine_threadsafe`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

from ..store import Event, EventStore
from .broadcast import EventBus

logger = logging.getLogger(__name__)

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8770
MAX_PORT_ATTEMPTS = 20

# Recognised debate event prefixes. Case-sensitive match per the debate
# framework conventions. If a moderator's text already begins with one of
# these, we leave it alone; otherwise we prepend "MODERATOR: ".
RECOGNISED_PREFIXES: tuple[str, ...] = (
    "POSITION:",
    "ARGUMENT:",
    "REBUTTAL",
    "CONCEDE",
    "CRITIQUE",
    "ROLE:",
    "MODERATOR:",
    "CONVERGENCE:",
    "GROUNDING:",
)


def _normalise_moderator_text(text: str) -> str:
    for prefix in RECOGNISED_PREFIXES:
        if text.startswith(prefix):
            return text
    return f"MODERATOR: {text}"


class WebServer:
    def __init__(self, store: EventStore) -> None:
        self.store = store
        self.event_bus = EventBus()
        self.app = FastAPI(title="Debate Event Store Visualisation")
        self.host: str | None = None
        self.port: int | None = None
        self._server: uvicorn.Server | None = None
        self._server_thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._loop_ready = threading.Event()
        self._url: str | None = None

        self._setup_routes()
        self._register_store_hooks()

    # ---- store wiring ----

    def _register_store_hooks(self) -> None:
        self.store.set_on_event_published(self._on_event_published)
        self.store.set_on_reset(self._on_reset)
        self.store.set_on_verdict_set(self._on_verdict_set)

    def _on_event_published(self, event: Event) -> None:
        self.event_bus.publish_event({"type": "event", "event": asdict(event)})

    def _on_reset(self, payload: dict) -> None:
        self.event_bus.publish_reset({"type": "reset", **payload})

    def _on_verdict_set(self, markdown: str) -> None:
        self.event_bus.publish_verdict({"type": "verdict", "markdown": markdown})

    # ---- routes ----

    def _setup_routes(self) -> None:
        app = self.app
        store = self.store
        bus = self.event_bus

        @app.get("/api/status")
        async def get_status() -> JSONResponse:
            status = await store.status()
            status["per_agent_event_limit"] = store.per_agent_event_limit
            return JSONResponse(status)

        @app.get("/api/events")
        async def get_events() -> JSONResponse:
            events = await store.list_events()
            return JSONResponse({"tip": store.tip, "events": events})

        @app.get("/api/results")
        async def get_results() -> JSONResponse:
            events = await store.list_events()
            ended = any(
                isinstance(e.get("text"), str)
                and e["text"].startswith("ORCHESTRATOR: Time is up")
                for e in events
            )
            seen: set[str] = set()
            positions: list[dict] = []
            for e in events:
                text = e.get("text", "")
                agent = e.get("agent_id", "")
                if agent in seen or not isinstance(text, str) or not text.startswith("POSITION"):
                    continue
                seen.add(agent)
                positions.append({
                    "agent_id": agent,
                    "position": e.get("position"),
                    "text": text,
                    "timestamp": e.get("timestamp"),
                })

            return JSONResponse({
                "ended": ended,
                "positions": positions,
                "final_positions": store.final_positions,
                "verdict_markdown": store.verdict_markdown,
            })

        @app.post("/api/moderator")
        async def post_moderator(request: Request) -> JSONResponse:
            try:
                body = await request.json()
            except Exception:
                return JSONResponse(
                    {"success": False, "error": "invalid_json"},
                    status_code=400,
                )
            if not isinstance(body, dict) or "text" not in body:
                return JSONResponse(
                    {"success": False, "error": "missing_text"},
                    status_code=400,
                )
            text = body["text"]
            if not isinstance(text, str):
                return JSONResponse(
                    {"success": False, "error": "text_not_string"},
                    status_code=400,
                )
            normalised = _normalise_moderator_text(text)
            result = await store.publish("moderator", normalised)
            return JSONResponse(result)

        @app.get("/api/stream")
        async def stream(request: Request) -> EventSourceResponse:
            event_q = bus.subscribe("event")
            summary_q = bus.subscribe("summary")
            reset_q = bus.subscribe("reset")
            verdict_q = bus.subscribe("verdict")

            # Snapshot captured BEFORE any new fan-out reaches our queues.
            # New events that arrive between the snapshot and the first read
            # are still queued; the client may see a duplicate at most. The
            # frontend dedupes by `position` (Phase 3 concern).
            snapshot_events = await store.list_events()
            snapshot_status = await store.status()
            snapshot_status["per_agent_event_limit"] = store.per_agent_event_limit
            snapshot_payload = {
                "type": "snapshot",
                "events": snapshot_events,
                "status": snapshot_status,
                # Embed the current verdict in the snapshot so clients that
                # connect AFTER the judge has fired don't have to wait for the
                # next push to populate the results overlay.
                "verdict_markdown": store.verdict_markdown,
                "final_positions": store.final_positions,
            }

            # Rehydrate the Haiku Mind panel for clients connecting AFTER the
            # summariser has finished. Without this, the panel sits empty on
            # page refresh even though summaries were broadcast in real time.
            # The bus retains the most recent summary envelope; we replay it
            # right after the events snapshot so SummaryStore ingests it like
            # any normal summary push.
            last_summary = bus.last_summary

            async def generator():
                try:
                    yield {"data": json.dumps(snapshot_payload)}
                    if last_summary is not None:
                        yield {"data": json.dumps(last_summary)}
                    while True:
                        if await request.is_disconnected():
                            break
                        envelope = await _next_envelope(
                            event_q, summary_q, reset_q, verdict_q
                        )
                        if envelope is None:
                            continue
                        message: dict[str, Any] = {"data": json.dumps(envelope)}
                        if envelope.get("type") == "event":
                            pos = envelope.get("event", {}).get("position")
                            if pos is not None:
                                message["id"] = str(pos)
                        yield message
                finally:
                    bus.unsubscribe("event", event_q)
                    bus.unsubscribe("summary", summary_q)
                    bus.unsubscribe("reset", reset_q)
                    bus.unsubscribe("verdict", verdict_q)

            return EventSourceResponse(generator())

        # SPA static mount. MUST come AFTER all /api/* routes — StaticFiles
        # with html=True at "/" would otherwise shadow them. If the bundle is
        # missing we log and skip; the API still works without the UI.
        dist_dir = Path(__file__).parent / "static" / "dist"
        if dist_dir.exists():
            app.mount(
                "/",
                StaticFiles(directory=str(dist_dir), html=True),
                name="spa",
            )
        else:
            logger.info(
                "SPA assets not found at %s; build with "
                "`cd web/frontend && npm install && npm run build` to enable the UI.",
                dist_dir,
            )

    # ---- lifecycle ----

    @staticmethod
    def _is_port_available(host: str, port: int) -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind((host, port))
                return True
        except OSError:
            return False

    @property
    def is_running(self) -> bool:
        return self._server_thread is not None and self._server_thread.is_alive()

    def ensure_started(self, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> str:
        """Idempotent: start the server thread on first call, return URL.

        On subsequent calls returns the same URL without restarting.
        """
        if self.is_running:
            assert self._url is not None
            return self._url

        actual_port = port
        for _ in range(MAX_PORT_ATTEMPTS):
            if self._is_port_available(host, actual_port):
                break
            actual_port += 1
        else:
            raise RuntimeError(
                f"No port available in range {port}-{port + MAX_PORT_ATTEMPTS - 1}"
            )

        self.host = host
        self.port = actual_port
        self._url = f"http://{host}:{actual_port}"

        config = uvicorn.Config(self.app, host=host, port=actual_port, log_level="warning")
        self._server = uvicorn.Server(config)

        self._loop_ready.clear()
        self._server_thread = threading.Thread(
            target=self._thread_main, name="debate-web-server", daemon=True
        )
        self._server_thread.start()

        # Wait for the loop reference to be captured before returning so any
        # immediate hook firing on the MCP loop has a target.
        self._loop_ready.wait(timeout=5.0)

        # Wait until uvicorn has bound the listener. Avoids races in tests
        # where the caller hits the URL immediately after ensure_started.
        self._wait_until_listening(host, actual_port, timeout=5.0)

        return self._url

    def _thread_main(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop
        self.event_bus.attach_loop(loop)
        self._loop_ready.set()
        try:
            assert self._server is not None
            loop.run_until_complete(self._server.serve())
        finally:
            try:
                loop.close()
            except Exception:
                pass

    @staticmethod
    def _wait_until_listening(host: str, port: int, timeout: float) -> None:
        import time as _time
        end = _time.monotonic() + timeout
        while _time.monotonic() < end:
            try:
                with socket.create_connection((host, port), timeout=0.2):
                    return
            except OSError:
                _time.sleep(0.05)
        # Probably failed to start; let the caller discover on first request.

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
            if self._server_thread is not None:
                self._server_thread.join(timeout=5.0)
            self._server = None
            self._server_thread = None
            self._loop = None
            # Detach the bus so post-stop hook fires (e.g. test teardown
            # resetting the store) don't try to schedule onto a dead loop.
            self.event_bus.attach_loop(None)


async def _next_envelope(*queues: asyncio.Queue) -> dict | None:
    """Await whichever of the supplied channel queues fires first.

    Wakes every second to give the generator a chance to observe client
    disconnect via `request.is_disconnected()`.
    """
    get_tasks = {asyncio.create_task(q.get()): q for q in queues}
    try:
        done, pending = await asyncio.wait(
            get_tasks.keys(),
            timeout=1.0,
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        for task in done:
            return task.result()
        return None
    finally:
        for task in get_tasks:
            if not task.done():
                task.cancel()


def main() -> None:
    """Tiny shim so a smoke run can do `python -m debate_event_store.web.server`."""
    store = EventStore()
    server = WebServer(store)
    url = server.ensure_started()
    print(url)
    try:
        if server._server_thread is not None:
            server._server_thread.join()
    except KeyboardInterrupt:
        server.stop()


if __name__ == "__main__":
    main()
