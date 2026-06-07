"""Tests for the MCP server tool dispatch."""

import json
import pytest
from debate_event_store.server import call_tool, store


@pytest.fixture(autouse=True)
async def reset_store():
    """Reset the global store before each test."""
    await store.reset(200)
    yield


@pytest.mark.asyncio
async def test_tool_reset():
    result = await call_tool("debate_reset", {"per_agent_event_limit": 100})
    data = json.loads(result[0].text)
    assert data["success"] is True
    assert data["per_agent_event_limit"] == 100


@pytest.mark.asyncio
async def test_tool_reset_default_limit():
    result = await call_tool("debate_reset", {})
    data = json.loads(result[0].text)
    assert data["success"] is True
    assert data["per_agent_event_limit"] == 200


@pytest.mark.asyncio
async def test_tool_publish_and_catch_up():
    # catch up first
    await call_tool("debate_catch_up", {"agent_id": "frank"})

    result = await call_tool("debate_publish", {
        "agent_id": "frank",
        "text": "POSITION: MIT is best",
    })
    data = json.loads(result[0].text)
    assert data["success"] is True
    assert data["position"] == 1

    # another agent catches up
    result = await call_tool("debate_catch_up", {"agent_id": "alice"})
    data = json.loads(result[0].text)
    assert data["new_event_count"] == 1
    assert "POSITION: MIT is best" in data["events_markdown"]


@pytest.mark.asyncio
async def test_tool_status():
    result = await call_tool("debate_status", {})
    data = json.loads(result[0].text)
    assert data["tip"] == 0
    assert data["event_count"] == 0


@pytest.mark.asyncio
async def test_tool_get_all_events_removed():
    """debate_get_all_events was removed; dispatch should fail."""
    result = await call_tool("debate_get_all_events", {})
    data = json.loads(result[0].text)
    assert "error" in data
    assert "Unknown tool" in data["error"]


@pytest.mark.asyncio
async def test_tool_unknown():
    result = await call_tool("debate_unknown", {})
    data = json.loads(result[0].text)
    assert "error" in data
    assert "Unknown tool" in data["error"]
