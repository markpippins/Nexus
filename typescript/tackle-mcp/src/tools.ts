import { createError } from "./errors";
import {
  getAIConfigSnapshot,
  getAIProviders,
  getAIProvider,
  upsertAIProvider,
  deleteAIProvider,
  getAIHarnesses,
  getAIHarness,
  upsertAIHarness,
  deleteAIHarness,
  getAIModels,
  getAIModel,
  upsertAIModel,
  deleteAIModel,
  getAIRoleConfigs,
  getAIRoleConfig,
  upsertAIRoleConfig,
  upsertConfigBundles,
  upsertConfigBundle,
  getConfigBundles,
  getConfigBundle,
  deleteConfigBundle,
  validateAIConfig,
  seedDefaultAIConfig,
  importAIConfig,
} from "./db";

// ── Tool Definitions ────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export const toolDefinitions: MCPToolDefinition[] = [
  {
    name: "get_ai_config",
    description: "Get the full AI configuration snapshot including all providers, harnesses, models, role configs, and role model priorities.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "validate_ai_config",
    description: "Validate the AI configuration — checks for missing references, broken harness binaries, and missing fallback models.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "seed_default_ai_config",
    description: "Seed the AI config tables with default providers, harnesses, and models if they are empty. Set force=true to overwrite existing data.",
    inputSchema: {
      type: "object",
      properties: {
        force: { type: "boolean", description: "Overwrite existing data if true" },
      },
    },
  },
  {
    name: "import_ai_config",
    description: "Replace the entire AI configuration with a full snapshot. Clears all existing data and bulk-inserts the provided providers, harnesses, models, roles, and config bundles.",
    inputSchema: {
      type: "object",
      properties: {
        providers: { type: "array", description: "Array of provider objects" },
        harnesses: { type: "array", description: "Array of harness objects" },
        models: { type: "array", description: "Array of model objects" },
        roles: { type: "array", description: "Array of role_config objects" },
        bundles: { type: "array", description: "Array of config_bundle objects" },
      },
    },
  },
  {
    name: "list_ai_providers",
    description: "List all AI providers configured in the tackle registry.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_ai_provider",
    description: "Get a single AI provider by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Provider ID (e.g. 'prov-openai')" },
      },
      required: ["id"],
    },
  },
  {
    name: "upsert_ai_provider",
    description: "Create or update an AI provider.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Provider ID (e.g. 'prov-openai')" },
        name: { type: "string", description: "Display name" },
        type: { type: "string", description: "Provider type: openai, anthropic, google, ollama, opencode, codex, spring_ai, lm_server, custom" },
        endpoint_url: { type: "string", description: "API endpoint URL" },
        api_key: { type: "string", description: "API key (stored encrypted at rest)" },
        config_json: { type: "string", description: "Optional JSON config string" },
      },
      required: ["id", "name", "type"],
    },
  },
  {
    name: "delete_ai_provider",
    description: "Delete an AI provider by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Provider ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_ai_harnesses",
    description: "List all AI harnesses configured in the tackle registry.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_ai_harness",
    description: "Get a single AI harness by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Harness ID (e.g. 'harn-opencode')" },
      },
      required: ["id"],
    },
  },
  {
    name: "upsert_ai_harness",
    description: "Create or update an AI harness.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Harness ID (e.g. 'harn-opencode')" },
        name: { type: "string", description: "Display name" },
        invocation_semantics: { type: "string", description: "JSON string describing binary, capabilities, semantics, and execution mode" },
      },
      required: ["id", "name"],
    },
  },
  {
    name: "delete_ai_harness",
    description: "Delete an AI harness by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Harness ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_ai_models",
    description: "List all AI models in the tackle registry.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_ai_model",
    description: "Get a single AI model by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Model ID (e.g. 'mod-gpt4o')" },
      },
      required: ["id"],
    },
  },
  {
    name: "upsert_ai_model",
    description: "Create or update an AI model.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Model ID (e.g. 'mod-gpt4o')" },
        name: { type: "string", description: "Display name" },
        harness_id: { type: "string", description: "Harness ID this model uses" },
        provider_id: { type: "string", description: "Optional provider ID for API routing" },
        model_identifier: { type: "string", description: "The model identifier string (e.g. 'gpt-4o')" },
      },
      required: ["id", "name", "harness_id", "model_identifier"],
    },
  },
  {
    name: "delete_ai_model",
    description: "Delete an AI model by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Model ID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_ai_role_configs",
    description: "List all AI role configurations.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_ai_role_config",
    description: "Get a single AI role configuration by role name.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Role name: planner, builder, reviewer, critic, analyst, architect, inspector, engineer, rover" },
      },
      required: ["role"],
    },
  },
  {
    name: "upsert_ai_role_config",
    description: "Create or update an AI role configuration with optional fallback model priorities.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Role config ID (e.g. 'rc-builder')" },
        role: { type: "string", description: "Role name: planner, builder, reviewer, critic, analyst, architect, inspector, engineer, rover" },
        provider_id: { type: "string", description: "Provider ID for the primary model" },
        harness_id: { type: "string", description: "Harness ID for the primary model" },
        model_id: { type: "string", description: "Primary model ID" },
        extra_params: { type: "string", description: "Optional JSON extra parameters" },
        model_priorities: {
          type: "array",
          description: "Optional fallback model priority list",
          items: {
            type: "object",
            properties: {
              model_id: { type: "string" },
              priority: { type: "number" },
              provider_id: { type: "string" },
              harness_id: { type: "string" },
            },
          },
        },
      },
      required: ["id", "role", "provider_id", "harness_id", "model_id"],
    },
  },
  {
    name: "list_config_bundles",
    description: "List config bundles for a role. Bundles are the atomic unit of model+provider+harness+invocation config.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Role name" },
      },
      required: ["role"],
    },
  },
  {
    name: "upsert_config_bundle",
    description: "Create or update a config bundle — the atomic unit of model+provider+harness+invocation config.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bundle ID (e.g. 'cb-builder-mod-gpt4o')" },
        name: { type: "string", description: "Human-readable name" },
        role: { type: "string", description: "Role this bundle belongs to" },
        model_id: { type: "string", description: "Model ID" },
        provider_id: { type: "string", description: "Optional provider ID override" },
        harness_id: { type: "string", description: "Optional harness ID override" },
        priority: { type: "number", description: "Priority (0 = primary)" },
        invocation_mode: { type: "string", description: "CLI | HTTP | SDK | MCP", enum: ["CLI", "HTTP", "SDK", "MCP"] },
        command: { type: "string", description: "CLI command override" },
        endpoint_url: { type: "string", description: "HTTP endpoint override" },
        timeout_ms: { type: "number", description: "Timeout in milliseconds" },
      },
      required: ["id", "name", "role", "model_id"],
    },
  },
  {
    name: "delete_config_bundle",
    description: "Delete a config bundle by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bundle ID to delete" },
      },
      required: ["id"],
    },
  },
];

