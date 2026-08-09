"""nebula-mcp-client — canonical MCP streamable-HTTP client (see README.md)."""

from .nebula_mcp_client import McpClient, McpError, PROTOCOL_VERSION

__all__ = ["McpClient", "McpError", "PROTOCOL_VERSION"]
__version__ = "1.0.0"
