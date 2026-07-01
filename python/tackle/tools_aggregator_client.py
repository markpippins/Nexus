"""tools_aggregator_client.py — Python client for the tools aggregator service.

This module provides a high-level Python API for discovering and calling
tools from all MCP services through the centralized tools aggregator.

Usage:
    from nexus.python.tackle.tools_aggregator_client import ToolsAggregatorClient

    client = ToolsAggregatorClient("http://localhost:3200")
    
    # Initialize and discover tools
    await client.init()
    
    # List all tools
    tools = client.list_tools()
    
    # Get a specific tool
    tool = client.get_tool("query_conduit_state")
    
    # Call a tool
    result = await client.call_tool("query_conduit_state", {})
    
    # Get tools by service
    tools_by_service = client.group_by_service()
"""

import logging
from typing import Any, Dict, List, Optional
import httpx

_log = logging.getLogger(__name__)


class ToolDefinition:
    """A single tool definition with metadata."""

    def __init__(
        self,
        name: str,
        description: str,
        input_schema: Dict[str, Any],
        service: str,
        service_url: str,
    ):
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.service = service
        self.service_url = service_url

    def __repr__(self) -> str:
        return f"<Tool {self.name} (from {self.service})>"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "service": self.service,
            "serviceUrl": self.service_url,
            "inputSchema": self.input_schema,
        }


class ToolsAggregatorClient:
    """Client for the tools aggregator service."""

    def __init__(self, base_url: str = "http://localhost:3200"):
        """Initialize the client.

        Args:
            base_url: Base URL of the tools aggregator service
        """
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        self._tools: Dict[str, ToolDefinition] = {}
        self._initialized = False

    async def init(self) -> None:
        """Initialize the client by discovering all tools."""
        _log.info(f"Initializing tools aggregator client from {self.base_url}")

        try:
            response = await self.client.post("/init")
            response.raise_for_status()
            total = response.json()['registry']['totalTools']
            # Populate the local tool cache (must succeed before marking initialized)
            await self._refresh_tools()
            self._initialized = True
            _log.info(f"Tools aggregator initialized: {total} tools")
        except httpx.HTTPError as e:
            _log.error(f"Failed to initialize tools aggregator: {e}")
            raise

    async def health(self) -> Dict[str, Any]:
        """Check the health of the tools aggregator service."""
        try:
            response = await self.client.get("/health")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            _log.error(f"Health check failed: {e}")
            raise

    def list_tools(self) -> List[ToolDefinition]:
        """Get all available tools (from cached discovery).

        Note: Call init() first to populate the cache.
        """
        return list(self._tools.values())

    async def _refresh_tools(self) -> None:
        """Refresh the tool cache from the server."""
        try:
            response = await self.client.get("/tools")
            response.raise_for_status()
            data = response.json()

            self._tools.clear()
            for tool_data in data.get("tools", []):
                tool = ToolDefinition(
                    name=tool_data["name"],
                    description=tool_data["description"],
                    input_schema=tool_data["inputSchema"],
                    service=tool_data["service"],
                    service_url=tool_data.get("serviceUrl", ""),
                )
                self._tools[tool.name] = tool

            _log.debug(f"Refreshed tool cache: {len(self._tools)} tools")
        except httpx.HTTPError as e:
            _log.error(f"Failed to refresh tools: {e}")
            raise

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """Get a specific tool by name.

        Args:
            name: The tool name

        Returns:
            The tool definition, or None if not found
        """
        return self._tools.get(name)

    def group_by_service(self) -> Dict[str, List[ToolDefinition]]:
        """Group tools by their service.

        Returns:
            Dict mapping service names to lists of tools
        """
        grouped: Dict[str, List[ToolDefinition]] = {}

        for tool in self._tools.values():
            if tool.service not in grouped:
                grouped[tool.service] = []
            grouped[tool.service].append(tool)

        return grouped

    async def get_registry(self) -> Dict[str, Any]:
        """Get the full tool registry.

        Returns:
            The registry JSON from the server
        """
        try:
            response = await self.client.get("/registry")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            _log.error(f"Failed to get registry: {e}")
            raise

    async def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """Call a tool through the aggregator.

        Args:
            name: The tool name
            arguments: Tool arguments (optional)

        Returns:
            The tool result

        Raises:
            httpx.HTTPError: If the call fails
            ValueError: If the tool is not found
        """
        if not self._tools:
            await self._refresh_tools()

        tool = self.get_tool(name)
        if not tool:
            raise ValueError(f"Tool not found: {name}")

        _log.debug(f"Calling tool {name} with arguments {arguments}")

        try:
            response = await self.client.post(
                "/tools/call",
                json={
                    "name": name,
                    "arguments": arguments or {},
                },
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                raise RuntimeError(f"Tool failed: {data.get('error', 'Unknown error')}")

            return data.get("result")
        except httpx.HTTPError as e:
            _log.error(f"Tool call failed: {e}")
            raise

    async def close(self) -> None:
        """Close the client connection."""
        await self.client.aclose()

    async def __aenter__(self):
        """Context manager entry."""
        await self.init()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        await self.close()


# Synchronous wrapper for blocking code

class SyncToolsAggregatorClient:
    """Synchronous wrapper for the tools aggregator client.

    Usage:
        client = SyncToolsAggregatorClient("http://localhost:3200")
        client.init()
        
        tools = client.list_tools()
        result = client.call_tool("query_conduit_state", {})
    """

    def __init__(self, base_url: str = "http://localhost:3200"):
        """Initialize the synchronous client."""
        import asyncio

        self._base_url = base_url
        self._client: Optional[ToolsAggregatorClient] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def _get_loop(self) -> Any:
        """Get or create the event loop."""
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        return loop

    def _ensure_loop(self):
        """Return the stored event loop, creating one if needed."""
        import asyncio
        if self._loop is None or self._loop.is_closed():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
        return self._loop

    def _run_async(self, coro):
        """Run an async coroutine on the stored event loop."""
        loop = self._ensure_loop()
        return loop.run_until_complete(coro)

    def init(self) -> None:
        """Initialize the client."""
        async def _init():
            self._client = ToolsAggregatorClient(self._base_url)
            await self._client.init()
        self._run_async(_init())

    def health(self) -> Dict[str, Any]:
        """Check health of the aggregator service."""
        if not self._client:
            raise RuntimeError("Client not initialized. Call init() first.")
        return self._run_async(self._client.health())

    def list_tools(self) -> List[ToolDefinition]:
        """Get all available tools."""
        if not self._client:
            raise RuntimeError("Client not initialized. Call init() first.")
        return self._client.list_tools()

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """Get a specific tool by name."""
        if not self._client:
            raise RuntimeError("Client not initialized. Call init() first.")
        return self._client.get_tool(name)

    def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """Call a tool."""
        if not self._client:
            raise RuntimeError("Client not initialized. Call init() first.")
        return self._run_async(self._client.call_tool(name, arguments))

    def group_by_service(self) -> Dict[str, List[ToolDefinition]]:
        """Group tools by service."""
        if not self._client:
            raise RuntimeError("Client not initialized. Call init() first.")
        return self._client.group_by_service()

    def close(self) -> None:
        """Close the client."""
        if self._client:
            self._run_async(self._client.close())
            self._client = None
            if self._loop and not self._loop.is_closed():
                self._loop.close()
