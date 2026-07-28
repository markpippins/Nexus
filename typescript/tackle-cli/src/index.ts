#!/usr/bin/env node
// index.ts — `tackle` CLI entry point.
//
// Arg parsing is intentionally hand-rolled: the surface is small (two
// resource types × three operations), and pulling commander/yargs would
// add 1-2 MB of devDeps for no ergonomic win. The dispatch shape is:
//
//   tackle <resource> <action> [positional...] [--flags...]
//
// Resource is one of {prompts, tasks}; action depends on the resource.

import { closeDb } from "./db.js";
import { runPromptsList } from "./commands/prompts.list.js";
import { runPromptsShow } from "./commands/prompts.show.js";
import { runPromptsDiff } from "./commands/prompts.diff.js";
import { runPromptsRender } from "./commands/prompts.render.js";
import { runTasksList } from "./commands/tasks.list.js";
import { runTasksShow } from "./commands/tasks.show.js";

const USAGE = `\
Usage:
  tackle prompts list [--role <role>]
  tackle prompts show <role>/<slug> [--version <n>]
  tackle prompts diff <role>/<slug> --from <v1> --to <v2>
  tackle prompts render <role>/<slug> --params key=val [--params key2=val2] [--version <n>]
  tackle tasks list [--role <role>] [--all]
  tackle tasks show <task-slug>

Flags:
  --role <role>      Filter to the given role (prompts list, tasks list)
  --version <n>      Use this version instead of the latest (prompts show, prompts render)
  --from <v1>        Source version for diff (required for prompts diff)
  --to <v2>          Target version for diff (required for prompts diff)
  --params key=val   Substitution pair (prompts render). May be repeated.
                     Also accepts comma-separated: --params k1=v1,k2=v2.
  --all              Include inactive tasks (tasks list)

Environment:
  TACKLE_PG_DSN      PostgreSQL DSN (overrides default)
  CONDUIT_PG_DSN     Fallback DSN
                      (default: postgresql://pguser:pgpass@localhost:5432/nexus)

Commands:
  prompts list     tabular list of latest prompt versions
  prompts show     full body + _tackle metadata block
  prompts diff     unified diff of body_md between two versions
  prompts render   \${param} substitution into body_md
  tasks list       tabular list of active tasks (use --all for inactive too)
  tasks show       task definition + acceptance criteria + prompt ref
`;

function failUsage(msg: string): never {
  console.error("tackle: " + msg);
  console.error(USAGE);
  process.exit(2);
}

function parseFlagValue<T>(
  args: string[],
  flag: string,
  coerce: (raw: string) => T
): T | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0) return undefined;
  if (idx + 1 >= args.length) {
    failUsage(`flag ${flag} expects a value, got end-of-args`);
  }
  const raw = args[idx + 1];
  if (raw.startsWith("--")) {
    failUsage(`flag ${flag} expects a value, got "${raw}" (looks like another flag)`);
  }
  let parsed: T;
  try {
    parsed = coerce(raw);
  } catch (err: any) {
    failUsage(`flag ${flag}: ${err?.message ?? err}`);
  }
  // Splice the flag + value out so the remaining args (positional + repeats)
  // can be processed by the caller.
  args.splice(idx, 2);
  return parsed;
}

function parseFlagAll(args: string[], flag: string): string[] {
  // Collects all occurrences of a repeating flag (--params k=v --params k2=v2).
  const out: string[] = [];
  let idx: number;
  while ((idx = args.indexOf(flag)) >= 0) {
    if (idx + 1 >= args.length) {
      failUsage(`flag ${flag} expects a value, got end-of-args`);
    }
    const raw = args[idx + 1];
    if (raw.startsWith("--")) {
      failUsage(`flag ${flag} expects a value, got "${raw}" (looks like another flag)`);
    }
    out.push(raw);
    args.splice(idx, 2);
  }
  return out;
}

function hasFlag(args: string[], flag: string): boolean {
  const idx = args.indexOf(flag);
  if (idx < 0) return false;
  args.splice(idx, 1);
  return true;
}

/**
 * Parse a "role/slug" positional into {role, slug}. The slug may itself
 * contain a slash in principle — but our data has none, so we split on the
 * FIRST slash and treat the rest as the slug.
 */
