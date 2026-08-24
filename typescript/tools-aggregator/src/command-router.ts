/**
 * tools-aggregator — command-router (folded in from slash-command-mcp,
 * D-2026-08-16-002).
 *
 * Serves the 3 Phase-2 DSL tools NATIVELY on the aggregator — no hop to a
 * separate :3220 MCP:
 *
 *   1. command_lookup      — resolve a command line (or bare command) to its
 *                            registry metadata: description, params, protocol.
 *   2. command_execute     — parse + coerce + validate + dispatch through the
 *                            aggregator's own tool registry (single hop).
 *   3. command_completions — suggest services, commands, and flags for a
 *                            partial DSL string.
 *
 * The `mcp.command_registry` read-model lives in ./command-registry
 * (aggregator-owned). Execution dispatches through the ToolDiscovery
 * instance passed in — the same registry that serves /tools/call — so the
 * router never opens its own client connections to the backends.
 *
 * Errors are returned as structured { error, code } results, never thrown
 * as HTTP 500s.
 */

import type { InputSchema } from "mcp-types";
import { parseCommandLine, type ParsedCommand } from "./command-parser";
import { coerceArgs, CoercionError } from "./command-coerce";
import {
  findCommand,
  resolveCommand,
  resolveService,
  listServices,
  listCommands,
  listFlags,
  searchCommands,
  describeRow,
  type RegistryRow,
} from "./command-registry";

export interface CommandDispatch {
  /** Dispatch a resolved, coerced tool call through the aggregator registry. */
  (command: string, args: Record<string, any>): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    service?: string;
    tool?: string;
  }>;
}

// ── Tool definitions (MCP tools/list + aggregator /tools) ─────────

export const commandToolDefinitions = [
  {
    name: "command_lookup",
    description:
      "Resolve a DSL command line (e.g. 'nebula-mcp nebula_list_agent_records' or a bare unique command) against the command registry. Returns service, description, protocol, and the full parameter schema with required flags. Read-only, no execution.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "Command line to resolve, e.g. 'nebula-mcp nebula_list_agent_records' or bare 'nebula_list_agent_records'. Optional flags are ignored for lookup.",
        },
      },
      required: ["command"],
    } as InputSchema,
  },
  {
    name: "command_execute",
    description:
      "Parse, coerce, and execute a DSL command line through the tools-aggregator single hop. Supports --flag value, --flag=value, quoted values, and bare boolean flags. Arguments are coerced against the registered param_schema and required params are validated before dispatch.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "Full DSL command line, e.g. '/nebula-mcp nebula_list_agent_records --role architect --limit 5'.",
        },
        allowExtra: {
          type: "boolean",
          description:
            "If true, unknown flags are passed through as strings instead of rejected (default false — strict).",
        },
      },
      required: ["command"],
    } as InputSchema,
  },
  {
    name: "command_completions",
    description:
      "Given a partial DSL string, return completion candidates: service names (empty prefix), command names for a service, and flag names for a service+command. Used for tab-completion-style suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        partial: {
          type: "string",
          description:
            "Partial command line, e.g. 'neb' or 'nebula-mcp nebula_list' or 'nebula-mcp nebula_list_agent_records --r'.",
        },
        limit: {
          type: "number",
          description: "Max suggestions per category (default 20).",
        },
      },
      required: ["partial"],
    } as InputSchema,
  },
];

// ── Result helpers ─────────────────────────────────────────────────

function ok(result: any) {
  return { result };
}

function err(code: string, message: string) {
  return { result: { error: message, code }, isError: true };
}

// ── Tool handlers ──────────────────────────────────────────────────

