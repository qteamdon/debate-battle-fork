"""Tests for the SPA static mount.

If the Vite build has produced `web/static/dist/index.html`, `GET /` should
return the bundled HTML referencing assets. If it hasn't been built, the
mount is skipped and `GET /` returns 404 — which is the documented behaviour
during API-only development.
"""

import socket
from pathlib import Path

import httpx
import pytest

from debate_event_store.store import EventStore
from debate_event_store.web import server as server_module
from debate_event_store.web.server import WebServer


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


DIST_DIR = (
    Path(server_module.__file__).parent / "static" / "dist"
)
INDEX_HTML = DIST_DIR / "index.html"


@pytest.fixture
def store_with_server():
    store = EventStore()
    server = WebServer(store)
    port = _free_port()
    url = server.ensure_started(host="127.0.0.1", port=port)
    yield store, server, url
    server.stop()


def test_static_mount_serves_index_when_dist_exists(store_with_server) -> None:
    """When the bundle is present, `/` returns the built HTML with /assets/ refs."""
    if not INDEX_HTML.exists():
        pytest.skip(
            f"SPA bundle not built at {INDEX_HTML} — run "
            "`cd web/frontend && npm install && npm run build`"
        )

    _, _, url = store_with_server
    r = httpx.get(url + "/", timeout=5.0)
    assert r.status_code == 200
    ctype = r.headers.get("content-type", "")
    assert "text/html" in ctype
    body = r.text
    assert "<script" in body
    assert "/assets/" in body
    assert "Live Debate" in body  # comes from index.html <title>


def test_root_404_when_dist_missing(store_with_server) -> None:
    """Without the bundle the mount is skipped and `/` returns 404."""
    if INDEX_HTML.exists():
        pytest.skip("SPA bundle is built — the absent-bundle path is not exercised.")

    _, _, url = store_with_server
    r = httpx.get(url + "/", timeout=5.0)
    assert r.status_code == 404
