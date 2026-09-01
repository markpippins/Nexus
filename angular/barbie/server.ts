import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3010', 10);

// ── Proxy to real Nexus backend ──────────────────────────────────
// Barbie is live-only. BACKEND_URL must point at the real service-registry
// backend; /api/* requests are forwarded to it and backend failures surface
// as errors (502) rather than being silently replaced by embedded mock data.
// There is no mock fallback: if BACKEND_URL is unset the server refuses to
// start, because serving fabricated data would violate the live-only contract.
const BACKEND_URL = process.env.BACKEND_URL || '';
if (!BACKEND_URL) {
  console.error('[barbie] FATAL: BACKEND_URL is required. Barbie is live-only — there is no embedded mock data. Set BACKEND_URL to the real service-registry backend (e.g. http://localhost:8085).');
  process.exit(1);
}

// ── Read-only federation across registries ──────────────────────
// FEDERATED_BACKEND_URLS is a comma-separated list of additional
// service-registry instances to merge into READ responses, e.g.:
//   FEDERATED_BACKEND_URLS=vd@http://192.168.1.209:8085
// (optional "label@" prefix; defaults to the URL hostname).
//
// Semantics:
//  - GETs on entity lists + aggregate are merged: primary first,
//    then each federated source. Remote rows get `_source` tags and
//    namespaced ids (`<label>-<id>`) so they never collide.
//  - All writes go to the PRIMARY backend (BACKEND_URL) only.
//  - A federated source being down degrades honestly: it is skipped
//    and reported in `meta.federation`, never faked.

const FEDERATED = (process.env.FEDERATED_BACKEND_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) => {
    const m = entry.match(/^(?:([^@]+)@)?(https?:\/\/.+)$/);
    if (!m) return null;
    let label = m[1] || "";
    if (!label) {
      try { label = new URL(m[2]).hostname; } catch { return null; }
    }
    return { url: m[2].replace(/\/$/, ""), label };
  })
  .filter((x): x is { url: string; label: string } => x !== null);

const MERGEABLE_PATH =
  /^\/api\/v1\/(services|servers|systems|frameworks|libraries|deployments)$/;
const MERGEABLE_EXTRA = [
  "/api/v1/registry/aggregate",
  "/api/v1/registry/services/with-hosted",
];

function fetchWithTimeout(url: string, ms = 12000, method?: string, headers?: Record<string, string>, body?: Buffer): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, {
    method: method ?? "GET",
    headers: headers ?? { "Content-Type": "application/json" },
    body,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

// CI gateway passthrough (to-do d9ac7608 follow-on; proposal 13890307):
// browser -> :3010 /gateway/* -> loopback ballerina ci-gateway :9095.
// Read-only; upstream binds loopback so this is the only exposure.
app.use("/gateway", async (req, res) => {
  try {
    // Accept header omitted — fetchWithTimeout pins JSON content-type;
    // gateway always answers JSON anyway.
    const r = await fetchWithTimeout(`http://127.0.0.1:9095${req.originalUrl}`, 10000);
    const text = await r.text();
    res.status(r.status).set("Content-Type", r.headers.get("content-type") ?? "application/json");
    res.send(text);
  } catch (err: any) {
    res.status(502).json({ error: "ci-gateway unreachable", detail: String(err?.message || err) });
  }
});

// sonar-sync passthrough — reads the canonical `sonar` schema (issues /
// hotspots mirrored from SonarQube by the ballerina sonar-sync service)
// and forwards review writebacks (POST /hotspotReview, /issueReview).
// browser -> :3010 /sonar-sync/* -> loopback sonar-sync :9096.
const SONAR_SYNC_URL = process.env.SONAR_SYNC_URL || "http://127.0.0.1:9096";
app.use("/sonar-sync", async (req, res) => {
  try {
    const headers: Record<string, string> = {};
    if (req.method !== "GET") {
      headers["Content-Type"] = req.headers["content-type"]?.toString() ?? "application/json";
    }
    let body: Buffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk as any));
      body = Buffer.concat(chunks);
    }
    const r = await fetchWithTimeout(`${SONAR_SYNC_URL}${req.originalUrl}`, 15000, req.method, headers, body);
    const text = await r.text();
    res.status(r.status).set("Content-Type", r.headers.get("content-type") ?? "application/json");
    res.send(text);
  } catch (err: any) {
    res.status(502).json({ error: "sonar-sync unreachable", detail: String(err?.message || err) });
  }
});