async function handleLookup(args: any) {
  const commandLine: string = String(args.command || "").trim();
  if (!commandLine) {
    return err("INVALID_REQUEST", "command is required");
  }

  let parsed: ParsedCommand;
  try {
    parsed = parseCommandLine(commandLine);
  } catch (e: any) {
    return err("DSL_PARSE_ERROR", e.message);
  }

  try {
    if (parsed.service) {
      const service = await resolveService(parsed.service);
      if (!service) {
        return err("SERVICE_NOT_FOUND", `Unknown service: ${parsed.service}`);
      }
      const row = await findCommand(service, parsed.command);
      if (!row) {
        return err(
          "COMMAND_NOT_FOUND",
          `Unknown command "${parsed.command}" on service ${service}`
        );
      }
      return ok({ command: describeRow(row) });
    }

    // Bare command — must be unique.
    const resolved = await resolveCommand(parsed.command);
    if ("matches" in resolved) {
      if (resolved.matches.length === 0) {
        return err("COMMAND_NOT_FOUND", `Unknown command: ${parsed.command}`);
      }
      return err(
        "AMBIGUOUS_COMMAND",
        `Command "${parsed.command}" exists on multiple services: ${resolved.matches.join(", ")}. Prefix with a service.`
      );
    }
    return ok({ command: describeRow(resolved.row) });
  } catch (e: any) {
    return err("REGISTRY_ERROR", `Registry lookup failed: ${e.message}`);
  }
}

async function handleExecute(args: any, dispatch: CommandDispatch) {
  const commandLine: string = String(args.command || "").trim();
  const allowExtra = Boolean(args.allowExtra);
  if (!commandLine) {
    return err("INVALID_REQUEST", "command is required");
  }

  let parsed: ParsedCommand;
  try {
    parsed = parseCommandLine(commandLine);
  } catch (e: any) {
    return err("DSL_PARSE_ERROR", e.message);
  }

  try {
    // Resolve the tool row (service-scoped or bare-unique).
    let row: RegistryRow;
    let matchedService: string;

    if (parsed.service) {
      const service = await resolveService(parsed.service);
      if (!service) {
        return err("SERVICE_NOT_FOUND", `Unknown service: ${parsed.service}`);
      }
      const found = await findCommand(service, parsed.command);
      if (!found) {
        return err(
          "COMMAND_NOT_FOUND",
          `Unknown command "${parsed.command}" on service ${service}`
        );
      }
      row = found;
      matchedService = service;
    } else {
      const resolved = await resolveCommand(parsed.command);
      if ("matches" in resolved) {
        if (resolved.matches.length === 0) {
          return err("COMMAND_NOT_FOUND", `Unknown command: ${parsed.command}`);
        }
        return err(
          "AMBIGUOUS_COMMAND",
          `Command "${parsed.command}" exists on multiple services: ${resolved.matches.join(", ")}. Prefix with a service.`
        );
      }
      row = resolved.row;
      matchedService = resolved.serviceMatched;
    }

    // Coerce + validate.
    let coerced: Record<string, any>;
    try {
      coerced = coerceArgs(parsed.args, parsed.positionals, row.param_schema || undefined, allowExtra);
    } catch (e: any) {
      if (e instanceof CoercionError) {
        return err("COERCION_ERROR", e.message);
      }
      throw e;
    }

    // Dispatch through the aggregator registry (single hop).
    const response = await dispatch(parsed.command, coerced);

    return ok({
      service: matchedService,
      command: parsed.command,
      protocol: row.protocol,
      arguments: coerced,
      result: response.result,
      dispatch: {
        success: response.success,
        service: response.service,
        tool: response.tool,
      },
    });
  } catch (e: any) {
    return err("EXECUTION_ERROR", `Execution failed: ${e.message}`);
  }
}

