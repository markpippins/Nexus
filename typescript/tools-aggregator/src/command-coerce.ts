/**
 * tools-aggregator — command-router schema-driven argument coercion.
 *
 * Folded in from slash-command-mcp (D-2026-08-16-002). Takes the raw string
 * args from the DSL parser and coerces each value against the registered
 * param_schema (from mcp.command_registry.param_schema). Rejects unknown
 * flags, missing required params, and type mismatches with structured errors
 * (never 500s).
 */

import type { InputSchema, InputSchemaProperty } from "mcp-types";

export class CoercionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoercionError";
  }
}

/** Coerce a single raw string value per the property's schema. */
export function coerceValue(
  name: string,
  raw: string,
  prop: InputSchemaProperty
): any {
  // anyOf/oneOf unions: pick the richest branch that can accept the value.
  // Prefer array > object > number > boolean > string (loosest last).
  const union = prop.anyOf || prop.oneOf;
  if (union && Array.isArray(union) && union.length > 0) {
    const branches = union.map((b: any) => ({
      type: b.type || "string",
      description: b.description || prop.description || "",
      items: b.items,
      enum: b.enum,
    }));
    // Try to coerce per-branch, falling back to the next until one succeeds.
    const order = ["array", "object", "number", "integer", "boolean", "string"];
    const sorted = [...branches].sort(
      (a, b) => order.indexOf(a.type) - order.indexOf(b.type)
    );
    let lastErr: Error | null = null;
    for (const branch of sorted) {
      try {
        return coerceValue(name, raw, branch);
      } catch (e: any) {
        lastErr = e;
      }
    }
    throw lastErr || new CoercionError(`Flag --${name}: could not coerce "${raw}"`);
  }

  const type = prop.type || "string";

  // Boolean flags: bare flag (raw === "") → true; explicit true/false parsed.
  if (type === "boolean") {
    if (raw === "") return true;
    const v = raw.toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    throw new CoercionError(
      `Flag --${name}: expected boolean, got "${raw}" (use true/false or bare flag)`
    );
  }

  if (raw === "") {
    throw new CoercionError(`Flag --${name} requires a value`);
  }

  switch (type) {
    case "string": {
      // Enforce enum if declared.
      if (prop.enum && prop.enum.length > 0 && !prop.enum.includes(raw)) {
        throw new CoercionError(
          `Flag --${name}: "${raw}" not in enum [${prop.enum.join(", ")}]`
        );
      }
      return raw;
    }
    case "number":
    case "integer": {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        throw new CoercionError(`Flag --${name}: "${raw}" is not a number`);
      }
      if (type === "integer" && !Number.isInteger(n)) {
        throw new CoercionError(`Flag --${name}: "${raw}" is not an integer`);
      }
      return n;
    }
    case "array": {
      // items.type guides element coercion. Split on comma unless the
      // value already looks like JSON.
      const itemType = (prop.items as Record<string, any> | undefined)?.type;
      let rawArr: string[];
      if (raw.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            throw new CoercionError(`Flag --${name}: expected array`);
          }
          return parsed;
        } catch (e: any) {
          if (e instanceof CoercionError) throw e;
          throw new CoercionError(`Flag --${name}: invalid JSON array "${raw}"`);
        }
      }
      rawArr = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      if (rawArr.length === 0) {
        throw new CoercionError(`Flag --${name}: empty array`);
      }
      if (itemType && itemType !== "string") {
        return rawArr.map((s) => coerceValue(name, s, { type: itemType } as InputSchemaProperty));
      }
      return rawArr;
    }
    case "object": {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        return parsed;
      } catch {
        throw new CoercionError(`Flag --${name}: expected JSON object, got "${raw}"`);
      }
    }
    default:
      // Unknown declared type — pass through as string (schema may be loose).
      return raw;
  }
}

/**
 * Coerce the parsed DSL args against a registered schema.
 *
 * @param args raw string args from the parser
 * @param positionals bare positional tokens
 * @param schema the tool's inputSchema from the registry
 * @param allowExtra if true, unknown flags are preserved as strings
 *        instead of rejected (default false — strict DSL)
 * @returns coerced typed arguments object
 * @throws CoercionError on unknown flag / missing required / bad type
 */
export function coerceArgs(
  args: Record<string, string>,
  positionals: string[],
  schema: InputSchema | undefined,
  allowExtra = false
): Record<string, any> {
  const props: Record<string, InputSchemaProperty> = schema?.properties || {};
  const required: string[] = schema?.required || [];
  const coerced: Record<string, any> = {};

  // Positionals: bind in declaration order to props that are not already
  // set by flags. Rare in this codebase (all params are named), but useful.
  if (positionals.length > 0) {
    const propNames = Object.keys(props);
    let pi = 0;
    for (const pname of propNames) {
      if (pi >= positionals.length) break;
      if (!(pname in coerced) && !(pname in args)) {
        coerced[pname] = positionals[pi];
        pi++;
      }
    }
    if (pi < positionals.length) {
      throw new CoercionError(
        `Unexpected positional arguments: ${positionals.slice(pi).join(" ")}`
      );
    }
  }

  // Flags.
  for (const [name, raw] of Object.entries(args)) {
    const prop = props[name];
    if (!prop) {
      if (allowExtra) {
        coerced[name] = raw;
        continue;
      }
      const known = Object.keys(props).join(", ") || "(none)";
      throw new CoercionError(
        `Unknown flag --${name} (known flags: ${known})`
      );
    }
    coerced[name] = coerceValue(name, raw, prop);
  }

  // Required params.
  for (const req of required) {
    if (!(req in coerced)) {
      throw new CoercionError(`Missing required param: --${req}`);
    }
  }

  return coerced;
}