if (FEDERATED.length > 0) {
  console.log(`[barbie] Federation enabled: ${FEDERATED.map((f) => `${f.label}@${f.url}`).join(", ")} (read-only)`);

  app.use("/api", async (req, res, next) => {
    const pathOnly = req.originalUrl.split("?")[0];
    const isAggregate = MERGEABLE_EXTRA.includes(pathOnly);
    if (req.method !== "GET" || (!MERGEABLE_PATH.test(pathOnly) && !isAggregate)) {
      return next();
    }

    // Pull ALL rows from every source in parallel (sources may cap
    // per_page — e.g. vanadium caps at 20 — so walk pages until the
    // source's reported total is satisfied).
    async function fetchSource(base: string) {
      try {
        const q = new URLSearchParams(req.query as Record<string, string>);
        q.set("page", "0");
        q.set("per_page", "1000");
        const r = await fetchWithTimeout(`${base}${pathOnly}?${q.toString()}`);
        if (!r.ok) return { ok: false as const, status: r.status };
        return { ok: true as const, body: await r.json() };
      } catch (err: any) {
        return { ok: false as const, status: 0, error: String(err?.message || err) };
      }
    }

    // Multi-page variant for entity-list merges.
    async function fetchAllRows(base: string) {
      try {
        const q = new URLSearchParams(req.query as Record<string, string>);
        let perPageCap = 1000;
        const rows: any[] = [];
        let total = Infinity;
        for (let page = 0; page < 50; page++) {
          q.set("page", String(page));
          q.set("per_page", String(perPageCap));
          const r = await fetchWithTimeout(`${base}${pathOnly}?${q.toString()}`);
          if (!r.ok) return { ok: false as const, status: r.status };
          const body = await r.json();
          const arr: any[] = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
          rows.push(...arr);
          if (!Array.isArray(body)) {
            const meta = body?.meta ?? {};
            if (Number(meta.total) > 0) total = Number(meta.total);
            if (Number(meta.per_page) > 0) perPageCap = Math.min(perPageCap, Number(meta.per_page));
          }
          if (arr.length === 0 || rows.length >= total) break;
        }
        return { ok: true as const, rows };
      } catch (err: any) {
        // A source being unreachable must degrade honestly, not kill the
        // process via unhandled rejection (Express 4 cannot catch these).
        return { ok: false as const, status: 0, error: String(err?.message || err) };
      }
    }

    const results = await Promise.all([
      fetchSource(BACKEND_URL),
      ...FEDERATED.map((f) => fetchSource(f.url)),
    ]);
    const sources = [{ url: BACKEND_URL, label: "primary" }, ...FEDERATED];

    const federationMeta = sources.map((s, i) => ({
      source: s.label,
      url: s.url,
      ok: results[i].ok,
      ...(results[i].ok ? {} : { status: (results[i] as any).status }),
    }));

    if (!results[0].ok) {
      // Primary must be healthy — keep live-authoritative posture.
      return res.status(502).json({ error: "Primary registry backend unreachable", federation: federationMeta });
    }

    if (isAggregate) {
      type Agg = Record<string, any>;
      const aggs: Agg[] = results.filter(r => r.ok).map(r => (r as any).body as Agg);
      const sum = (k: string) => aggs.reduce((n, a) => n + Number(a?.[k] ?? 0), 0);
      const merged: Agg = {
        totalSystems: sum("totalSystems"),
        totalServices: sum("totalServices"),
        totalServers: sum("totalServers"),
        totalDeployments: sum("totalDeployments"),
        healthyCount: sum("healthyCount"),
        degradedCount: sum("degradedCount"),
        criticalCount: sum("criticalCount"),
        offlineCount: sum("offlineCount"),
        avgLatencyMs: aggs.some(a => Number(a?.totalServices ?? 0) > 0)
          ? Math.round(aggs.reduce((n, a) => n + Number(a?.avgLatencyMs ?? 0) * Number(a?.totalServices ?? 0), 0)
              / Math.max(1, sum("totalServices")))
          : 0,
        totalRps: sum("totalRps"),
        activeIncidentsCount: sum("activeIncidentsCount"),
        overallHealthPercent: (() => {
          const total = sum("totalServices") || sum("healthyCount") + sum("degradedCount") + sum("criticalCount") + sum("offlineCount");
          return total > 0 ? Math.round((sum("healthyCount") / total) * 100) : 0;
        })(),
        nodes: aggs.flatMap((a, i) => (Array.isArray(a?.nodes) ? a.nodes : []).map((n: any) => ({ ...n, _source: sources[i].label }))),
        edges: aggs.flatMap((a, i) => (Array.isArray(a?.edges) ? a.edges : []).map((e: any) => ({ ...e, _source: sources[i].label }))),
      };
      return res.json({ ...merged, meta: { federation: federationMeta } });
    }

    // Plain entity list merge with namespaced remote ids.
    const searchQ = String(req.query.search ?? "").toLowerCase();
    const statusQ = String(req.query.status ?? "").toLowerCase();
    const rowResults = await Promise.all([
      fetchAllRows(BACKEND_URL),
      ...FEDERATED.map((f) => fetchAllRows(f.url)),
    ]);
    let items: any[] = [];
    rowResults.forEach((r, i) => {
      if (!r.ok) return;
      const tag = sources[i].label;
      items = items.concat(
        (r as any).rows.map((row: any) =>
          i === 0 ? row : { ...row, id: `${tag}-${row.id}`, _source: tag }
        )
      );
    });

    if (searchQ) items = items.filter((x) => JSON.stringify(x?.name ?? "").toLowerCase().includes(searchQ));
    if (statusQ) items = items.filter((x) => String(x?.status ?? "").toLowerCase() === statusQ);

    const page = Math.max(0, parseInt(String(req.query.page ?? "0"), 10) || 0);
    const perPage = Math.min(1000, Math.max(1, parseInt(String(req.query.per_page ?? "50"), 10) || 50));
    const start = page * perPage;
    return res.json({
      data: items.slice(start, start + perPage),
      meta: {
        page,
        per_page: perPage,
        total: items.length,
        last_page: perPage > 0 ? Math.ceil(items.length / perPage) : 0,
        federation: federationMeta,
      },
    });
  });
}


