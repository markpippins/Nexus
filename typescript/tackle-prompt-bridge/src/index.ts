// tackle-prompt-bridge — MCP server exposing tackle.prompts as prompt resources.
//
// The Role this serves:
//   Live `.opencode/agents/<role>.md` files are being rewritten so that,
//   instead of inlining a static persona body, they simply instruct the
//   agent to "fetch my persona from the prompt bridge via prompts/get
//   `{role}/opencode-persona`". The bridge reads `prompt:proc:{role}::...`
//   from Redis (populated by tackle-prompt-sync-srv) and returns the
//   latest version of each template as a ready-to-instantiate MCP prompt.
//
// Transport:
//   stdio by default (suitable for opencode's MCP stdio launcher config).
//   The stdio handler owns the connection lifecycle; opencode spawns this
//   process once per agent session. There is no HTTP server here — the
//   bridge is a leaf MCP consumed directly by the agent runtime.
//
// Resources exposed:
//   prompts/list           → enumerate prompt templates for the
//                             role(s) the caller asks about (via the
//                             optional `role` argument) or ALL roles
//                             if no role is supplied.
//   prompts/get {name}     → return a fully-rendered prompt given a
//                             "{role}/{slug}" name. The body_md is
//                             returned as-is (parameter substitution
//                             is the caller's job — we expose the raw
//                             template so it can be reused across many
//                             task scopes).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { initRedis, closeRedis, getRedis, IDX_KEY, PROC_KEY } from "./redis";

interface CachedPromptIndexEntry {
  slug: string;
  title: string;
  version: number;
  tags: string[];
  updated_at: string;
}

interface CachedPromptCard {
  id: string;
  role: string;
  slug: string;
  version: number;
  title: string;
  body_md: string;
  parameter_schema: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Read the prompt index for a role. Returns [] on cache miss so an
 * unknown role degrades gracefully (empty list) rather than throwing.
 */
async function readPromptIndex(role: string): Promise<CachedPromptIndexEntry[]> {
  try {
    const redis = getRedis();
    const raw = await redis.get(IDX_KEY(role));
    if (!raw) return [];
    return JSON.parse(raw) as CachedPromptIndexEntry[];
  } catch (err: any) {
    console.error(`[prompt-bridge] readPromptIndex(${role}) failed: ${err.message}`);
    return [];
  }
}

/**
 * Read a single prompt card. Returns null on cache miss (caller decides
 * whether to 404 or fall back to a static file).
 */
async function readPromptCard(
  role: string,
  slug: string
): Promise<CachedPromptCard | null> {
  const redis = getRedis();
  // Transport-down must NOT masquerade as a cache miss. When Redis isn't
  // reachable, say so loudly — agents were debugging phantom "prompt not
  // cached" errors during outages (see to-do: return 503-equivalent).
  if (redis.status !== "ready") {
    throw new Error(
      `Redis unavailable (status: ${redis.status}). The prompt cache is unreachable; cannot serve "${role}/${slug}". Verify Redis on ${
        process.env.PROMPT_REDIS_URL || process.env.MEMORY_REDIS_URL || "redis://localhost:6379"
      } and retry.`
    );
  }
  try {
    const raw = await redis.get(PROC_KEY(role, slug));
    if (!raw) return null;
    return JSON.parse(raw) as CachedPromptCard;
  } catch (err: any) {
    // An actual GET failure mid-request is also a transport problem,
    // not evidence the prompt doesn't exist.
    console.error(`[prompt-bridge] readPromptCard(${role}, ${slug}) failed: ${err.message}`);
    throw new Error(
      `Redis read failed while fetching prompt "${role}/${slug}": ${err.message}. The prompt cache is unreachable — this is an infrastructure error, not a missing prompt.`
    );
  }
}

async function main() {
  initRedis();

  const server = new Server(
    { name: "tackle-prompt-bridge", version: "1.0.0" },
    { capabilities: { prompts: {} } }
  );

  // ── prompts/list ──────────────────────────────────────────────────
  // The MCP spec lets the caller pass a `cursor` for pagination; we don't
  // paginate (the number of prompt templates per role is small — single
  // digits per role, ≤11 total in the seed). We accept an optional `role`
  // argument via the params to scope the listing to a single role; if
  // omitted, we enumerate ALL cached roles via the Redis SCAN of
  // `prompt:idx:*`. The stdio MCP client (opencode) controls what role
  // it asks about.
  server.setRequestHandler(ListPromptsRequestSchema, async (req: any) => {
    const role: string | undefined = req?.params?.role;
    let rolesToList: string[];

    if (role) {
      rolesToList = [role];
    } else {
      // Scan all prompt:idx:* keys. SCAN is cursor-based and doesn't block
      // Redis; we walk to completion. The number of roles is small.
      try {
        const redis = getRedis();
        const found = new Set<string>();
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(
            cursor,
            "MATCH",
            "prompt:idx:*",
            "COUNT",
            100
          );
          cursor = next;
          for (const k of keys) {
            const r = k.substring("prompt:idx:".length);
            if (r) found.add(r);
          }
        } while (cursor !== "0");
        rolesToList = Array.from(found).sort();
      } catch (err: any) {
        console.error(`[prompt-bridge] scan roles failed: ${err.message}`);
        return { prompts: [] };
      }
    }

    const prompts = [];
    for (const r of rolesToList) {
      const idx = await readPromptIndex(r);
      for (const entry of idx) {
        prompts.push({
          // MCP `name` for prompts.get must be unique within the server
          // and is opaque to the client. We encode the (role, slug) pair
          // as "{role}/{slug}" so a single GET can resolve it without
          // the caller needing to know the role separately.
          name: `${r}/${entry.slug}`,
          description: entry.title,
          // No arguments typed here: parameter substitution is the
          // caller's responsibility. We surface the parameter_schema
          // via the GetPromptRequest response for the caller to read.
        });
      }
    }

    return { prompts };
  });

