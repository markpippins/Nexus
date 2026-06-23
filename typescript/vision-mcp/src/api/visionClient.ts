/**
 * HTTP client for vision-srv REST API.
 * All vision-mcp tools proxy through this client to vision-srv (port 3103).
 */
import * as http from "http";

const VISION_SRV_URL = "http://localhost:3103";

const BASE_URL = new URL(VISION_SRV_URL);

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
      reject(new Error(`Cannot reach vision-srv: ${err.message}`));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export const VisionClient = {
  /** GET /health */
  health: () => httpRequest("GET", "/health"),

  // ── Work Requests ──────────────────────────────────────────
  /** GET /api/work-requests */
  listWorkRequests: () => httpRequest("GET", "/api/work-requests"),
  /** GET /api/work-requests/:id */
  getWorkRequest: (id: string) => httpRequest("GET", `/api/work-requests/${id}`),
  /** POST /api/work-requests */
  createWorkRequest: (body: {
    wrId?: string; intent: string; constraints?: any; priority?: number;
    context?: any; status?: string;
  }) => httpRequest("POST", "/api/work-requests", body),
  /** PATCH /api/work-requests/:id */
  updateWorkRequest: (id: string, body: {
    intent?: string; constraints?: any; priority?: number;
    context?: any; status?: string;
  }) => httpRequest("PATCH", `/api/work-requests/${id}`, body),
  /** DELETE /api/work-requests/:id */
  deleteWorkRequest: (id: string) => httpRequest("DELETE", `/api/work-requests/${id}`),

  // ── Branches ───────────────────────────────────────────────
  /** GET /api/branches */
  listBranches: () => httpRequest("GET", "/api/branches"),
  /** POST /api/branches */
  createBranch: (body: {
    branchId: string; wrId: string; parentBranchId?: string;
    forkPoint?: string; label?: string; status?: string;
  }) => httpRequest("POST", "/api/branches", body),

  // ── Artifacts ──────────────────────────────────────────────
  /** GET /api/artifacts */
  listArtifacts: () => httpRequest("GET", "/api/artifacts"),
  /** POST /api/artifacts */
  createArtifact: (body: {
    artifactId?: string; type: string; content: any; confidence?: number;
    provenance?: any; wrId?: string; parentArtifactId?: string; templateMetadata?: any;
  }) => httpRequest("POST", "/api/artifacts", body),
};