// ── Tool Handler Registration ───────────────────────────────────────

export function registerToolHandlers(): Record<string, Function> {
  return {
    get_ai_config: async (_args: any) => {
      return await getAIConfigSnapshot();
    },

    validate_ai_config: async (_args: any) => {
      const warnings = await validateAIConfig();
      return { valid: warnings.length === 0, warnings };
    },

    seed_default_ai_config: async (args: { force?: boolean }) => {
      return await seedDefaultAIConfig(!!args.force);
    },

    import_ai_config: async (args: {
      providers?: any[];
      harnesses?: any[];
      models?: any[];
      roles?: any[];
      bundles?: any[];
    }) => {
      if (!args.providers && !args.harnesses && !args.models && !args.roles) {
        throw createError("INVALID_ARGUMENTS", "No import data provided");
      }
      return await importAIConfig({
        providers: args.providers || [],
        harnesses: args.harnesses || [],
        models: args.models || [],
        roles: args.roles || [],
        bundles: args.bundles || [],
      });
    },

    list_ai_providers: async (_args: any) => {
      const providers = await getAIProviders();
      return { count: providers.length, providers };
    },

    get_ai_provider: async (args: { id: string }) => {
      if (!args.id) throw createError("INVALID_ARGUMENTS", "id is required");
      const provider = await getAIProvider(args.id);
      if (!provider) throw createError("NOT_FOUND", `Provider '${args.id}' not found`);
      return provider;
    },

    upsert_ai_provider: async (args: {
      id: string; name: string; type: string;
      endpoint_url?: string; api_key?: string; config_json?: string;
    }) => {
      if (!args.id || !args.name || !args.type) {
        throw createError("INVALID_ARGUMENTS", "id, name, and type are required");
      }
      const validTypes = ["openai","anthropic","google","ollama","opencode","codex","spring_ai","lm_server","custom"];
      if (!validTypes.includes(args.type)) {
        throw createError("INVALID_ARGUMENTS", `Invalid provider type '${args.type}'. Must be one of: ${validTypes.join(", ")}`);
      }
      await upsertAIProvider(args as any);
      return { saved: true, id: args.id };
    },

    delete_ai_provider: async (args: { id: string }) => {
      if (!args.id) throw createError("INVALID_ARGUMENTS", "id is required");
      const deleted = await deleteAIProvider(args.id);
      if (!deleted) throw createError("NOT_FOUND", `Provider '${args.id}' not found`);
      return { deleted: true, id: args.id };
    },

    list_ai_harnesses: async (_args: any) => {
      const harnesses = await getAIHarnesses();
      return { count: harnesses.length, harnesses };
    },

    get_ai_harness: async (args: { id: string }) => {
      if (!args.id) throw createError("INVALID_ARGUMENTS", "id is required");
      const harness = await getAIHarness(args.id);
      if (!harness) throw createError("NOT_FOUND", `Harness '${args.id}' not found`);
      return harness;
    },

    upsert_ai_harness: async (args: {
      id: string; name: string; invocation_semantics?: string;
    }) => {
      if (!args.id || !args.name) {
        throw createError("INVALID_ARGUMENTS", "id and name are required");
      }
      await upsertAIHarness(args);
      return { saved: true, id: args.id };
    },

    delete_ai_harness: async (args: { id: string }) => {
      if (!args.id) throw createError("INVALID_ARGUMENTS", "id is required");
      const deleted = await deleteAIHarness(args.id);
      if (!deleted) throw createError("NOT_FOUND", `Harness '${args.id}' not found`);
      return { deleted: true, id: args.id };
    },

    list_ai_models: async (_args: any) => {
      const models = await getAIModels();
      return { count: models.length, models };
    },

    get_ai_model: async (args: { id: string }) => {
      if (!args.id) throw createError("INVALID_ARGUMENTS", "id is required");
      const model = await getAIModel(args.id);
      if (!model) throw createError("NOT_FOUND", `Model '${args.id}' not found`);
      return model;
    },

    upsert_ai_model: async (args: {
      id: string; name: string; harness_id: string;
      provider_id?: string; model_identifier: string;
    }) => {
      if (!args.id || !args.name || !args.harness_id || !args.model_identifier) {
        throw createError("INVALID_ARGUMENTS", "id, name, harness_id, and model_identifier are required");
      }
      await upsertAIModel(args);
      return { saved: true, id: args.id };
    },

    delete_ai_model: async (args: { id: string }) => {
      if (!args.id) throw createError("INVALID_ARGUMENTS", "id is required");
      const deleted = await deleteAIModel(args.id);
      if (!deleted) throw createError("NOT_FOUND", `Model '${args.id}' not found`);
      return { deleted: true, id: args.id };
    },

    list_ai_role_configs: async (_args: any) => {
      const roles = await getAIRoleConfigs();
      return { count: roles.length, roles };
    },

    get_ai_role_config: async (args: { role: string }) => {
      if (!args.role) throw createError("INVALID_ARGUMENTS", "role is required");
      const rc = await getAIRoleConfig(args.role);
      if (!rc) throw createError("NOT_FOUND", `Role config '${args.role}' not found`);
      return rc;
    },

    upsert_ai_role_config: async (args: {
      id: string; role: string; provider_id: string;
      harness_id: string; model_id: string;
      extra_params?: string; bundles?: any[];
    }) => {
      if (!args.id || !args.role || !args.provider_id || !args.harness_id || !args.model_id) {
        throw createError("INVALID_ARGUMENTS", "id, role, provider_id, harness_id, and model_id are required");
      }
      await upsertAIRoleConfig(args);

      if (Array.isArray(args.bundles) && args.bundles.length > 0) {
        await upsertConfigBundles(args.role, args.bundles);
      }

      return { saved: true, id: args.id, role: args.role };
    },

    list_config_bundles: async (args: { role: string }) => {
      if (!args.role) throw createError("INVALID_ARGUMENTS", "role is required");
      const bundles = await getConfigBundles(args.role);
      return { role: args.role, count: bundles.length, bundles };
    },

    upsert_config_bundle: async (args: {
      id: string; name: string; role: string; model_id: string;
      provider_id?: string; harness_id?: string; priority?: number;
      invocation_mode?: string; command?: string; endpoint_url?: string; timeout_ms?: number;
    }) => {
      if (!args.id || !args.name || !args.role || !args.model_id) {
        throw createError("INVALID_ARGUMENTS", "id, name, role, and model_id are required");
      }
      await upsertConfigBundle({
        ...args,
        invocation_mode: (args.invocation_mode || "CLI") as "CLI" | "HTTP" | "SDK" | "MCP",
      });
      return { saved: true, id: args.id };
    },

    delete_config_bundle: async (args: { id: string }) => {
      if (!args.id) throw createError("INVALID_ARGUMENTS", "id is required");
      const deleted = await deleteConfigBundle(args.id);
      if (!deleted) throw createError("NOT_FOUND", `Bundle '${args.id}' not found`);
      return { deleted: true, id: args.id };
    },
  };
}
