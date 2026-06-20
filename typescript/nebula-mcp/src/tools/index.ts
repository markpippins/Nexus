import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NebulaClient } from "../api/nebulaClient.js";

/**
 * Registers all Nebula RMS MCP Tools.
 */
export function registerTools(server: McpServer) {

  // ════════════════════════════════════════════════════════════════
  //  SYSTEMS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_list_systems",
    "List all systems with their full nested hierarchy (subsystems, features, folders).",
    {},
    async () => {
      const result = await NebulaClient.listSystems();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ systems: result, count: Array.isArray(result) ? result.length : 0 }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "nebula_create_system",
    "Create a new system in Nebula RMS.",
    {
      name: z.string().describe("System name (required)"),
      description: z.string().optional().describe("System description"),
      readme: z.string().nullable().optional().describe("Markdown readme content"),
      architecture: z.string().nullable().optional().describe("Architecture notes"),
    },
    async (args) => {
      const result = await NebulaClient.createSystem({
        name: args.name,
        description: args.description,
        readme: args.readme,
        architecture: args.architecture,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_update_system",
    "Update an existing system's metadata.",
    {
      id: z.string().describe("System UUID"),
      name: z.string().optional().describe("New system name"),
      description: z.string().optional().describe("New description"),
      readme: z.string().nullable().optional().describe("New readme content"),
      architecture: z.string().nullable().optional().describe("New architecture notes"),
    },
    async (args) => {
      const { id, name, description, readme, architecture } = args;
      const result = await NebulaClient.updateSystem(id, { name, description, readme, architecture });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_delete_system",
    "Delete a system and all its subsystems, features, folders, and requirements (cascade).",
    {
      id: z.string().describe("System UUID to delete"),
    },
    async (args) => {
      const result = await NebulaClient.deleteSystem(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  SUBSYSTEMS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_create_subsystem",
    "Create a new subsystem under a system.",
    {
      systemId: z.string().describe("Parent system UUID"),
      name: z.string().describe("Subsystem name"),
      description: z.string().optional().describe("Subsystem description"),
      readme: z.string().nullable().optional().describe("Markdown readme for this subsystem"),
    },
    async (args) => {
      const result = await NebulaClient.createSubsystem({
        systemId: args.systemId,
        name: args.name,
        description: args.description,
        readme: args.readme,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_update_subsystem",
    "Update a subsystem's metadata.",
    {
      id: z.string().describe("Subsystem UUID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      readme: z.string().nullable().optional().describe("New readme content"),
      color: z.string().optional().describe("Hex color string (e.g. '#3B82F6')"),
    },
    async (args) => {
      const { id, name, description, readme, color } = args;
      const result = await NebulaClient.updateSubsystem(id, { name, description, readme, color });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_delete_subsystem",
    "Delete a subsystem and its features and requirements (cascade).",
    {
      id: z.string().describe("Subsystem UUID"),
    },
    async (args) => {
      const result = await NebulaClient.deleteSubsystem(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_move_subsystem",
    "Move a subsystem to a different parent system (transactional).",
    {
      subsystemId: z.string().describe("Subsystem UUID to move"),
      targetSystemId: z.string().describe("Target parent system UUID"),
    },
    async (args) => {
      const result = await NebulaClient.moveSubsystem({
        subsystemId: args.subsystemId,
        targetSystemId: args.targetSystemId,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  FEATURES
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_create_feature",
    "Create a new feature under a subsystem.",
    {
      subsystemId: z.string().describe("Parent subsystem UUID"),
      name: z.string().describe("Feature name"),
      description: z.string().optional().describe("Feature description"),
      readme: z.string().nullable().optional().describe("Markdown readme for this feature"),
    },
    async (args) => {
      const result = await NebulaClient.createFeature({
        subsystemId: args.subsystemId,
        name: args.name,
        description: args.description,
        readme: args.readme,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_update_feature",
    "Update a feature's metadata.",
    {
      id: z.string().describe("Feature UUID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      readme: z.string().nullable().optional().describe("New readme content"),
    },
    async (args) => {
      const { id, name, description, readme } = args;
      const result = await NebulaClient.updateFeature(id, { name, description, readme });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_delete_feature",
    "Delete a feature and its requirements (cascade).",
    {
      id: z.string().describe("Feature UUID"),
    },
    async (args) => {
      const result = await NebulaClient.deleteFeature(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_move_feature",
    "Move a feature to a different subsystem (transactional, re-parents requirements).",
    {
      featureId: z.string().describe("Feature UUID to move"),
      targetSystemId: z.string().describe("Target system UUID"),
      targetSubsystemId: z.string().describe("Target subsystem UUID"),
    },
    async (args) => {
      const result = await NebulaClient.moveFeature({
        featureId: args.featureId,
        targetSystemId: args.targetSystemId,
        targetSubsystemId: args.targetSubsystemId,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  REQUIREMENTS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_list_requirements",
    "List requirements, optionally filtered by system, subsystem, or feature.",
    {
      systemId: z.string().optional().describe("Filter by system UUID"),
      subsystemId: z.string().optional().describe("Filter by subsystem UUID"),
      featureId: z.string().optional().describe("Filter by feature UUID"),
    },
    async (args) => {
      const result = await NebulaClient.listRequirements({
        systemId: args.systemId,
        subsystemId: args.subsystemId,
        featureId: args.featureId,
      });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ requirements: result, count: Array.isArray(result) ? result.length : 0 }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "nebula_create_requirement",
    "Create a new requirement in the backlog.",
    {
      systemId: z.string().describe("System UUID"),
      subsystemId: z.string().describe("Subsystem UUID"),
      featureId: z.string().nullable().optional().describe("Optional feature UUID"),
      title: z.string().describe("Requirement title"),
      description: z.string().optional().describe("Requirement description"),
      status: z.string().optional().describe("Status: Backlog, ToDo, InProgress, Active, Blocked, Done, Cancelled, Accepted"),
      priority: z.string().optional().describe("Priority: Low, Medium, High"),
      startDate: z.string().nullable().optional().describe("Start date string"),
      completionDate: z.string().nullable().optional().describe("Completion date string"),
    },
    async (args) => {
      const result = await NebulaClient.createRequirement({
        systemId: args.systemId,
        subsystemId: args.subsystemId,
        featureId: args.featureId,
        title: args.title,
        description: args.description,
        status: args.status,
        priority: args.priority,
        startDate: args.startDate,
        completionDate: args.completionDate,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_update_requirement",
    "Update a requirement's fields.",
    {
      id: z.string().describe("Requirement UUID"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      status: z.string().optional().describe("New status"),
      priority: z.string().optional().describe("New priority"),
      startDate: z.string().nullable().optional().describe("Start date"),
      completionDate: z.string().nullable().optional().describe("Completion date"),
      systemId: z.string().optional().describe("Reassign to system"),
      subsystemId: z.string().optional().describe("Reassign to subsystem"),
      featureId: z.string().nullable().optional().describe("Reassign to feature"),
    },
    async (args) => {
      const { id, title, description, status, priority, startDate, completionDate, systemId, subsystemId, featureId } = args;
      const result = await NebulaClient.updateRequirement(id, {
        title, description, status, priority, startDate, completionDate, systemId, subsystemId, featureId,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_move_requirement",
    "Move a requirement to a new status (kanban-friendly). Optionally pass expectedCurrentStatus to assert the current value; the call returns 409 on mismatch.",
    {
      id: z.string().describe("Requirement UUID"),
      targetStatus: z.enum([
        "Backlog", "ToDo", "InProgress", "Active", "Blocked", "Done", "Cancelled", "Accepted",
      ]).describe("Status to move the requirement into"),
      expectedCurrentStatus: z.enum([
        "Backlog", "ToDo", "InProgress", "Active", "Blocked", "Done", "Cancelled", "Accepted",
      ]).optional().describe("Optional optimistic-concurrency check. If supplied and the current status differs, the call fails with 409."),
    },
    async (args) => {
      const result = await NebulaClient.moveRequirement(args.id, {
        targetStatus: args.targetStatus,
        expectedCurrentStatus: args.expectedCurrentStatus,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_delete_requirement",
    "Delete a requirement.",
    {
      id: z.string().describe("Requirement UUID"),
    },
    async (args) => {
      const result = await NebulaClient.deleteRequirement(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_batch_update_requirements",
    "Batch update the status of multiple requirements at once.",
    {
      ids: z.array(z.string()).describe("Array of requirement UUIDs"),
      status: z.string().describe("New status to apply to all (e.g. 'Done', 'InProgress')"),
    },
    async (args) => {
      const result = await NebulaClient.batchUpdateRequirements({ ids: args.ids, status: args.status });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  SYSTEM FOLDERS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_create_folder",
    "Create a folder under a system (for organizing workspaces by category).",
    {
      systemId: z.string().describe("Parent system UUID"),
      name: z.string().describe("Folder name"),
      category: z.enum(["UI", "Service", "Library", "Documentation", "Config", "data", "api"]).describe("Folder category"),
      note: z.string().optional().describe("Optional note about this folder"),
    },
    async (args) => {
      const result = await NebulaClient.createFolder(args.systemId, {
        name: args.name,
        category: args.category,
        note: args.note,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_delete_folder",
    "Delete a folder from a system.",
    {
      systemId: z.string().describe("Parent system UUID"),
      folderId: z.string().describe("Folder UUID to delete"),
    },
    async (args) => {
      const result = await NebulaClient.deleteFolder(args.systemId, args.folderId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  WORK SESSIONS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_list_sessions",
    "List recent work sessions across all entities.",
    {},
    async () => {
      const result = await NebulaClient.listSessions();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ sessions: result, count: Array.isArray(result) ? result.length : 0 }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "nebula_create_session",
    "Record a new work session against a system, subsystem, feature, or requirement.",
    {
      parentId: z.string().describe("Parent entity UUID"),
      parentType: z.enum(["system", "subsystem", "feature", "requirement"]).describe("Type of parent entity"),
      parentName: z.string().optional().describe("Name of parent entity"),
      context: z.string().optional().describe("Work context description"),
      platform: z.string().optional().describe("Platform used (e.g. 'codebuff', 'claude')"),
      model: z.string().optional().describe("AI model used"),
      outcome: z.string().nullable().optional().describe("Session outcome notes"),
      status: z.string().optional().describe("Session status: Pending, Completed"),
    },
    async (args) => {
      const result = await NebulaClient.createSession({
        parentId: args.parentId,
        parentType: args.parentType,
        parentName: args.parentName,
        context: args.context,
        platform: args.platform,
        model: args.model,
        outcome: args.outcome,
        status: args.status,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_update_session",
    "Update a work session's outcome or status.",
    {
      id: z.string().describe("Session UUID"),
      outcome: z.string().nullable().optional().describe("Outcome notes"),
      status: z.string().optional().describe("New status: Pending, Completed"),
    },
    async (args) => {
      const { id, outcome, status } = args;
      const result = await NebulaClient.updateSession(id, { outcome, status });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_delete_session",
    "Delete a work session.",
    {
      id: z.string().describe("Session UUID"),
    },
    async (args) => {
      const result = await NebulaClient.deleteSession(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  WORKSPACES
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_list_workspaces",
    "List all workspace path mappings (system/subsystem → filesystem path).",
    {},
    async () => {
      const result = await NebulaClient.listWorkspaces();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ workspaces: result, count: Array.isArray(result) ? result.length : 0 }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "nebula_create_workspace",
    "Map a system or subsystem to a filesystem workspace path.",
    {
      systemId: z.string().describe("System UUID"),
      subsystemId: z.string().nullable().optional().describe("Optional subsystem UUID"),
      workspacePath: z.string().describe("Relative path from nexus root (e.g. 'typescript/conduit-mcp')"),
    },
    async (args) => {
      const result = await NebulaClient.createWorkspace({
        systemId: args.systemId,
        subsystemId: args.subsystemId,
        workspacePath: args.workspacePath,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_delete_workspace",
    "Remove a workspace path mapping.",
    {
      id: z.string().describe("Workspace UUID"),
    },
    async (args) => {
      const result = await NebulaClient.deleteWorkspace(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  DOCS (reads README.md / ARCHITECTURE.md from disk)
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_read_docs",
    "Read README.md and ARCHITECTURE.md from a workspace directory on disk.",
    {
      workspacePath: z.string().describe("Relative path from nexus root (e.g. 'typescript/nebula-mcp')"),
    },
    async (args) => {
      const result = await NebulaClient.readDocs(args.workspacePath);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_read_system_docs",
    "Read docs from all workspace directories linked to a system.",
    {
      systemId: z.string().describe("System UUID"),
    },
    async (args) => {
      const result = await NebulaClient.readSystemDocs(args.systemId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_read_subsystem_docs",
    "Read docs from all workspace directories linked to a subsystem.",
    {
      subsystemId: z.string().describe("Subsystem UUID"),
    },
    async (args) => {
      const result = await NebulaClient.readSubsystemDocs(args.subsystemId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  PLANS DISPLAY (Plan 0134)
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_list_plans",
    "List implementation plans from nexus/graph/IMPLEMENTATION_PLANS/{pending,planning,proposed,completed}/. Returns metadata only — for full markdown body use nebula_get_plan.",
    {
      status: z.enum(["pending", "planning", "proposed", "completed", "all"]).optional()
        .describe("Filter by status directory. Defaults to 'all' (all four directories)."),
    },
    async (args) => {
      const result = await NebulaClient.listPlans({ status: args.status });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_get_plan",
    "Fetch one implementation plan by id (filename basename without .md). Collisions across status dirs resolve to the first match in order: pending → planning → proposed → completed.",
    {
      id: z.string().describe("Plan id (without .md extension), e.g. 'add-plans-display-endpoint-v0134'"),
    },
    async (args) => {
      const result = await NebulaClient.getPlan(args.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  USER PREFERENCES
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_get_preferences",
    "Get all user preferences (dark mode, UI state, etc.).",
    {},
    async () => {
      const result = await NebulaClient.getPreferences();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_set_preference",
    "Set a user preference value.",
    {
      key: z.string().describe("Preference key (e.g. 'theme', 'sidebarCollapsed')"),
      value: z.any().describe("Value to store (any JSON-serializable value)"),
    },
    async (args) => {
      const result = await NebulaClient.setPreference(args.key, args.value);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_delete_preference",
    "Delete a user preference (reset to default).",
    {
      key: z.string().describe("Preference key to delete"),
    },
    async (args) => {
      const result = await NebulaClient.deletePreference(args.key);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  SYSTEM INFO TABS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_get_system_info",
    "Get all info tab content for a system.",
    {
      systemId: z.string().describe("System UUID"),
    },
    async (args) => {
      const result = await NebulaClient.getSystemInfo(args.systemId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_set_system_info",
    "Save content to a system info tab.",
    {
      systemId: z.string().describe("System UUID"),
      tabId: z.string().describe("Tab identifier (e.g. 'overview', 'dependencies')"),
      content: z.string().describe("Tab content (Markdown or text)"),
    },
    async (args) => {
      const result = await NebulaClient.setSystemInfo(args.systemId, args.tabId, args.content);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  COMPLEX OPERATIONS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_demote_system",
    "Demote a system into a subsystem of another system (merges hierarchy).",
    {
      sourceSystemId: z.string().describe("System UUID to demote"),
      targetSystemId: z.string().describe("Target system UUID that will become the parent"),
    },
    async (args) => {
      const result = await NebulaClient.demoteSystem(args.sourceSystemId, args.targetSystemId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  IMPORT / SEED
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_import",
    "Bulk import systems, requirements, sessions, preferences, and info tabs from a migration payload.",
    {
      systems: z.array(z.any()).optional().describe("Array of system objects to import"),
      requirements: z.array(z.any()).optional().describe("Array of requirement objects to import"),
      workSessions: z.array(z.any()).optional().describe("Array of work session objects to import"),
      preferences: z.record(z.string(), z.any()).optional().describe("Preferences key/value map"),
      infoTabs: z.record(z.string(), z.record(z.string(), z.string())).optional().describe("Info tabs map: systemId -> { tabId -> content }"),
    },
    async (args) => {
      const result = await NebulaClient.importData({
        systems: args.systems,
        requirements: args.requirements,
        workSessions: args.workSessions,
        preferences: args.preferences,
        infoTabs: args.infoTabs,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nebula_seed",
    "Seed the database with example data (idempotent — safe to call repeatedly).",
    {},
    async () => {
      const result = await NebulaClient.seedData();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  HEALTH
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "nebula_health",
    "Check nebula-srv health and database connectivity.",
    {},
    async () => {
      const result = await NebulaClient.health();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