async function handleCompletions(args: any) {
  const rawPartial: string = String(args.partial || "");
  // Trailing space is a signal ("user finished typing the service token") and
  // must be computed on the RAW string before trimming.
  const hasTrailingSpace = rawPartial.endsWith(" ");
  const partial: string = rawPartial.trim();
  const limit = Number(args.limit) > 0 ? Number(args.limit) : 20;
  if (!partial) {
    // Empty input → suggest all services.
    const services = await listServices();
    return ok({ services: services.slice(0, limit), stage: "service" });
  }

  // Parse what we can; tolerate incomplete input (parser may throw).
  let parsed: ParsedCommand;
  try {
    parsed = parseCommandLine(partial);
  } catch {
    // Incomplete input — try to offer a service/command suggestion from the
    // raw string.
    const tokens = partial.trim().split(/\s+/);
    if (tokens.length === 1 && !tokens[0].startsWith("--")) {
      const services = (await listServices()).filter((s) =>
        s.toLowerCase().startsWith(tokens[0].toLowerCase())
      );
      return ok({ services: services.slice(0, limit), stage: "service" });
    }
    return ok({ services: [], stage: "unknown" });
  }

  // Service stage: user typed a service token (maybe partial) but no command yet.
  if (parsed.service && !parsed.command) {
    // Can't happen — parser always assigns a command. Keep for completeness.
    return ok({ stage: "command" });
  }

  if (!parsed.service) {
    // Single token → service suggestions (or bare command suggestions).
    const services = (await listServices()).filter((s) =>
      s.toLowerCase().startsWith(parsed.command.toLowerCase())
    );
    // "nebula " (trailing space + exact service match) → commands for that service.
    if (hasTrailingSpace && services.length === 1 && services[0].toLowerCase() === parsed.command.toLowerCase()) {
      const commands = await listCommands(services[0]);
      return ok({
        service: services[0],
        commands: commands.slice(0, limit).map((c) => c.command),
        stage: "command",
      });
    }
    if (services.length > 0) {
      return ok({ services: services.slice(0, limit), stage: "service" });
    }
    // Fall back to command suggestions across all services for bare commands.
    const matches = await searchCommands(parsed.command, limit);
    return ok({
      commands: matches.map((r) => ({ command: r.command, service: r.service })),
      stage: "command",
    });
  }

  // Service given — resolve it.
  const serviceToken = parsed.service;
  if (!serviceToken) {
    return ok({ services: [], stage: "unknown" });
  }
  const service = await resolveService(serviceToken);
  if (!service) {
    const services = (await listServices()).filter((s) =>
      s.toLowerCase().startsWith(serviceToken.toLowerCase())
    );
    return ok({ services: services.slice(0, limit), stage: "service" });
  }

  // If there's a trailing space after service, suggest commands for the service.
  const afterService = partial.slice(partial.indexOf(serviceToken) + serviceToken.length);
  if (afterService.trim() === "" || hasTrailingSpace) {
    const commands = await listCommands(service);
    return ok({
      service,
      commands: commands.slice(0, limit).map((c) => c.command),
      stage: "command",
    });
  }

  // Command partial → suggest commands matching prefix.
  const commandPrefix = parsed.command;
  const commands = await listCommands(service, commandPrefix);
  if (commands.length > 0 && commands[0].command === commandPrefix) {
    // Exact command — suggest flags from the param_schema.
    let prefix = "";
    const m = partial.match(/--([a-zA-Z0-9_]*)$/);
    if (m) prefix = m[1];
    const flags = await listFlags(service, commandPrefix, prefix);
    return ok({
      service,
      command: commandPrefix,
      flags: flags.slice(0, limit),
      stage: "flag",
    });
  }
  return ok({
    service,
    commands: commands.slice(0, limit).map((c) => c.command),
    stage: "command",
  });
}

// ── Dispatcher ─────────────────────────────────────────────────────

export async function handleCommandToolCall(
  toolName: string,
  toolArgs: any,
  dispatch: CommandDispatch
): Promise<any> {
  switch (toolName) {
    case "command_lookup":
      return handleLookup(toolArgs || {});
    case "command_execute":
      return handleExecute(toolArgs || {}, dispatch);
    case "command_completions":
      return handleCompletions(toolArgs || {});
    default:
      return err("TOOL_NOT_FOUND", `Unknown tool: ${toolName}`);
  }
}
