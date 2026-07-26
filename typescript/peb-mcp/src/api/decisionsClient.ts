/**
 * Client for peb-srv REST API (port 3111).
 * Separate from PebApiClient which talks to the Spring Boot PEB kernel (port 8080).
 */
const PEB_SRV_URL = process.env.PEB_SRV_URL || 'http://localhost:3111/api/peb';

async function get(path: string): Promise<any> {
  const res = await fetch(`${PEB_SRV_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`peb-srv GET ${path} → ${res.status}`);
  return res.json();
}

async function post(path: string, body: any): Promise<any> {
  const res = await fetch(`${PEB_SRV_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`peb-srv POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function patch(path: string, body: any): Promise<any> {
  const res = await fetch(`${PEB_SRV_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`peb-srv PATCH ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Decision operations ─────────────────────────────────────────────

export async function listDecisions(opts: {
  status?: string;
  author_id?: string;
  adr_number?: string;
  affected_key?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<any> {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.author_id) params.set('author_id', opts.author_id);
  if (opts.adr_number) params.set('adr_number', opts.adr_number);
  if (opts.affected_key) params.set('affected_key', opts.affected_key);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return get(`/decisions${qs ? '?' + qs : ''}`);
}

export async function getDecision(id: string): Promise<any> {
  return get(`/decisions/${id}`);
}

export async function getNextAdrNumber(): Promise<any> {
  return get('/decisions/next-number');
}

export async function createDecision(opts: {
  title: string;
  author_id: string;
  summary?: any;
  affected_keys?: string[];
  entropy_class?: string;
  parent_decision_id?: string;
  rollback_of?: string;
  adr_number?: string;
  status?: string;
}): Promise<any> {
  return post('/decisions', opts);
}

export async function updateDecision(id: string, opts: {
  title?: string;
  status?: string;
  summary?: any;
  affected_keys?: string[];
  entropy_class?: string;
}): Promise<any> {
  return patch(`/decisions/${id}`, opts);
}

export async function supersedeDecision(id: string, opts: {
  summary: any;
  author_id: string;
  title?: string;
  affected_keys?: string[];
}): Promise<any> {
  return post(`/decisions/${id}/supersede`, opts);
}

export async function getDecisionChain(id: string, direction = 'ancestry'): Promise<any> {
  return get(`/decisions/${id}/chain?direction=${direction}`);
}