function parseRoleSlug(spec: string): { role: string; slug: string } {
  const slash = spec.indexOf("/");
  if (slash <= 0) {
    failUsage(
      `expected <role>/<slug>, got "${spec}" (no '/' or empty role before '/')`
    );
  }
  if (slash === spec.length - 1) {
    failUsage(`expected <role>/<slug>, got "${spec}" (empty slug after '/')`);
  }
  return { role: spec.slice(0, slash), slug: spec.slice(slash + 1) };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    console.log(USAGE);
    return 0;
  }
  if (argv[0] === "help" || argv[0] === "--help-all") {
    console.log(USAGE);
    return 0;
  }

  const resource = argv.shift();
  const action = argv.shift();

  if (!resource || !action) {
    failUsage("expected <resource> <action>");
  }

  try {
    switch (`${resource} ${action}`) {
      case "prompts list": {
        const role = parseFlagValue(argv, "--role", (s) => s);
        if (argv.length > 0) {
          failUsage(`unexpected extra args: ${argv.join(" ")}`);
        }
        return await runPromptsList({ role });
      }
      case "prompts show": {
        if (argv.length === 0) {
          failUsage("prompts show requires <role>/<slug>");
        }
        const spec = argv.shift()!;
        const { role, slug } = parseRoleSlug(spec);
        const version = parseFlagValue(argv, "--version", (s) => {
          const n = parseInt(s, 10);
          if (!Number.isInteger(n) || n < 1) {
            throw new Error(`expected positive integer, got "${s}"`);
          }
          return n;
        });
        if (argv.length > 0) {
          failUsage(`unexpected extra args: ${argv.join(" ")}`);
        }
        return await runPromptsShow({ role, slug, version });
      }
      case "prompts diff": {
        if (argv.length === 0) {
          failUsage("prompts diff requires <role>/<slug>");
        }
        const spec = argv.shift()!;
        const { role, slug } = parseRoleSlug(spec);
        const fromVersion = parseFlagValue(argv, "--from", (s) => {
          const n = parseInt(s, 10);
          if (!Number.isInteger(n) || n < 1) {
            throw new Error(`expected positive integer, got "${s}"`);
          }
          return n;
        });
        const toVersion = parseFlagValue(argv, "--to", (s) => {
          const n = parseInt(s, 10);
          if (!Number.isInteger(n) || n < 1) {
            throw new Error(`expected positive integer, got "${s}"`);
          }
          return n;
        });
        if (fromVersion === undefined) {
          failUsage("prompts diff requires --from <version>");
        }
        if (toVersion === undefined) {
          failUsage("prompts diff requires --to <version>");
        }
        if (argv.length > 0) {
          failUsage(`unexpected extra args: ${argv.join(" ")}`);
        }
        return await runPromptsDiff({
          role,
          slug,
          fromVersion,
          toVersion,
        });
      }
      case "prompts render": {
        if (argv.length === 0) {
          failUsage("prompts render requires <role>/<slug>");
        }
        const spec = argv.shift()!;
        const { role, slug } = parseRoleSlug(spec);
        const version = parseFlagValue(argv, "--version", (s) => {
          const n = parseInt(s, 10);
          if (!Number.isInteger(n) || n < 1) {
            throw new Error(`expected positive integer, got "${s}"`);
          }
          return n;
        });
        const params = parseFlagAll(argv, "--params");
        if (argv.length > 0) {
          failUsage(`unexpected extra args: ${argv.join(" ")}`);
        }
        return await runPromptsRender({ role, slug, version, params });
      }
      case "tasks list": {
        const role = parseFlagValue(argv, "--role", (s) => s);
        const all = hasFlag(argv, "--all");
        if (argv.length > 0) {
          failUsage(`unexpected extra args: ${argv.join(" ")}`);
        }
        return await runTasksList({ role, all });
      }
      case "tasks show": {
        if (argv.length === 0) {
          failUsage("tasks show requires <task-slug>");
        }
        const taskSlug = argv.shift()!;
        if (argv.length > 0) {
          failUsage(`unexpected extra args: ${argv.join(" ")}`);
        }
        return await runTasksShow({ taskSlug });
      }
      default:
        failUsage(`unknown command: ${resource} ${action}`);
    }
  } catch (err: any) {
    console.error(`tackle: ${err?.message ?? err}`);
    return 1;
  } finally {
    await closeDb();
  }
  // Unreachable — switch is exhaustive, but TS can't always prove it.
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`tackle: fatal: ${err?.message ?? err}`);
    process.exit(1);
  });
