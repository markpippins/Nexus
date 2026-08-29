import {
  ReadOnlyWitnessedRunAdapter,
  type WitnessedRunProjection,
  type WitnessedRunQuery,
  type WitnessedRunSource,
} from "./witnessedRun.js";

export class WitnessedRunSourceError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "WitnessedRunSourceError";
  }
}

export class FetchWitnessedRunSource implements WitnessedRunSource {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async query(query: WitnessedRunQuery, signal?: AbortSignal): Promise<WitnessedRunProjection | null> {
    if (!/^https?:\/\//.test(this.baseUrl)) {
      throw new WitnessedRunSourceError("Witnessed-run source URL must be absolute HTTP(S)", "INVALID_SOURCE_URL");
    }
    const url = new URL("/api/execution/witnessed-runs", this.baseUrl);
    url.searchParams.set("workflow_instance_id", query.workflowInstanceId);
    url.searchParams.set("node_id", query.nodeId);
    const response = await this.fetcher(url, { method: "GET", headers: { Accept: "application/json" }, signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new WitnessedRunSourceError(`Witnessed-run query failed: HTTP ${response.status}`, "SOURCE_REQUEST_FAILED");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("projection" in body)) {
      throw new WitnessedRunSourceError("Witnessed-run response is invalid", "INVALID_SOURCE_RESPONSE");
    }
    const projection = (body as { projection: unknown }).projection;
    if (!projection || typeof projection !== "object") {
      throw new WitnessedRunSourceError("Witnessed-run projection is invalid", "INVALID_SOURCE_PROJECTION");
    }
    return projection as WitnessedRunProjection;
  }
}

export function createWitnessedRunAdapter(baseUrl: string, fetcher: typeof fetch = fetch): ReadOnlyWitnessedRunAdapter {
  return new ReadOnlyWitnessedRunAdapter(new FetchWitnessedRunSource(baseUrl, fetcher));
}