console.log(`[barbie] Proxy enabled: /api/* → ${BACKEND_URL}`);

  app.use('/api', async (req, res, next) => {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
      return next();
    }

    try {
      const targetUrl = `${BACKEND_URL}${req.originalUrl}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const fetchOpts: RequestInit & { signal?: AbortSignal } = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      };

      if (['POST', 'PUT'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        fetchOpts.body = JSON.stringify(req.body);
      }

      const backendRes = await fetch(targetUrl, fetchOpts);
      clearTimeout(timeout);

      if (backendRes.ok) {
        // Forward the backend status code
        // Handle 204 No Content (common for DELETE) without trying to parse JSON
        if (backendRes.status === 204) {
          return res.sendStatus(204);
        }
        const data = await backendRes.json();
        return res.status(backendRes.status).json(data);
      }

      // Live mode is authoritative: surface backend errors instead of
      // silently falling through to embedded mock data (there is none).
      if (backendRes.status === 404 || backendRes.status === 400) {
        const errText = await backendRes.text().catch(() => "");
        return res.status(backendRes.status).type("application/json").send(errText);
      }
      console.warn(`[barbie] Backend returned ${backendRes.status} for ${req.method} ${req.originalUrl}`);
      return res.status(502).json({ error: `Registry backend returned ${backendRes.status}`, path: req.originalUrl });
    } catch (err: any) {
      console.error(`[barbie] Backend unreachable for ${req.method} ${req.originalUrl}: ${err?.message || err}`);
      return res.status(502).json({ error: "Registry backend unreachable", detail: String(err?.message || err) });
    }
  });

// --- VITE MIDDLEWARE & SERVE INTEGRATION ---

// Server-authoritative client config. When a real backend is proxied,
// the served index.html gets an injected bootstrap script so the UI
// runs live regardless of stale localStorage on the browser side.
function injectConfig(html: string): string {
  if (!BACKEND_URL) return html;
  const cfg = `<script>window.__BARBIE_CONFIG__=${JSON.stringify({
    // Barbie is live-only; terrain base for platform-health re-checks (#16).
    terrainUrl: process.env.TERRAIN_BASE_URL || "http://localhost:8084",
  })};</script>`;
  return html.includes("<head>")
    ? html.replace("<head>", `<head>\n    ${cfg}`)
    : cfg + html;
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Dev-with-backend: inject through vite's transform of index.html.
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      const send = res.send.bind(res);
      res.send = (body: any) => {
        if (typeof body === "string" && body.includes("<div id=\"root\">")) {
          return send(injectConfig(body));
        }
        return send(body);
      };
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Read index.html PER REQUEST, not cached at startup — otherwise every
    // rebuild rotates hashed assets out from under the running process and
    // browsers get a ghost bundle -> blank screen ("not-quite-death",
    // 2026-08-26). injectConfig still applies server-authoritative config.
    app.use(express.static(distPath, { index: false })); // hashed assets only; / handled below with config injection
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
      try {
        const html = injectConfig(require("fs").readFileSync(path.join(distPath, "index.html"), "utf8"));
        return res.type("html").send(html);
      } catch {
        return res.status(503).type("html").send("<h1>barbie: dist/ not built</h1><p>Run <code>npm run build</code>.</p>");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Platform Operations Registry Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
