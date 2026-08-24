#!/usr/bin/env python3
"""example_harness_integration.py — Example of integrating tools aggregator into a harness.

This example shows how to:
1. Initialize the tools aggregator client
2. Discover available tools
3. Create agent-compatible tool formats
4. Invoke tools from the harness
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional
from nexus.python.tackle.tools_aggregator_client import (
    SyncToolsAggregatorClient,
    ToolsAggregatorClient,
    ToolDefinition,
)

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)


# ── Example 1: Synchronous Integration ──────────────────────────────


class HarnessWithTools:
    """Example harness that uses the tools aggregator."""

    def __init__(self, aggregator_url: str = "http://localhost:3210"):
        """Initialize the harness with tool support."""
        self.tools_client = SyncToolsAggregatorClient(aggregator_url)
        self.tools_by_name: Dict[str, ToolDefinition] = {}

    def initialize(self) -> None:
        """Initialize the harness and discover tools."""
        _log.info("Initializing harness with tools aggregator...")

        try:
            self.tools_client.init()
            self.tools_by_name = {t.name: t for t in self.tools_client.list_tools()}

            # Log tool summary
            tools_by_service = self.tools_client.group_by_service()
            for service, tools in sorted(tools_by_service.items()):
                _log.info(f"  {service}: {len(tools)} tools")

            _log.info(f"Total tools available: {len(self.tools_by_name)}")
        except Exception as e:
            _log.error(f"Failed to initialize tools: {e}")
            raise

    def available_tools(self) -> List[ToolDefinition]:
        """Get all available tools."""
        return list(self.tools_by_name.values())

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """Get a specific tool by name."""
        return self.tools_by_name.get(name)

    def invoke_tool(self, tool_name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """Invoke a tool and return the result."""
        _log.info(f"Invoking tool: {tool_name}")

        try:
            result = self.tools_client.call_tool(tool_name, arguments or {})
            _log.info(f"Tool {tool_name} returned: {type(result).__name__}")
            return result
        except Exception as e:
            _log.error(f"Tool invocation failed: {e}")
            raise

    def as_tool_definitions_for_llm(self) -> List[Dict[str, Any]]:
        """Convert tools to LLM-compatible format (OpenAI Functions)."""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                },
            }
            for tool in self.available_tools()
        ]

    def as_langchain_tools(self) -> List["LangChainTool"]:  # type: ignore
        """Convert tools to LangChain format (requires langchain to be installed)."""
        try:
            from langchain.tools import Tool as LangChainTool

            tools = []
            for tool_def in self.available_tools():
                # Create a closure to capture the tool name
                def make_tool_func(tool_name: str):
                    def tool_func(args_str: str) -> str:
                        import json

                        try:
                            args = json.loads(args_str) if args_str else {}
                        except json.JSONDecodeError:
                            args = {"query": args_str}

                        result = self.invoke_tool(tool_name, args)
                        return str(result)

                    return tool_func

                tools.append(
                    LangChainTool(
                        name=tool_def.name,
                        description=tool_def.description,
                        func=make_tool_func(tool_def.name),
                    )
                )

            return tools
        except ImportError:
            _log.warning("LangChain not installed, cannot convert to LangChain tools")
            return []

    def close(self) -> None:
        """Close the harness and clean up resources."""
        self.tools_client.close()


# ── Example 2: Async Integration ───────────────────────────────────


class AsyncHarnessWithTools:
    """Example async harness that uses the tools aggregator."""

    def __init__(self, aggregator_url: str = "http://localhost:3210"):
        """Initialize the harness."""
        self.aggregator_url = aggregator_url
        self.tools_client: Optional[ToolsAggregatorClient] = None
        self.tools_by_name: Dict[str, ToolDefinition] = {}

    async def initialize(self) -> None:
        """Initialize the harness and discover tools."""
        _log.info("Initializing async harness with tools aggregator...")

        self.tools_client = ToolsAggregatorClient(self.aggregator_url)
        await self.tools_client.init()

        # Build lookup by name
        for tool in self.tools_client.list_tools():
            self.tools_by_name[tool.name] = tool

        tools_by_service = self.tools_client.group_by_service()
        for service, tools in sorted(tools_by_service.items()):
            _log.info(f"  {service}: {len(tools)} tools")

        _log.info(f"Total tools available: {len(self.tools_by_name)}")

    async def invoke_tool(self, tool_name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """Invoke a tool."""
        if not self.tools_client:
            raise RuntimeError("Harness not initialized")

        _log.info(f"Invoking tool: {tool_name}")

        try:
            result = await self.tools_client.call_tool(tool_name, arguments or {})
            return result
        except Exception as e:
            _log.error(f"Tool invocation failed: {e}")
            raise

    async def close(self) -> None:
        """Close the harness."""
        if self.tools_client:
            await self.tools_client.close()


# ── Example Usage ───────────────────────────────────────────────────


async def example_async():
    """Example: Use harness with async tools."""
    _log.info("=== Async Example ===")

    harness = AsyncHarnessWithTools()
    await harness.initialize()

    try:
        # Query conduit state
        result = await harness.invoke_tool("query_conduit_state", {})
        _log.info(f"Conduit state: {result}")

        # List available tools
        tools = harness.tools_client.list_tools()
        _log.info(f"Available tools: {[t.name for t in tools[:5]]}... ({len(tools)} total)")

    finally:
        await harness.close()


def example_sync():
    """Example: Use harness with sync tools."""
    _log.info("=== Sync Example ===")

    harness = HarnessWithTools()
    harness.initialize()

    try:
        # Query conduit state
        result = harness.invoke_tool("query_conduit_state", {})
        _log.info(f"Conduit state: {result}")

        # List available tools
        tools = harness.available_tools()
        _log.info(f"Available tools: {[t.name for t in tools[:5]]}... ({len(tools)} total)")

        # Get LLM-compatible tool definitions
        llm_tools = harness.as_tool_definitions_for_llm()
        _log.info(f"LLM-compatible tools: {len(llm_tools)} definitions")

    finally:
        harness.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "async":
        asyncio.run(example_async())
    else:
        example_sync()
