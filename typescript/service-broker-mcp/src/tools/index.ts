import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  login,
  isLoggedIn,
  logout,
  type LoginResult,
  type TokenCheckResult,
  type LogoutResult,
} from "../api/brokerClient.js";

/**
 * Registers all service-broker MCP Tools.
 */
export function registerTools(server: McpServer) {
  // ════════════════════════════════════════════════════════════════
  //  LOGIN
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "service_broker_login",
    "Login via the service-broker. Returns a token, userId, and admin status. The token is valid for 24 hours.",
    {
      email: z.string().describe("User email (matches assembly.users.email)"),
      password: z.string().describe("User password"),
    },
    async (args): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      const result: LoginResult = await login(args.email, args.password);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  CHECK TOKEN
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "service_broker_is_logged_in",
    "Check if a token is still valid (user is logged in).",
    {
      token: z.string().describe("The auth token from a previous login"),
    },
    async (args): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      const result: TokenCheckResult = await isLoggedIn(args.token);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  LOGOUT
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "service_broker_logout",
    "Logout (invalidate token).",
    {
      token: z.string().describe("The auth token to invalidate"),
    },
    async (args): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      const result: LogoutResult = await logout(args.token);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );
}
