import { MCPServiceConfig, ToolRegistry, AggregatedTool, MCPToolDefinition, MCPProtocol, JsonRpcRequest, JsonRpcResponse, McpToolsListResult } from "./types";
import { TextDecoder } from "util";

const log = console.error; // Use stderr for logging

// ── Default Service Configuration ───────────────────────────────────
//
// Port defaults reflect the living layout (post-3101/3400 migration).
// Each is overridable via *_URL env vars for the rare case an MCP moves.
// `protocol: "auto"` means try REST first, fall back to JSON-RPC. Only
// override to a fixed protocol when you know an MCP won't tolerate the
// other one and you want a clean error instead of an extra round-trip.

const DEFAULT_SERVICES: MCPServiceConfig[] = [
  {
    name: "conduit-mcp",
    baseUrl: process.env.CONDUIT_MCP_URL || "http://localhost:3100",
    required: true,
    protocol: "auto",
  },
  {
    name: "tackle-mcp",
    baseUrl: process.env.TACKLE_MCP_URL || "http://localhost:3400",
    required: true,
    protocol: "auto",
  },
  {
    // SSE-only transport. Reached via the SSE adapter in this module
    // (long-lived GET /sse + POST /messages). Exposes the canonical
    // nebula JSON-RPC tool surface (~99 tools) — strictly more than the
    // `query_nebula_*` subset already relayed through conduit-mcp.
    name: "nebula-mcp",
    baseUrl: process.env.NEBULA_MCP_URL || "http://localhost:3102",
    required: false,
    protocol: "sse",
  },
  {
    // SSE-only transport. Exposes service_broker_login /
    // service_broker_is_logged_in / service_broker_logout. Auth-related,
    // not pipeline-state — but adding the SSE adapter makes them
    // first-class aggregator-reachable tools instead of `reachable:false`.
    name: "service-broker-mcp",
    baseUrl: process.env.SERVICE_BROKER_MCP_URL || "http://localhost:3112",
    required: false,
    protocol: "sse",
  },
  // The four stdio-only MCPs are surfaced by the generic stdio→SSE
  // bridge (nexus/typescript/mcp-bridge/). The bridge spawns each as a
  // subprocess and exposes its stdio MCP server over SSE on a dedicated
  // port. From the aggregator's perspective, each is just another
  // SSE-protocol MCP at the bridge-assigned port. The MCP_BRIDGE_<NAME>_URL
  // env vars let operators retarget a single bridge-wrapped MCP (e.g.
  // when running a bridge instance on another host) without editing this
  // list. See nexus/typescript/mcp-bridge/README.md for port assignments.
  {
    name: "knowledge-mcp",
    baseUrl: process.env.MCP_BRIDGE_KNOWLEDGE_URL || "http://localhost:3131",
    required: false,
    protocol: "sse",
  },
  {
    name: "vision-mcp",
    baseUrl: process.env.MCP_BRIDGE_VISION_URL || "http://localhost:3132",
    required: false,
    protocol: "sse",
  },
  {
    name: "peb-mcp",
    baseUrl: process.env.MCP_BRIDGE_PEB_URL || "http://localhost:3133",
    required: false,
    protocol: "sse",
  },
  {
    name: "terrain-mcp",
    baseUrl: process.env.MCP_BRIDGE_TERRAIN_URL || "http://localhost:3134",
    required: false,
    protocol: "sse",
  },
  {
    // TTS (text-to-speech) synthesis. Direct HTTP MCP — not stdio, not bridge.
    name: "address-tts-mcp",
    baseUrl: process.env.ADDRESS_TTS_MCP_URL || "http://localhost:3105",
    required: false,
    protocol: "auto",
  },
  {
    // Assembly forums, threads, users, comments, agendas, artifacts.
    // Direct HTTP MCP — not stdio, not bridge.
    name: "assembly-mcp",
    baseUrl: process.env.ASSEMBLY_MCP_URL || "http://localhost:3113",
    required: false,
    protocol: "auto",
  },
  {
    // Semantics domain CRUD tools (semantics.* schema). Plain JSON-RPC —
    // this server rejects the MCP initialize/protocol-header handshake
    // (HTTP 400), so pin `jsonrpc` instead of `auto` (auto would REST-probe
    // first, fail, then fall back — works, but adds a wasted round-trip and
    // a noisy WARN on every discovery).
    name: "semantics-mcp",
    baseUrl: process.env.SEMANTICS_MCP_URL || "http://localhost:3161",
    required: false,
    protocol: "jsonrpc",
  },
  {
    // UI Tools link management (statusbar links). Same plain-JSON-RPC
    // transport as semantics-mcp — pin `jsonrpc` for the same reason.
    name: "ui-tools-mcp",
    baseUrl: process.env.UI_TOOLS_MCP_URL || "http://localhost:3136",
    required: false,
    protocol: "jsonrpc",
  },
  // Not in DEFAULT_SERVICES:
  //   role-memory-srv — not an MCP; it's the PG→Redis sync engine. The
  //                     `memory_*` tools are already exposed by tackle-mcp.
  //   tackle-prompt-bridge — not a tool server (prompts, not tools); the
  //                     `prompts/*` surface is exposed via tackle-mcp.
];

