/**
 * HTTP client for nebula-srv REST API.
 * All nebula-mcp tools proxy through this client to nebula-srv (port 3101).
 */
import * as http from "http";

const NEBULA_SRV_URL = "http://localhost:3101";

function httpGet(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(`${NEBULA_SRV_URL}${path}`, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse nebula-srv response: ${data.slice(0, 200)}`));
        }
      });
    }).on("error", (err: Error) => {
      reject(new Error(`Cannot reach nebula-srv at ${NEBULA_SRV_URL}: ${err.message}`));
    });
  });
}

const BASE_URL = new URL(NEBULA_SRV_URL);

function httpRequest(method: string, path: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {};
    if (bodyStr) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(bodyStr).toString();
    }
    const options: http.RequestOptions = {
      hostname: BASE_URL.hostname,
      port: BASE_URL.port,
      path,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", (err: Error) => {
      reject(new Error(`Cannot reach nebula-srv: ${err.message}`));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export const NebulaClient = {
  /** GET /health */
  health: () => httpGet("/health"),

  // ── Systems ────────────────────────────────────────────────
  /** GET /api/systems */
  listSystems: () => httpGet("/api/systems"),
  /** POST /api/systems */
  createSystem: (body: { name: string; description?: string; readme?: string | null; architecture?: string | null }) =>
    httpRequest("POST", "/api/systems", body),
  /** PATCH /api/systems/:id */
  updateSystem: (id: string, body: { name?: string; description?: string; readme?: string | null; architecture?: string | null }) =>
    httpRequest("PATCH", `/api/systems/${id}`, body),
  /** DELETE /api/systems/:id */
  deleteSystem: (id: string) => httpRequest("DELETE", `/api/systems/${id}`),

  // ── Subsystems ─────────────────────────────────────────────
  /** POST /api/subsystems */
  createSubsystem: (body: { systemId: string; name: string; description?: string; readme?: string | null }) =>
    httpRequest("POST", "/api/subsystems", body),
  /** PATCH /api/subsystems/:id */
  updateSubsystem: (id: string, body: { name?: string; description?: string; readme?: string | null; color?: string }) =>
    httpRequest("PATCH", `/api/subsystems/${id}`, body),
  /** DELETE /api/subsystems/:id */
  deleteSubsystem: (id: string) => httpRequest("DELETE", `/api/subsystems/${id}`),
  /** POST /api/subsystems/move */
  moveSubsystem: (body: { subsystemId: string; targetSystemId: string }) =>
    httpRequest("POST", "/api/subsystems/move", body),

  // ── Features ───────────────────────────────────────────────
  /** POST /api/features */
  createFeature: (body: { subsystemId: string; name: string; description?: string; readme?: string | null }) =>
    httpRequest("POST", "/api/features", body),
  /** PATCH /api/features/:id */
  updateFeature: (id: string, body: { name?: string; description?: string; readme?: string | null }) =>
    httpRequest("PATCH", `/api/features/${id}`, body),
  /** DELETE /api/features/:id */
  deleteFeature: (id: string) => httpRequest("DELETE", `/api/features/${id}`),
  /** POST /api/features/move */
  moveFeature: (body: { featureId: string; targetSystemId: string; targetSubsystemId: string }) =>
    httpRequest("POST", "/api/features/move", body),

  // ── Requirements ───────────────────────────────────────────
  /** GET /api/requirements?systemId=&subsystemId=&featureId= */
  listRequirements: (query?: { systemId?: string; subsystemId?: string; featureId?: string }) => {
    const params = new URLSearchParams();
    if (query?.systemId) params.set("systemId", query.systemId);
    if (query?.subsystemId) params.set("subsystemId", query.subsystemId);
    if (query?.featureId) params.set("featureId", query.featureId);
    const qs = params.toString();
    return httpGet(`/api/requirements${qs ? `?${qs}` : ""}`);
  },
  /** POST /api/requirements */
  createRequirement: (body: {
    systemId: string; subsystemId: string; featureId?: string | null;
    title: string; description?: string; status?: string; priority?: string;
    startDate?: string | null; completionDate?: string | null;
  }) => httpRequest("POST", "/api/requirements", body),
  /** PATCH /api/requirements/:id */
  updateRequirement: (id: string, body: {
    title?: string; description?: string; status?: string; priority?: string;
    startDate?: string | null; completionDate?: string | null;
    systemId?: string; subsystemId?: string; featureId?: string | null;
  }) => httpRequest("PATCH", `/api/requirements/${id}`, body),
  /** DELETE /api/requirements/:id */
  deleteRequirement: (id: string) => httpRequest("DELETE", `/api/requirements/${id}`),
  /** PATCH /api/requirements/batch */
  batchUpdateRequirements: (body: { ids: string[]; status: string }) =>
    httpRequest("PATCH", "/api/requirements/batch", body),

  // ── Kanban Move (Plan 0131) ────────────────────────────────────
  /** POST /api/requirements/:id/move — single-id kanban move with optimistic-concurrency option */
  moveRequirement: (id: string, body: { targetStatus: string; expectedCurrentStatus?: string }) =>
    httpRequest("POST", `/api/requirements/${id}/move`, body),

  // ── System Folders ─────────────────────────────────────────
  /** POST /api/systems/:id/folders */
  createFolder: (systemId: string, body: { name: string; category: string; note?: string }) =>
    httpRequest("POST", `/api/systems/${systemId}/folders`, body),
  /** DELETE /api/systems/:systemId/folders/:folderId */
  deleteFolder: (systemId: string, folderId: string) =>
    httpRequest("DELETE", `/api/systems/${systemId}/folders/${folderId}`),

  // ── Work Sessions ──────────────────────────────────────────
  /** GET /api/sessions */
  listSessions: () => httpGet("/api/sessions"),
  /** POST /api/sessions */
  createSession: (body: {
    parentId: string; parentType: string; parentName?: string;
    context?: string; platform?: string; model?: string;
    outcome?: string | null; status?: string;
  }) => httpRequest("POST", "/api/sessions", body),
  /** PATCH /api/sessions/:id */
  updateSession: (id: string, body: { outcome?: string | null; status?: string }) =>
    httpRequest("PATCH", `/api/sessions/${id}`, body),
  /** DELETE /api/sessions/:id */
  deleteSession: (id: string) => httpRequest("DELETE", `/api/sessions/${id}`),

  // ── Workspaces ─────────────────────────────────────────────
  /** GET /api/workspaces */
  listWorkspaces: () => httpGet("/api/workspaces"),
  /** POST /api/workspaces */
  createWorkspace: (body: { systemId: string; subsystemId?: string | null; workspacePath: string }) =>
    httpRequest("POST", "/api/workspaces", body),
  /** DELETE /api/workspaces/:id */
  deleteWorkspace: (id: string) => httpRequest("DELETE", `/api/workspaces/${id}`),

  // ── Docs ───────────────────────────────────────────────────
  /** GET /api/docs?workspacePath=... */
  readDocs: (workspacePath: string) => httpGet(`/api/docs?workspacePath=${encodeURIComponent(workspacePath)}`),
  /** GET /api/systems/:id/docs */
  readSystemDocs: (systemId: string) => httpGet(`/api/systems/${systemId}/docs`),
  /** GET /api/subsystems/:id/docs */
  readSubsystemDocs: (subsystemId: string) => httpGet(`/api/subsystems/${subsystemId}/docs`),

  // ── Plans (Plan 0134) ────────────────────────────────────────
  /** GET /api/plans?status=pending|planning|proposed|completed|all */
  listPlans: (query?: { status?: 'pending' | 'planning' | 'proposed' | 'completed' | 'all' }) => {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    const qs = params.toString();
    return httpGet(`/api/plans${qs ? `?${qs}` : ''}`);
  },
  /** GET /api/plans/:id (collision-resilient: first match in pending→planning→proposed→completed) */
  getPlan: (id: string) => httpGet(`/api/plans/${encodeURIComponent(id)}`),

  // ── Preferences ────────────────────────────────────────────
  /** GET /api/preferences */
  getPreferences: () => httpGet("/api/preferences"),
  /** PUT /api/preferences/:key */
  setPreference: (key: string, value: any) => httpRequest("PUT", `/api/preferences/${key}`, { value }),
  /** DELETE /api/preferences/:key */
  deletePreference: (key: string) => httpRequest("DELETE", `/api/preferences/${key}`),

  // ── System Info Tabs ───────────────────────────────────────
  /** GET /api/systems/:id/info */
  getSystemInfo: (systemId: string) => httpGet(`/api/systems/${systemId}/info`),
  /** PUT /api/systems/:id/info/:tabId */
  setSystemInfo: (systemId: string, tabId: string, content: string) =>
    httpRequest("PUT", `/api/systems/${systemId}/info/${tabId}`, { content }),

  // ── Complex Operations ─────────────────────────────────────
  /** POST /api/systems/demote/:id */
  demoteSystem: (sourceSystemId: string, targetSystemId: string) =>
    httpRequest("POST", `/api/systems/demote/${sourceSystemId}`, { targetSystemId }),

  // ── Import / Seed ──────────────────────────────────────────
  /** POST /api/import */
  importData: (body: {
    systems?: any[]; requirements?: any[]; workSessions?: any[];
    preferences?: Record<string, any>; infoTabs?: Record<string, Record<string, string>>;
  }) => httpRequest("POST", "/api/import", body),
  /** POST /api/seed */
  seedData: () => httpRequest("POST", "/api/seed"),
};
