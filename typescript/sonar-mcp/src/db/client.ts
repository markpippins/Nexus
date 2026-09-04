// sonar-mcp — SonarQube web-API client. Thin HTTP layer only; all tools
// go through these helpers so auth and error handling stay in one place.
//
// Env:
//   SONAR_BASE_URL  SonarQube base (default http://vanadium:9000)
//   SONAR_TOKEN     user token; sent as HTTP Basic "<token>:" (same
//                   scheme as ballerina sonar-sync / ci-gateway)

const BASE_URL = process.env.SONAR_BASE_URL ?? "http://vanadium:9000";
const TOKEN = process.env.SONAR_TOKEN ?? "";

export class SonarError extends Error {
  constructor(
    public status: number,
    public endpoint: string,
    public detail: string,
  ) {
    super(`SonarQube ${status} on ${endpoint}: ${detail}`);
    this.name = "SonarError";
  }
}

function authHeader(): string {
  if (!TOKEN) {
    throw new SonarError(
      0,
      "(client init)",
      "SONAR_TOKEN not set — create a SonarQube user token and export it",
    );
  }
  return "Basic " + Buffer.from(`${TOKEN}:`).toString("base64");
}

async function request(
  method: "GET" | "POST",
  endpoint: string,
  params?: Record<string, string | number | undefined>,
  form?: Record<string, string>,
): Promise<any> {
  const url = new URL(endpoint, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const init: RequestInit = {
    method,
    headers: { Authorization: authHeader() },
  };
  if (form) {
    init.headers = {
      ...init.headers,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    init.body = new URLSearchParams(form).toString();
  }
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new SonarError(res.status, endpoint, text.slice(0, 300));
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function sonarGet(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
): Promise<any> {
  return request("GET", endpoint, params);
}

export function sonarPostForm(
  endpoint: string,
  form: Record<string, string>,
): Promise<any> {
  return request("POST", endpoint, undefined, form);
}