// Per-service lock counter so concurrent discoveries don't collide on JSON-RPC ids.
let _rpcIdCounter = 1;

// ── SSE session types ────────────────────────────────────────────────
//
// A persistent SSE connection to an MCP-over-SSE server, holding the
// long-lived GET /sse reader plus the /messages URL we POST inbound
// JSON-RPC requests to. Replies are awaited via the `pending` map,
// keyed by request id. The pumpSseStream coroutine resolves waiters.

interface SsePending {
  resolve: (v: any) => void;
  reject: (e: any) => void;
}

interface SseSession {
  service: string;
  baseUrl: string;
  /** Absolute URL to POST inbound JSON-RPC envelopes to (e.g. `http://localhost:3102/messages?sessionId=abc`). */
  messagesUrl: string;
  sessionId: string | null;
  controller: AbortController;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
  pending: Map<string, SsePending>;
  lastActivity: number;
  /** Set when the stream has closed / been aborted and the session must be re-negotiated. */
  closing: boolean;
}

// Idle threshold above which a session is presumed stale and re-negotiated
// on the next call. 60s is conservative — node fetch keepalive defaults are
// longer, but proxies in between commonly cut at 60–120s. Empirical tuning
// can lower this; raising it risks a hung read on a dead socket.
const SSE_SESSION_MAX_IDLE_MS = 60_000;

// ── Tool Registry Manager ─────────────────────────────────────────

export class ToolDiscovery {
  private registry: ToolRegistry;
  private services: MCPServiceConfig[];

  constructor(services?: MCPServiceConfig[]) {
    this.services = services || DEFAULT_SERVICES;
    this.registry = {
      tools: {},
      services: {},
      lastDiscovery: 0,
      totalTools: 0,
    };
  }

  /**
   * Discover all tools from all configured services
   */
  async discover(): Promise<ToolRegistry> {
    log(`[ToolDiscovery] Starting discovery of ${this.services.length} services...`);

    const results = await Promise.allSettled(
      this.services.map((service) => this.discoverService(service))
    );

    this.registry.tools = {};
    this.registry.services = {};
    this.registry.lastDiscovery = Date.now();

    let toolCount = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const service = this.services[i];

      if (result.status === "fulfilled") {
        const tools = result.value.tools;
        const protocol = result.value.protocol;
        const serviceKey = service.name;

        this.registry.services[serviceKey] = {
          reachable: true,
          lastUpdated: Date.now(),
          toolCount: tools.length,
        };

        for (const tool of tools) {
          this.registry.tools[tool.name] = {
            ...tool,
            service: service.name,
            serviceUrl: service.baseUrl,
            protocol,
          };
          toolCount++;
        }

        log(`[ToolDiscovery] ${service.name} (${protocol}): ${tools.length} tools discovered`);
      } else {
        const serviceKey = service.name;
        this.registry.services[serviceKey] = {
          reachable: false,
          lastUpdated: Date.now(),
          toolCount: 0,
        };

        const isRequired = service.required || false;
        const level = isRequired ? "ERROR" : "WARN";
        log(
          `[ToolDiscovery] ${level}: ${service.name} unreachable at ${service.baseUrl}: ${(result.reason as Error)?.message ?? result.reason}`
        );
      }
    }