  // ── prompts/get ───────────────────────────────────────────────────
  // `name` MUST be "{role}/{slug}". Returns the raw body_md plus the
  // parameter_schema as embedded metadata (the MCP prompt response
  // shape only has `messages`, so we stash parameter_schema in a
  // top-level metadata field the caller can read structurally).
  server.setRequestHandler(GetPromptRequestSchema, async (req: any) => {
    const name: string | undefined = req?.params?.name;
    const args: Record<string, any> | undefined = req?.params?.arguments;

    if (!name || !name.includes("/")) {
      throw new Error(
        `Invalid prompt name "${name}". Expected "{role}/{slug}".`
      );
    }
    const slashIdx = name.indexOf("/");
    const role = name.substring(0, slashIdx);
    const slug = name.substring(slashIdx + 1);

    const card = await readPromptCard(role, slug);
    if (!card) {
      throw new Error(
        `Prompt "${name}" not cached. Either the role/slug is unknown or the sync server hasn't run yet (POST /refresh on tackle-prompt-sync-srv).`
      );
    }

    // The MCP prompt response shape is { messages: [{ role, content }] }.
    // We return a single "user" turn containing the body_md as text.
    // The agent runtime is expected to substitute parameters and inject
    // the rendered body into the actual system prompt slot.
    //
    // Optional caller-provided args are surfaced verbatim if present; the
    // bridge deliberately does NOT render {placeholders} itself — the same
    // template is reused across many task scopes with different bindings,
    // so per-scope substitution belongs to the launch harness, not the
    // bridge. We DO emit the parameter_schema so the caller knows which
    // placeholders the body expects.
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: card.body_md,
          },
        },
      ],
      // Extension metadata — MCP clients that don't understand this
      // field simply ignore it; opencode and the CLI read it to drive
      // parameter-substitution rendering.
      _tackle: {
        role: card.role,
        slug: card.slug,
        version: card.version,
        title: card.title,
        tags: card.tags,
        parameter_schema: card.parameter_schema,
        created_at: card.created_at,
        updated_at: card.updated_at,
        // Caller arguments passed through verbatim for downstream rendering.
        arguments: args || {},
      },
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[tackle-prompt-bridge] stdio MCP server connected");
}

main().catch((err) => {
  console.error("[tackle-prompt-bridge] Fatal startup error:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await closeRedis();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeRedis();
  process.exit(0);
});
