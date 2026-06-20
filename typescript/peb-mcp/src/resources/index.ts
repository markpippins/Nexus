import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PebApiClient } from "../api/apiClient.js";

/**
 * Registers all read-only PEB resources with the MCP Server.
 */
export function registerResources(server: McpServer) {
  
  const resources = [
    { uri: "peb://state/invariants", name: "PEB Invariants", mimeType: "application/json" },
    { uri: "peb://state/architecture", name: "PEB Architecture Facts", mimeType: "application/json" },
    { uri: "peb://state/trajectory", name: "PEB Trajectory", mimeType: "application/json" },
    { uri: "peb://state/intent", name: "PEB Intent Facts", mimeType: "application/json" },
    { uri: "peb://state/hash", name: "PEB State Hash Root", mimeType: "application/json" },
    { uri: "peb://state/mode", name: "PEB Cognitive Mode", mimeType: "text/plain" },
    { uri: "peb://state/decisions", name: "PEB Recent Decisions", mimeType: "application/json" }
  ];

  for (const res of resources) {
    server.resource(
      res.name,
      res.uri,
      async (uri) => {
        const path = new URL(uri.href).pathname.replace(/^\/+/, ''); // extract e.g. "invariants"
        const state = await PebApiClient.getResource(path);
        
        return {
          contents: [{
            uri: uri.href,
            mimeType: res.mimeType,
            text: typeof state === 'string' ? state : JSON.stringify(state, null, 2)
          }]
        };
      }
    );
  }
}