    this.registry.totalTools = toolCount;
    log(`[ToolDiscovery] Discovery complete: ${toolCount} tools from ${this.services.length} services`);

    return this.registry;
  }

  /**
   * Discover tools from a single service.
   *
   * Picks the protocol based on per-service config:
   *   - `rest`:    GET /tools REST shape
   *   - `jsonrpc`: POST / with JSON-RPC tools/list
   *   - `sse`:     MCP-over-SSE transport (GET /sse + POST /messages)
   *   - `auto`:    try REST first, fall back to JSON-RPC (sse never auto)
   */
  private async discoverService(service: MCPServiceConfig): Promise<{ tools: MCPToolDefinition[]; protocol: Extract<MCPProtocol, "rest" | "jsonrpc" | "sse"> }> {
    const proto = service.protocol || "auto";

    if (proto === "rest") {
      const tools = await this.discoverRest(service);
      return { tools, protocol: "rest" };
    }
    if (proto === "jsonrpc") {
      const tools = await this.discoverJsonRpc(service);
      return { tools, protocol: "jsonrpc" };
    }
    if (proto === "sse") {
      const tools = await this.discoverSSE(service);
      return { tools, protocol: "sse" };
    }

    // auto: REST first, JSON-RPC fallback
    try {
      const tools = await this.discoverRest(service);
      if (tools.length > 0) return { tools, protocol: "rest" };
      // REST returned 0 tools — fall through to JSON-RPC, since some
      // MCPs might respond 200 with an empty tool list when the real
      // transport is JSON-RPC only.
    } catch (_restErr) {
      // REST probe failed entirely — fall through to JSON-RPC.
    }
    const tools = await this.discoverJsonRpc(service);
    return { tools, protocol: "jsonrpc" };
  }

  /**
   * REST discovery — GET /tools returns { tools: MCPToolDefinition[] }.
   */
  private async discoverRest(service: MCPServiceConfig): Promise<MCPToolDefinition[]> {
    const toolsEndpoint = service.toolsEndpoint || "/tools";
    const url = `${service.baseUrl}${toolsEndpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { tools?: MCPToolDefinition[] };
      return data.tools || [];
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * JSON-RPC discovery — POST / with
   *   { "jsonrpc":"2.0","id":<n>,"method":"tools/list","params":{} }
   *
   * The reply shape is
   *   { "jsonrpc":"2.0","id":<n>,"result":{"tools":[ MCPToolDefinition[] ]} }
   *
   * Used by tackle-mcp, knowledge-mcp (when brought up), and conduit-mcp
   * (which also speaks REST — but JSON-RPC is the canonical MCP transport).
   */
  private async discoverJsonRpc(service: MCPServiceConfig): Promise<MCPToolDefinition[]> {
    const url = `${service.baseUrl}/`;
    const id = _rpcIdCounter++;
    const envelope: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method: "tools/list",
      params: {},
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as JsonRpcResponse<McpToolsListResult>;

      // MCP JSON-RPC errors come back as { error: { code, message } }
      if (data.error) {
        throw new Error(`JSON-RPC error ${data.error.code}: ${data.error.message}`);
      }

      const tools = data.result?.tools || [];
      return tools;
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // ── SSE transport adapter ───────────────────────────────────────────
  //
  // MCP-over-SSE differs from the REST/JSON-RPC branches in one structural
  // way: the SSE transport is stateful. A session is opened by a long-lived
  // `GET /sse` stream that emits an `endpoint:` event telling the client
  // where to POST inbound JSON-RPC requests (`/messages?sessionId=<id>`).
  // The reply to every POST then arrives asynchronously on that same open
  // GET stream — there is no synchronous HTTP response to read.
  //
  // That means we hold the stream alive for the lifetime of the aggregator
  // process and multiplex JSON-RPC requests through it. We key one
  // SseSession per service name in `sseSessions` and use a monotonic id
  // counter to correlate streamed replies back to the in-flight requests.
  //
  // Liveness: node SSE streams can silently half-close when the remote MCP
  // times the session out (the default for the official SDK is a long
  // idle, but proxies and OS TCP keepalive vary). We track `lastActivity`
  // per session and treat any session idle > SSE_SESSION_MAX_IDLE_MS as
  // suspect. On a tool-call failure, the caller (callRemoteToolSSE in
  // index.ts) re-initializes the session and retries once before surfacing
  // the error — that recovery is enforced at the call site, not here.

  private sseSessions: Map<string, SseSession> = new Map();

  /**
   * Open or reuse the SSE session for `service`. If a live session exists
   * and is still presumed fresh, return it; otherwise negotiate a new one.
   */
  private async getSseSession(service: MCPServiceConfig): Promise<SseSession> {
    const existing = this.sseSessions.get(service.name);
    const now = Date.now();
    if (existing && !existing.closing && now - existing.lastActivity < SSE_SESSION_MAX_IDLE_MS) {
      return existing;
    }
    // Tear down any stale handle before negotiating a new one.
    if (existing) existing.controller.abort();
    return this.openSseSession(service);
  }

  /**
   * Negiotiate a fresh SSE session:
   *   GET <baseUrl>/sse  → until `event: endpoint` with the messages URL
   * Then keep the stream alive in a background pump that routes `message`
   * events to the waiting request.
   */
  private async openSseSession(service: MCPServiceConfig): Promise<SseSession> {
    const sseUrl = `${service.baseUrl}/sse`;
    const controller = new AbortController();
    const response = await fetch(sseUrl, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`SSE handshake ${service.name} HTTP ${response.status} ${response.statusText}`);
    }

    const session: SseSession = {
      service: service.name,
      baseUrl: service.baseUrl,
      messagesUrl: "", // filled when the endpoint event arrives
      sessionId: null,
      controller,
      reader: response.body.getReader(),
      decoder: new TextDecoder(),
      buffer: "",
      pending: new Map(),
      lastActivity: Date.now(),
      closing: false,
    };

    // Read the initial events off the stream until we observe the
    // `endpoint:` event — that tells us where to POST messages. After that
    // we keep the pump running in the background so future replies arrive.
    await new Promise<void>((resolve, reject) => {
      const negotiate = async () => {
        try {
          while (!session.messagesUrl) {
            const { value, done } = await session.reader.read();
            if (done) throw new Error(`SSE stream closed before endpoint for ${service.name}`);
            session.buffer += session.decoder.decode(value, { stream: true });
            const events = this.consumeSseEvents(session);
            for (const ev of events) {
              if (ev.event === "endpoint" && ev.data) {
                const url = ev.data.trim();
                // The endpoint may be either absolute or relative; make absolute.
                session.messagesUrl = url.startsWith("http")
                  ? url
                  : `${service.baseUrl}${url}`;
                const m = session.messagesUrl.match(/[?&]sessionId=([^&]+)/);
                session.sessionId = m ? m[1] : null;
                break;
              }
            }
          }
          // Spawn the background reader to drain subsequent `message` events.
          this.pumpSseStream(session).catch((e) => {
            log(`[ToolDiscovery] SSE pump for ${service.name} ended: ${e?.message ?? e}`);
          });
          resolve();
        } catch (err) {
          controller.abort();
          reject(err);
        }
      };
      negotiate();
    });

    this.sseSessions.set(service.name, session);
    log(`[ToolDiscovery] SSE session opened: ${service.name} (session=${session.sessionId})`);
    return session;
  }

  /**
   * Background pump that reads SSE frames off the live stream and routes
   * them to the in-flight JSON-RPC request by `id`. Runs until the stream
   * closes, errors out, or the session's AbortController fires (during
   * teardown / re-handshake).
   */
  private async pumpSseStream(session: SseSession): Promise<void> {
    while (true) {
      const { value, done } = await session.reader.read();
      if (done) break;
      session.buffer += session.decoder.decode(value, { stream: true });
      const events = this.consumeSseEvents(session);
      for (const ev of events) {
        session.lastActivity = Date.now();
        if (ev.event !== "message" || !ev.data) continue;
        let payload: any;
        try {
          payload = JSON.parse(ev.data);
        } catch {
          // Ignore malformed fragments — the server may chunk a single
          // JSON envelope across multiple `data:` frames per spec; we only
          // get one consolidated frame in practice here.
          continue;
        }
        const id = payload?.id;
        if (id === undefined || id === null) continue;
        const waiter = session.pending.get(String(id));
        if (waiter) {
          session.pending.delete(String(id));
          waiter.resolve(payload);
        }
      }
    }
    // Stream ended naturally — mark closing so getSseSession re-negotiates.
    session.closing = true;
  }

  /**
   * Parse buffered SSE bytes into discrete events. Returns the parsed
   * events and consumes their bytes from `session.buffer` so the next read
   * accumulates only the un-decoded tail.
   *
   * SSE framing per spec: events are separated by a blank line (`\n\n`).
   * Each event has zero or more `event: <name>` and `data: <text>` lines.
   * Multiple `data:` lines within one event are joined with `\n`.
   */
  private consumeSseEvents(session: SseSession): { event: string; data: string }[] {
    const out: { event: string; data: string }[] = [];
    // Split on blank lines (resilient to \n or \r\n).
    while (true) {
      const sep = session.buffer.search(/\r?\n\r?\n/);
      if (sep === -1) break;
      const block = session.buffer.slice(0, sep);
      session.buffer = session.buffer.slice(sep).replace(/^\s*\r?\n\r?\n/, "");
      let event = "message";
      const dataLines: string[] = [];
      for (const rawLine of block.split(/\r?\n/)) {
        if (rawLine.startsWith("event:")) event = rawLine.slice(6).trim();
        else if (rawLine.startsWith("data:")) dataLines.push(rawLine.slice(5).replace(/^\s/, ""));
      }
      out.push({ event, data: dataLines.join("\n") });
    }
    return out;
  }

  /**
   * Send a single JSON-RPC envelope over an SSE session and wait for the
   * matching reply on the stream. Throws if no reply arrives within the
   * timeout — surfaced to the caller, which is expected to mark the
   * session stale and retry once.
   */
  private async sseRpc(
    session: SseSession,
    method: string,
    params: Record<string, any>,
    timeoutMs = 10000
  ): Promise<any> {
    const id = _rpcIdCounter++;
    const envelope: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    // Build the waiter FIRST so its timer is always paired with a consumer
    // (this Promise's eventual handlers) — we never want a pending reject
    // with no listener, which would surface as an unhandled rejection.
    let timer: any;
    const waiter = new Promise<any>((resolve, reject) => {
      timer = setTimeout(() => {
        session.pending.delete(String(id));
        reject(new Error(`SSE RPC timeout (${timeoutMs}ms) for method=${method} on ${session.service}`));
      }, timeoutMs);
      session.pending.set(String(id), {
        resolve: (v: any) => { clearTimeout(timer); resolve(v); },
        reject: (e: any) => { clearTimeout(timer); reject(e); },
      });
    });
    // Ensure the timer is always cancelled once the waiter is observed, so
    // we never leak a timeout callback after the waiter settled via either
    // path (POST failure or stream message).
    waiter.finally(() => clearTimeout(timer));

    const ctrl = new AbortController();
    const t2 = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(session.messagesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        // POST returned non-2xx — the message will never arrive on the
        // stream. Withdraw the waiter from the pending map and surface the
        // POST failure. The catch below resets the waiter's timer; we do
        // NOT call its reject here — we let the throw propagate through
        // the catch, which clears the timer and deletes the pending entry,
        // ensuring the waiter promise is unreachable (and therefore GC'd
        // cleanly) instead of dangling as a pending-with-no-listener.
        throw new Error(`SSE POST ${session.service} HTTP ${r.status} ${r.statusText}`);
      }
    } catch (e: any) {
      // POST failed for any reason (network, abort, non-2xx above). Reset
      // the waiter's timer before rethrowing so a late timeout never fires.
      clearTimeout(timer);
      session.pending.delete(String(id));
      throw e;
    } finally {
      clearTimeout(t2);
    }

    return waiter;
  }

  /**
   * SSE discovery. Re-uses the persistent SSE session if one is alive,
   * otherwise opens one, then sends a JSON-RPC `tools/list` and waits for
   * the reply on the stream.
   */
  private async discoverSSE(service: MCPServiceConfig): Promise<MCPToolDefinition[]> {
    const session = await this.getSseSession(service);
    const resp = await this.sseRpc(session, "tools/list", {}, 15_000);
    if (resp?.error) {
      throw new Error(`SSE JSON-RPC error ${resp.error.code}: ${resp.error.message}`);
    }
    const tools = resp?.result?.tools || [];
    return tools;
  }

  /**
   * SSE tool call. Public so `index.ts` (callRemoteTool) routes through
   * here for `protocol === "sse"` tools — it can mark a failed session
   * stale and retry once on re-handshake.
   */
  async sseCallTool(
    service: MCPServiceConfig,
    toolName: string,
    toolArgs: Record<string, any>
  ): Promise<any> {
    let lastErr: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      let session: SseSession;
      try {
        session = await this.getSseSession(service);
      } catch (e) {
        lastErr = e;
        // Couldn't (re)negotiate a session — retry once; surface on second.
        continue;
      }
      try {
        const resp = await this.sseRpc(session, "tools/call", { name: toolName, arguments: toolArgs }, 30_000);
        if (resp?.error) throw new Error(`SSE JSON-RPC error ${resp.error.code}: ${resp.error.message}`);
        // Unwrap the McpToolCallResult content shape the same way the
        // JSON-RPC branch does (single text block → parsed JSON or string;
        // multiple blocks → array).
        const result = resp?.result;
        if (!result) return null;
        if (result.isError) {
          const text = result.content?.find((c: any) => c.type === "text")?.text ?? "Tool call returned an error";
          throw new Error(text);
        }
        const blocks = result.content || [];
        if (blocks.length === 1 && blocks[0].type === "text") {
          const text: string = blocks[0].text ?? "";
          try { return JSON.parse(text); } catch { return text; }
        }
        return blocks;
      } catch (e: any) {
        lastErr = e;
        // Mark current session stale so the next attempt re-handshakes.
        const s = this.sseSessions.get(service.name);
        if (s) { s.closing = true; s.controller.abort(); this.sseSessions.delete(service.name); }
        // try once more
        continue;
      }
    }
    throw lastErr ?? new Error(`SSE tool call to ${service.name} failed`);
  }

  /**
   * Get the current tool registry
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): AggregatedTool | undefined {
    return this.registry.tools[name] as AggregatedTool | undefined;
  }

  /**
   * List all available tools
   */
  listTools(): AggregatedTool[] {
    return Object.values(this.registry.tools) as AggregatedTool[];
  }

  /**
   * Get tools grouped by service
   */
  groupByService(): Record<string, AggregatedTool[]> {
    const grouped: Record<string, AggregatedTool[]> = {};

    for (const tool of this.listTools()) {
      if (!grouped[tool.service]) {
        grouped[tool.service] = [];
      }
      grouped[tool.service].push(tool);
    }

    return grouped;
  }

  /**
   * Get service status
   */
  getServiceStatus(): Record<string, { reachable: boolean; toolCount: number }> {
    const status: Record<string, { reachable: boolean; toolCount: number }> = {};

    for (const [service, info] of Object.entries(this.registry.services)) {
      status[service] = {
        reachable: info.reachable,
        toolCount: info.toolCount,
      };
    }

    return status;
  }
}