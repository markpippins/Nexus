import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VisionClient } from "../api/visionClient.js";

/**
 * Registers all Vision LOSM MCP Tools.
 */
export function registerTools(server: McpServer) {

  // ════════════════════════════════════════════════════════════════
  //  WORK REQUESTS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "vision_list_work_requests",
    "List all active work requests.",
    {},
    async () => {
      const result = await VisionClient.listWorkRequests();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ workRequests: result, count: Array.isArray(result) ? result.length : 0 }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "vision_create_work_request",
    "Create a new work request.",
    {
      wrId: z.string().optional().describe("Unique work request ID (auto-generated if omitted)"),
      intent: z.string().describe("What the work request should accomplish"),
      constraints: z.any().optional().describe("Optional constraints JSON"),
      priority: z.number().optional().describe("Priority level (default 5)"),
      context: z.any().optional().describe("Contextual data JSON"),
      status: z.string().optional().describe("Status (default 'NEW')"),
    },
    async (args) => {
      const result = await VisionClient.createWorkRequest(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "vision_get_work_request",
    "Get a single work request by ID.",
    {
      id: z.string().describe("Work request ID (numeric)"),
    },
    async (args) => {
      const result = await VisionClient.getWorkRequest(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "vision_update_work_request",
    "Update a work request's fields.",
    {
      id: z.string().describe("Work request ID"),
      intent: z.string().optional().describe("New intent"),
      constraints: z.any().optional().describe("New constraints"),
      priority: z.number().optional().describe("New priority"),
      context: z.any().optional().describe("New context"),
      status: z.string().optional().describe("New status"),
    },
    async (args) => {
      const { id, ...body } = args;
      const result = await VisionClient.updateWorkRequest(id, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "vision_delete_work_request",
    "Delete a work request (soft-delete via trigger).",
    {
      id: z.string().describe("Work request ID"),
    },
    async (args) => {
      const result = await VisionClient.deleteWorkRequest(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  BRANCHES
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "vision_list_branches",
    "List all branches.",
    {},
    async () => {
      const result = await VisionClient.listBranches();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ branches: result, count: Array.isArray(result) ? result.length : 0 }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "vision_create_branch",
    "Create a new branch off a work request.",
    {
      branchId: z.string().describe("Unique branch ID"),
      wrId: z.string().describe("Parent work request ID"),
      parentBranchId: z.string().optional().describe("Parent branch for forking"),
      forkPoint: z.string().optional().describe("Artifact ID where branch diverged"),
      label: z.string().optional().describe("Human-readable branch label"),
      status: z.string().optional().describe("Branch status (default 'active')"),
    },
    async (args) => {
      const result = await VisionClient.createBranch(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  ARTIFACTS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "vision_list_artifacts",
    "List all artifacts.",
    {},
    async () => {
      const result = await VisionClient.listArtifacts();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ artifacts: result, count: Array.isArray(result) ? result.length : 0 }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "vision_create_artifact",
    "Create a new artifact (plan, patch, spec, etc.).",
    {
      artifactId: z.string().optional().describe("Unique artifact ID"),
      type: z.string().describe("Artifact type: PLAN, CRITIQUE, SPEC, EXECUTION, PATCH, SUMMARY"),
      content: z.any().describe("Artifact content (JSON)"),
      confidence: z.number().optional().describe("Confidence score"),
      provenance: z.any().optional().describe("Source tracking info"),
      wrId: z.string().optional().describe("Associated work request ID"),
      parentArtifactId: z.string().optional().describe("Parent artifact for lineage"),
      templateMetadata: z.any().optional().describe("Templating metadata"),
    },
    async (args) => {
      const result = await VisionClient.createArtifact(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  HEALTH
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "vision_health",
    "Check vision-srv health and database connectivity.",
    {},
    async () => {
      const result = await VisionClient.health();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
