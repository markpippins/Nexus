import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const LIVE_MODE = process.env.CONDUIT_LIVE_MODE === 'true';
  const PORT = LIVE_MODE ? 4201 : 3000;
  const MCP_URL = process.env.CONDUIT_MCP_URL || 'http://localhost:3100';
  const SRV_URL = process.env.CONDUIT_SRV_URL || 'http://localhost:3104';

  app.use(express.json());

  // ============================================================
  // Proxy helpers — forward requests to real backends in live mode
  // ============================================================
  const MCP_PREFIXES = ['/state', '/delta', '/replay', '/admin', '/api/sessions', '/api/breaker', '/api/receipts'];
  const SRV_PREFIXES = ['/health', '/workflows', '/tickets', '/tokens', '/config', '/governance', '/vision', '/log'];

  /** Response headers never forwarded from backend to the SPA (hop-by-hop + security). */
  const STRIPPED_RESPONSE_HEADERS = [
    'transfer-encoding',
    'connection',
    'keep-alive',
    'content-security-policy',
    'content-security-policy-report-only',
  ];

  function getBackendForPath(p: string): string | null {
    if (MCP_PREFIXES.some(pref => p === pref || p.startsWith(pref + '/'))) return MCP_URL;
    if (SRV_PREFIXES.some(pref => p === pref || p.startsWith(pref + '/'))) return SRV_URL;
    if (['/healthz', '/readyz', '/metrics'].includes(p)) return MCP_URL;
    // NOTE: '/' must NOT be proxied — conduit-mcp returns 404 + CSP 'default-src none',
    // which would poison the SPA page. Vite serves the root. Keep it out of the lists above.
    return null;
  }

  /** Strip hop-by-hop headers from an incoming request before proxying. */
  function filterHeaders(incoming: Record<string, string | string[] | undefined>): Record<string, string> {
    const hopByHop = ['host', 'connection', 'transfer-encoding', 'content-length'];
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (v && !hopByHop.includes(k.toLowerCase())) {
        out[k] = Array.isArray(v) ? v[0] : String(v);
      }
    }
    return out;
  }

  /** fetch()-based proxy for standard JSON request/response patterns. */
  async function proxyToBackend(targetBase: string, req: express.Request, res: express.Response) {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const url = `${targetBase}${req.path}${qs}`;
    const headers = filterHeaders(req.headers);

    const opts: RequestInit = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method) && req.body) {
      opts.body = JSON.stringify(req.body);
      headers['content-type'] = 'application/json';
    }

    try {
      const fetchRes = await fetch(url, opts);
      res.status(fetchRes.status);
      fetchRes.headers.forEach((v, k) => {
        const kLower = k.toLowerCase();
        // Never forward backend CSP headers — the SPA is the only source of its CSP.
        // Backend 404/error pages (e.g. conduit-mcp's 'default-src none') would otherwise
        // poison the page and block legitimate browser requests.
        if (!STRIPPED_RESPONSE_HEADERS.includes(kLower)) {
          res.set(k, v);
        }
      });
      const body = await fetchRes.text();
      res.send(body);
    } catch (err: any) {
      console.error(`Proxy error → ${targetBase}:`, err.message);
      res.status(502).json({
        error: { code: 'BAD_GATEWAY', message: `Backend unreachable: ${targetBase}` }
      });
    }
  }

  // ============================================================
  // In-Memory Mock State (always defined — used by /api/status)
  // ============================================================
  let kernelVersion = 42;
  const identitiesMap = new Map<string, any>([
    [
      'iden::plan_0053',
      {
        id: 'iden::plan_0053',
        aliases: ['plan_0053', '0053', 'auth-module-v2'],
        label: 'Plan 0053 — Auth Module',
        node_ids: ['plan_0053'],
      },
    ],
    [
      'iden::plan_0054',
      {
        id: 'iden::plan_0054',
        aliases: ['plan_0054', '0054'],
        label: 'Plan 0054 — Storage Engine',
        node_ids: ['plan_0054'],
      },
    ],
  ]);

  const receiptsStore: any[] = [
    {
      id: 'RCP-PLAN-0053-1',
      plan_id: 'plan_0053',
      type: 'PROPOSED',
      agent_role: 'planner',
      session_id: 'sess-1001',
      ticket_id: 'TCK-2026-0053',
      artifact_path: 'IMPLEMENTATION_PLANS/pending/auth-module.md',
      summary: 'Initial proposal for Auth Module',
      metadata_json: '{"initiator": "planner_agent"}',
      tokens_used: 1200,
      created_at: '2026-07-25T08:00:00Z',
    },
    {
      id: 'RCP-PLAN-0053-2',
      plan_id: 'plan_0053',
      type: 'PLAN_CREATE',
      agent_role: 'planner',
      session_id: 'sess-1001',
      ticket_id: 'TCK-2026-0053',
      artifact_path: 'IMPLEMENTATION_PLANS/active/auth-module.md',
      summary: 'Plan created and validated',
      metadata_json: '{"consensus": 95}',
      tokens_used: 2400,
      created_at: '2026-07-25T09:30:00Z',
    },
  ];

  const sessionsStore: any[] = [
    {
      id: 'sess-1001',
      role: 'planner',
      state: 'running',
      detail: 'Decomposing plan_0053 requirements',
      pid: 14201,
      cost_usd: 1.25,
      started_at: new Date(Date.now() - 3600000).toISOString(),
      last_heartbeat: new Date().toISOString(),
    },
    {
      id: 'sess-1002',
      role: 'builder',
      state: 'running',
      detail: 'Executing test harness for plan_0054',
      pid: 14205,
      cost_usd: 3.50,
      started_at: new Date(Date.now() - 1800000).toISOString(),
      last_heartbeat: new Date().toISOString(),
    },
    {
      id: 'sess-1003',
      role: 'reviewer',
      state: 'stale',
      detail: 'Awaiting signature validation',
      pid: 13900,
      cost_usd: 0.45,
      started_at: new Date(Date.now() - 7200000).toISOString(),
      last_heartbeat: new Date(Date.now() - 4000000).toISOString(),
    },
  ];

  let circuitBreakerState = {
    tripped: false,
    paused: false,
    retry_after: 1800,
    source: '',
    error: '',
    detail: '',
    tripped_at: null as string | null,
    max_retries_per_model: 3,
    retry_delay_seconds: 120,
    max_fallbacks: 3,
    push_back_to_pending: true,
  };

  const lineageEventsStore: any[] = [
    {
      id: 1,
      version: 41,
      delta_id: 'delta-2026-07-24-080',
      step: 'reduce',
      event_type: 'apply',
      affected_plans: ['plan_0053'],
      detail: 'OK: 1 receipts reduced',
    },
    {
      id: 2,
      version: 42,
      delta_id: 'delta-2026-07-25-001',
      step: 'snapshot',
      event_type: 'checkpoint',
      affected_plans: ['plan_0053', 'plan_0054'],
      detail: 'Engine snapshot version 42 persisted',
    },
  ];

  const mockTickets = [
    {
      id: 'TCK-2026-0053',
      plan_id: 'plan_0053',
      role: 'planner',
      status: 'claimed',
      tokens_used: 3600,
      parent_ticket_id: null,
      spawn_reason: null,
      replacement_of: null,
      closure_reason: null,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      closed_at: null,
    },
    {
      id: 'TCK-2026-0054',
      plan_id: 'plan_0054',
      role: 'builder',
      status: 'claimed',
      tokens_used: 1800,
      parent_ticket_id: 'TCK-2026-0053',
      spawn_reason: 'Child builder execution',
      replacement_of: null,
      closure_reason: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      closed_at: null,
    },
  ];

  const governanceEvents = [
    {
      id: 1,
      receipt_id: 'RCP-PLAN-0053-1',
      event_type: 'receipt:PROPOSED',
      work_request_id: 'wr-uuid-0053',
      plan_id: 'plan_0053',
      agent_role: 'planner',
      payload: { session_id: 'sess-1001', artifact_path: 'IMPLEMENTATION_PLANS/pending/auth-module.md', summary: 'Initial proposal', tokens_used: 1200 },
      created_at: new Date(Date.now() - 7200000).toISOString(),
      replayed_at: new Date().toISOString(),
    },
    {
      id: 2,
      receipt_id: 'RCP-PLAN-0053-2',
      event_type: 'receipt:PLAN_CREATE',
      work_request_id: 'wr-uuid-0053',
      plan_id: 'plan_0053',
      agent_role: 'planner',
      payload: { session_id: 'sess-1001', artifact_path: 'IMPLEMENTATION_PLANS/active/auth-module.md', summary: 'Plan created and validated', tokens_used: 2400 },
      created_at: new Date(Date.now() - 3600000).toISOString(),
      replayed_at: new Date().toISOString(),
    },
  ];

  const visionWorkRequests: any[] = [
    {
      id: 1,
      wr_id: 'plan_0053',
      work_request_uuid: 'wr-uuid-0053',
      dco_json: '{"lease_owner_pid":"14201","cost_limit_usd":5.00}',
      context: { system: 'Auth Module', subsystem: 'OAuth Bridges' },
      status: 'pending',
      title: 'Auth Module V2 Implementation Plan',
      recorded_on_dt: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      wr_id: 'plan_0054',
      work_request_uuid: 'wr-uuid-0054',
      dco_json: '{"lease_owner_pid":"14205","cost_limit_usd":10.00}',
      context: { system: 'Storage Engine', subsystem: 'PostgreSQL Buffer' },
      status: 'in_progress',
      title: 'Storage Engine Buffer Cache Optimization',
      recorded_on_dt: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  // ============================================================
  // MOCK MODE — all routes served from in-memory state
  // ============================================================
  if (!LIVE_MODE) {

  // System Endpoints
  app.get('/api/info', (req, res) => {
    res.json({
      service: 'WRP Kernel Runtime',
      version: '0.1.0',
      docs: '/docs',
    });
  });

  app.get('/healthz', (req, res) => {
    res.json({ status: 'alive' });
  });

  app.get('/readyz', (req, res) => {
    res.json({ status: 'ready', kernel_version: kernelVersion });
  });

  app.get('/metrics', (req, res) => {
    const metrics = [
      '# HELP kernel_requests_total Total HTTP requests to WRP Kernel',
      '# TYPE kernel_requests_total counter',
      'kernel_requests_total{method="GET",path="/state",status="200"} 128',
      'kernel_requests_total{method="POST",path="/delta",status="200"} 42',
      '# HELP kernel_version Current WRP Kernel Version',
      '# TYPE kernel_version gauge',
      `kernel_version ${kernelVersion}`,
      '# HELP kernel_plan_count Total plans tracked',
      '# TYPE kernel_plan_count gauge',
      'kernel_plan_count 12',
      '# HELP kernel_receipt_count Total receipts stored',
      '# TYPE kernel_receipt_count gauge',
      `kernel_receipt_count ${receiptsStore.length}`,
      '# HELP kernel_identity_count Total identities resolved',
      '# TYPE kernel_identity_count gauge',
      `kernel_identity_count ${identitiesMap.size}`,
    ].join('\n');
    res.type('text/plain').send(metrics);
  });

  // -------------------------------------------------------------
  // 1. Delta Ingestion (/delta)
  // -------------------------------------------------------------
  app.post('/delta', (req, res) => {
    const { delta_id, batch_id, receipts, affected_plans, invalidated_plans } = req.body || {};
    if (!delta_id || !Array.isArray(receipts)) {
      return res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid KernelDelta payload: missing delta_id or receipts array',
        },
      });
    }

    kernelVersion += 1;
    receipts.forEach((r: any) => {
      receiptsStore.push({
        id: r.id || `RCP-${Date.now()}`,
        plan_id: r.plan_id || 'plan_0053',
        type: r.type || 'PLAN_CREATE',
        agent_role: r.agent_role || 'planner',
        session_id: 'sess-1001',
        ticket_id: r.ticket_id || 'TCK-AUTO',
        artifact_path: r.artifact_path || 'IMPLEMENTATION_PLANS/pending/auto.md',
        summary: r.summary || 'Ingested via POST /delta',
        metadata_json: r.metadata_json || '{}',
        tokens_used: r.tokens_used || 500,
        created_at: r.created_at || new Date().toISOString(),
      });
    });

    lineageEventsStore.push({
      id: lineageEventsStore.length + 1,
      version: kernelVersion,
      delta_id: delta_id,
      step: 'reduce',
      event_type: 'apply',
      affected_plans: affected_plans || [],
      detail: `OK: ${receipts.length} receipts processed in batch ${batch_id || 'manual'}`,
    });

    res.json({
      success: true,
      version: kernelVersion,
      delta_id,
      plan_count: 12,
      receipt_count: receiptsStore.length,
      error: null,
    });
  });

  app.get('/delta/state', (req, res) => {
    res.json({
      version: kernelVersion,
      plan_count: 12,
      receipt_count: receiptsStore.length,
      identity_count: identitiesMap.size,
      graph_edge_count: 34,
      lineage_event_count: lineageEventsStore.length,
    });
  });

  // -------------------------------------------------------------
  // 2. State Inspection (/state)
  // -------------------------------------------------------------
  app.get('/state', (req, res) => {
    const view = req.query.view || 'summary';
    const summary = {
      kernel_version: kernelVersion,
      plan_count: 12,
      receipt_count: receiptsStore.length,
      identity_count: identitiesMap.size,
      graph_edge_count: 34,
      lineage_event_count: lineageEventsStore.length,
      delta_log_count: kernelVersion,
    };

    if (view === 'full') {
      return res.json({
        ...summary,
        state: {
          identities: Array.from(identitiesMap.values()),
          receipts_count: receiptsStore.length,
          sessions_active: sessionsStore.length,
        },
      });
    }
    res.json(summary);
  });

  app.get('/state/health', (req, res) => {
    res.json({ status: 'ok', kernel_version: kernelVersion });
  });

  app.get('/state/identity/:identity_id', (req, res) => {
    const rawId = req.params.identity_id;
    let resolved = identitiesMap.get(rawId) || identitiesMap.get(`iden::${rawId}`);

    if (!resolved) {
      for (const iden of identitiesMap.values()) {
        if (iden.aliases.includes(rawId) || iden.node_ids.includes(rawId)) {
          resolved = iden;
          break;
        }
      }
    }

    if (!resolved) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Identity not found: ${rawId}`,
        },
      });
    }

    res.json({
      ...resolved,
      edges_outgoing: [
        { target: 'iden::plan_0052', relation: 'wrp:depends_on', metadata: {} },
      ],
      edges_incoming: [
        { source: 'iden::plan_0054', relation: 'wrp:impacts_system', metadata: {} },
      ],
    });
  });

  app.get('/state/receipt/:receipt_id', (req, res) => {
    const rc = receiptsStore.find(r => r.id === req.params.receipt_id);
    if (!rc) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Receipt not found: ${req.params.receipt_id}` },
      });
    }
    res.json({ id: rc.id, receipt: rc });
  });

  app.get('/state/receipts-by-plan/:plan_num', (req, res) => {
    const planNum = req.params.plan_num.startsWith('plan_') ? req.params.plan_num : `plan_${req.params.plan_num}`;
    const matches = receiptsStore.filter(r => r.plan_id === planNum);
    res.json({
      plan_num: planNum,
      receipts: matches,
      count: matches.length,
    });
  });

  app.get('/state/graph', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 200;
    const nodes = Array.from(identitiesMap.values()).map(i => ({
      id: i.id,
      aliases: i.aliases,
      label: i.label,
    }));
    const edges = [
      {
        source: 'iden::plan_0053',
        source_label: 'Plan 0053 — Auth Module',
        target: 'iden::plan_0054',
        target_label: 'Plan 0054 — Storage Engine',
        relation: 'wrp:depends_on',
        metadata: { priority: 'high' },
      },
      {
        source: 'iden::plan_0054',
        source_label: 'Plan 0054 — Storage Engine',
        target: 'iden::plan_0052',
        target_label: 'Plan 0052 — Core DB',
        relation: 'wrp:impacts_system',
        metadata: {},
      },
    ];

    res.json({
      nodes,
      edges,
      total_edges: edges.length,
      cursor: nodes.length > 0 ? nodes[nodes.length - 1].id : '',
      limit,
    });
  });

  app.get('/state/plan/:plan_num', (req, res) => {
    const planNum = req.params.plan_num.startsWith('plan_') ? req.params.plan_num : `plan_${req.params.plan_num}`;
    const planReceipts = receiptsStore.filter(r => r.plan_id === planNum);

    res.json({
      plan_num: planNum,
      identity_id: `iden::${planNum}`,
      aliases: [planNum, planNum.replace('plan_', '')],
      label: `Plan ${planNum.replace('plan_', '')}`,
      receipt_count: planReceipts.length,
      current_wrp_state: 'EXECUTING',
      valid_transitions: ['COMPLETED', 'BLOCKED', 'CANCELLED', 'ARCHIVED'],
      receipts: planReceipts,
      edges_outgoing: [{ target: 'iden::plan_0052', relation: 'wrp:depends_on', metadata: {} }],
      edges_incoming: [],
    });
  });

  app.get('/state/lineage', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    res.json({
      events: lineageEventsStore.slice(-limit),
      count: lineageEventsStore.length,
    });
  });

  // -------------------------------------------------------------
  // 3. Replay (/replay)
  // -------------------------------------------------------------
  app.get('/replay', (req, res) => {
    const targetVer = req.query.version ? parseInt(req.query.version as string) : kernelVersion;
    res.json({
      version: targetVer,
      plan_count: 12,
      receipt_count: Math.min(receiptsStore.length, targetVer * 2),
      identity_count: identitiesMap.size,
      graph_edge_count: 34,
      lineage_event_count: lineageEventsStore.length,
      reconstructed_from_version: targetVer,
    });
  });

  app.get('/replay/compare', (req, res) => {
    const ver = parseInt(req.query.version as string);
    if (isNaN(ver)) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: 'Missing required integer parameter: version' },
      });
    }

    const match = ver === kernelVersion;
    res.json({
      match,
      live_version: kernelVersion,
      replay_version: ver,
      live_plan_count: 12,
      replay_plan_count: match ? 12 : 11,
      live_receipt_count: receiptsStore.length,
      replay_receipt_count: match ? receiptsStore.length : receiptsStore.length - 1,
      live_identity_count: identitiesMap.size,
      replay_identity_count: identitiesMap.size,
      live_edge_count: 34,
      replay_edge_count: 34,
      diffs: match ? [] : [`Receipt count discrepancy at version ${ver}: live=${receiptsStore.length}, replay=${receiptsStore.length - 1}`],
    });
  });

  // -------------------------------------------------------------
  // 4. Admin (/admin)
  // -------------------------------------------------------------
  app.get('/admin/identities', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const list = Array.from(identitiesMap.values());
    res.json({
      identities: list.slice(0, limit),
      total: list.length,
      cursor: list.length > 0 ? list[list.length - 1].id : '',
      limit,
    });
  });

  app.patch('/admin/identities/:identity_id', (req, res) => {
    const id = req.params.identity_id;
    const iden = identitiesMap.get(id) || identitiesMap.get(`iden::${id}`);
    if (!iden) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Identity not found: ${id}` },
      });
    }

    if (req.body.label) iden.label = req.body.label;
    if (Array.isArray(req.body.aliases)) iden.aliases = req.body.aliases;

    res.json({
      id: iden.id,
      label: iden.label,
      aliases: iden.aliases,
      updated: true,
    });
  });

  app.delete('/admin/identities/:identity_id', (req, res) => {
    const id = req.params.identity_id;
    const key = identitiesMap.has(id) ? id : `iden::${id}`;
    if (identitiesMap.has(key)) {
      identitiesMap.delete(key);
      return res.json({ ok: true, identity_id: key });
    }
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `Identity not found: ${id}` } });
  });

  app.get('/admin/consistency', (req, res) => {
    res.json({
      aligned: true,
      engine_version: kernelVersion,
      delta_log_version: kernelVersion,
      engine_plan_count: 12,
      delta_log_count: kernelVersion,
      details: [
        `Version aligned: engine=${kernelVersion} == delta_log=${kernelVersion}`,
        'Plans tracked: 12',
        `Delta log entries: ${kernelVersion}`,
      ],
    });
  });

  // -------------------------------------------------------------
  // 5. Sessions (/api/sessions)
  // -------------------------------------------------------------
  app.get('/api/sessions', (req, res) => {
    const runningOnly = req.query.running_only === 'true';
    const result = runningOnly ? sessionsStore.filter(s => s.state === 'running') : sessionsStore;
    res.json(result);
  });

  app.get('/api/sessions/running', (req, res) => {
    res.json(sessionsStore.filter(s => s.state === 'running'));
  });

  app.get('/api/sessions/stale', (req, res) => {
    res.json(sessionsStore.filter(s => s.state === 'stale'));
  });

  app.get('/api/sessions/:session_id', (req, res) => {
    const sess = sessionsStore.find(s => s.id === req.params.session_id);
    if (!sess) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Session not found: ${req.params.session_id}` } });
    }
    res.json(sess);
  });

  app.patch('/api/sessions/:session_id/cost', (req, res) => {
    const sess = sessionsStore.find(s => s.id === req.params.session_id);
    if (!sess) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Session not found: ${req.params.session_id}` } });
    }
    if (typeof req.body.cost_usd === 'number') {
      sess.cost_usd = req.body.cost_usd;
    }
    res.json(sess);
  });

  app.post('/api/sessions/:session_id/heartbeat', (req, res) => {
    const sess = sessionsStore.find(s => s.id === req.params.session_id);
    if (!sess) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Session not found: ${req.params.session_id}` } });
    }
    sess.last_heartbeat = new Date().toISOString();
    if (req.body.state) sess.state = req.body.state;
    if (req.body.detail) sess.detail = req.body.detail;
    res.json(sess);
  });

  app.post('/api/sessions/:session_id/kill', (req, res) => {
    const id = req.params.session_id;
    const sess = sessionsStore.find(s => s.id === id);
    if (sess) {
      sess.state = 'failed';
      sess.detail = 'Force-killed via API';
    }
    res.json({
      killed: true,
      sessionId: id,
      pids: sess ? [sess.pid] : [12345],
      errors: [],
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------
  // 6. Circuit Breaker (/api/breaker)
  // -------------------------------------------------------------
  app.get('/api/breaker', (req, res) => {
    res.json(circuitBreakerState);
  });

  app.post('/api/breaker/trip', (req, res) => {
    circuitBreakerState.tripped = true;
    circuitBreakerState.source = req.body.reason || 'MANUAL_TRIP';
    circuitBreakerState.error = req.body.reason || 'Manual circuit breaker trip';
    circuitBreakerState.detail = req.body.detail || 'Tripped by administrator via API';
    circuitBreakerState.tripped_at = new Date().toISOString();
    if (req.body.retryAfter) circuitBreakerState.retry_after = req.body.retryAfter;
    res.json(circuitBreakerState);
  });

  app.post('/api/breaker/reset', (req, res) => {
    circuitBreakerState.tripped = false;
    circuitBreakerState.source = '';
    circuitBreakerState.error = '';
    circuitBreakerState.detail = '';
    circuitBreakerState.tripped_at = null;
    res.json(circuitBreakerState);
  });

  app.post('/api/breaker/pause', (req, res) => {
    circuitBreakerState.paused = true;
    res.json(circuitBreakerState);
  });

  app.post('/api/breaker/resume', (req, res) => {
    circuitBreakerState.paused = false;
    res.json(circuitBreakerState);
  });

  app.get('/api/breaker/failure-recovery', (req, res) => {
    res.json({
      max_retries_per_model: circuitBreakerState.max_retries_per_model,
      retry_delay_seconds: circuitBreakerState.retry_delay_seconds,
      max_fallbacks: circuitBreakerState.max_fallbacks,
      push_back_to_pending: circuitBreakerState.push_back_to_pending,
      circuit_breaker_retry_after: circuitBreakerState.retry_after,
    });
  });

  app.post('/api/breaker/failure-recovery', (req, res) => {
    if (typeof req.body.max_retries_per_model === 'number') circuitBreakerState.max_retries_per_model = req.body.max_retries_per_model;
    if (typeof req.body.retry_delay_seconds === 'number') circuitBreakerState.retry_delay_seconds = req.body.retry_delay_seconds;
    if (typeof req.body.max_fallbacks === 'number') circuitBreakerState.max_fallbacks = req.body.max_fallbacks;
    if (typeof req.body.push_back_to_pending === 'boolean') circuitBreakerState.push_back_to_pending = req.body.push_back_to_pending;
    if (typeof req.body.circuit_breaker_retry_after === 'number') circuitBreakerState.retry_after = req.body.circuit_breaker_retry_after;

    res.json({
      max_retries_per_model: circuitBreakerState.max_retries_per_model,
      retry_delay_seconds: circuitBreakerState.retry_delay_seconds,
      max_fallbacks: circuitBreakerState.max_fallbacks,
      push_back_to_pending: circuitBreakerState.push_back_to_pending,
      circuit_breaker_retry_after: circuitBreakerState.retry_after,
    });
  });

  // -------------------------------------------------------------
  // 7. Receipts (/api/receipts)
  // -------------------------------------------------------------
  app.get('/api/receipts/:plan_id', (req, res) => {
    const planId = req.params.plan_id.startsWith('plan_') ? req.params.plan_id : `plan_${req.params.plan_id}`;
    const receipts = receiptsStore.filter(r => r.plan_id === planId);
    res.json(
      receipts.map(r => ({
        ...r,
        parsed_metadata: JSON.parse(r.metadata_json || '{}'),
      }))
    );
  });

  app.get('/api/receipts/:plan_id/raw', (req, res) => {
    const planId = req.params.plan_id.startsWith('plan_') ? req.params.plan_id : `plan_${req.params.plan_id}`;
    res.json(receiptsStore.filter(r => r.plan_id === planId));
  });

  app.get('/api/receipts/:plan_id/latest-type', (req, res) => {
    const planId = req.params.plan_id.startsWith('plan_') ? req.params.plan_id : `plan_${req.params.plan_id}`;
    const receipts = receiptsStore.filter(r => r.plan_id === planId);
    const latest = receipts.length > 0 ? receipts[receipts.length - 1].type : 'NONE';
    res.json({ plan_id: planId, latest_type: latest });
  });

  app.post('/api/receipts', (req, res) => {
    const r = req.body || {};
    const newRc = {
      id: r.id || `RCP-${Date.now()}`,
      plan_id: r.plan_id || 'plan_0053',
      type: r.type || 'PLAN_CREATE',
      agent_role: r.agent_role || 'planner',
      session_id: r.session_id || 'sess-1001',
      ticket_id: r.ticket_id || 'TCK-2026-0053',
      artifact_path: r.artifact_path || 'IMPLEMENTATION_PLANS/pending/my-plan.md',
      summary: r.summary || 'Inserted receipt',
      metadata_json: r.metadata_json || '{}',
      tokens_used: r.tokens_used || 1000,
      created_at: r.created_at || new Date().toISOString(),
    };
    receiptsStore.push(newRc);
    res.json({ ok: true, id: newRc.id, plan_id: newRc.plan_id });
  });

  app.delete('/api/receipts/:plan_id', (req, res) => {
    const planId = req.params.plan_id.startsWith('plan_') ? req.params.plan_id : `plan_${req.params.plan_id}`;
    const typesStr = (req.query.types as string) || '';
    const typesToDelete = typesStr.split(',').map(s => s.trim()).filter(Boolean);

    let countBefore = receiptsStore.length;
    for (let i = receiptsStore.length - 1; i >= 0; i--) {
      if (receiptsStore[i].plan_id === planId && (typesToDelete.length === 0 || typesToDelete.includes(receiptsStore[i].type))) {
        receiptsStore.splice(i, 1);
      }
    }
    const deletedCount = countBefore - receiptsStore.length;
    res.json({ deleted: deletedCount, plan_id: planId, types: typesToDelete });
  });

  // -------------------------------------------------------------
  // 8. TypeScript conduit-srv (:3104) Routes
  // -------------------------------------------------------------

  // Health
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', port: 3104, db: 'up', timestamp: new Date().toISOString() });
  });

  // Workflows
  app.get('/workflows', (req, res) => {
    const runningSessions = sessionsStore.filter(s => s.state === 'running');
    const workflows = runningSessions.map(s => ({
      workflowId: `plan-plan_0053-${s.role}`,
      runId: s.id,
      status: s.state,
      startTime: s.started_at,
      closeTime: null,
      planId: 'plan_0053',
      role: s.role,
      pid: s.pid,
    }));

    res.json({
      connected: true,
      counts: {
        running: workflows.length,
        completed: 0,
        failed: sessionsStore.filter(s => s.state === 'failed').length,
        cancelled: 0,
        total: sessionsStore.length,
      },
      workflows,
    });
  });

  // Tickets
  app.post('/tickets/detect', (req, res) => {
    res.json({
      detected: true,
      stale: 1,
      expired: 0,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/tickets/lineage/:planId', (req, res) => {
    const rawId = req.params.planId;
    const planId = rawId.startsWith('plan_') ? rawId : `plan_${rawId}`;
    const matched = mockTickets.filter(t => t.plan_id === planId);
    res.json({
      plan_id: planId,
      tickets: matched.length > 0 ? matched : mockTickets,
    });
  });

  // Tokens
  app.get('/tokens/plan/:planId', (req, res) => {
    const rawId = req.params.planId;
    const planId = rawId.startsWith('plan_') ? rawId : `plan_${rawId}`;
    const receipts = receiptsStore.filter(r => r.plan_id === planId);
    const totalTokens = receipts.reduce((acc, r) => acc + (r.tokens_used || 0), 0);
    res.json({
      plan_id: planId,
      total_tokens: totalTokens || 3600,
      receipts: receipts.length || 2,
    });
  });

  app.get('/tokens/role/:role', (req, res) => {
    const role = req.params.role;
    const receipts = receiptsStore.filter(r => r.agent_role === role);
    const totalTokens = receipts.reduce((acc, r) => acc + (r.tokens_used || 0), 0);
    res.json({
      role,
      total_tokens: totalTokens || 4200,
      receipts: receipts.length || 3,
    });
  });

  app.get('/tokens/ticket/:ticketId', (req, res) => {
    const tId = req.params.ticketId;
    const receipts = receiptsStore.filter(r => r.ticket_id === tId);
    const totalTokens = receipts.reduce((acc, r) => acc + (r.tokens_used || 0), 0);
    res.json({
      ticket_id: tId,
      tokens_used: totalTokens || 1500,
    });
  });

  // Config
  app.get('/config/cron', (req, res) => {
    res.json({
      cron: '*/3 * * * *',
      intervalMinutes: 3,
      description: 'Pipeline cron interval',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/config/failure-recovery', (req, res) => {
    res.json({
      max_retries_per_model: circuitBreakerState.max_retries_per_model,
      retry_delay_seconds: circuitBreakerState.retry_delay_seconds,
      max_fallbacks: circuitBreakerState.max_fallbacks,
      push_back_to_pending: circuitBreakerState.push_back_to_pending,
      circuit_breaker_retry_after: circuitBreakerState.retry_after,
    });
  });

  app.post('/config/failure-recovery', (req, res) => {
    if (typeof req.body.max_retries_per_model === 'number') circuitBreakerState.max_retries_per_model = req.body.max_retries_per_model;
    if (typeof req.body.retry_delay_seconds === 'number') circuitBreakerState.retry_delay_seconds = req.body.retry_delay_seconds;
    if (typeof req.body.max_fallbacks === 'number') circuitBreakerState.max_fallbacks = req.body.max_fallbacks;
    if (typeof req.body.push_back_to_pending === 'boolean') circuitBreakerState.push_back_to_pending = req.body.push_back_to_pending;
    if (typeof req.body.circuit_breaker_retry_after === 'number') circuitBreakerState.retry_after = req.body.circuit_breaker_retry_after;

    res.json({ saved: true });
  });

  // Governance
  app.post('/governance/replay', (req, res) => {
    res.json({ ok: true, replayed: governanceEvents.length });
  });

  app.get('/governance/events', (req, res) => {
    const planId = req.query.planId as string;
    const eventType = req.query.eventType as string;

    let filtered = governanceEvents;
    if (planId) {
      filtered = filtered.filter(e => e.plan_id === planId);
    }
    if (eventType) {
      filtered = filtered.filter(e => e.event_type === eventType);
    }

    res.json({ ok: true, events: filtered });
  });

  // Vision (Work Requests & Receipts)
  app.post('/vision/work-requests', (req, res) => {
    const { id, work_request_uuid, dco_json, context, status, title } = req.body || {};
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing required field: id' });
    }

    const wrId = id.startsWith('plan_') ? id : `plan_${id}`;
    let existing = visionWorkRequests.find(w => w.wr_id === wrId);
    let action = 'updated';

    if (!existing) {
      action = 'created';
      existing = {
        id: visionWorkRequests.length + 1,
        wr_id: wrId,
        work_request_uuid: work_request_uuid || `uuid-${Date.now()}`,
        dco_json: typeof dco_json === 'string' ? dco_json : JSON.stringify(dco_json || {}),
        context: context || {},
        status: status || 'pending',
        title: title || `Work Request ${wrId}`,
        recorded_on_dt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      visionWorkRequests.push(existing);
    } else {
      if (work_request_uuid) existing.work_request_uuid = work_request_uuid;
      if (dco_json) existing.dco_json = typeof dco_json === 'string' ? dco_json : JSON.stringify(dco_json);
      if (context) existing.context = context;
      if (status) existing.status = status;
      if (title) existing.title = title;
      existing.updated_at = new Date().toISOString();
    }

    res.json({
      ok: true,
      id: wrId,
      work_request_uuid: existing.work_request_uuid,
      action,
    });
  });

  app.get('/vision/work-requests', (req, res) => {
    const statusFilter = req.query.status as string;
    let list = visionWorkRequests;
    if (statusFilter) {
      list = list.filter(w => w.status === statusFilter);
    }
    res.json({ ok: true, work_requests: list });
  });

  app.get('/vision/work-requests/:id', (req, res) => {
    const targetId = req.params.id;
    const found = visionWorkRequests.find(w => w.wr_id === targetId || w.wr_id === `plan_${targetId}` || String(w.id) === targetId);

    if (!found) {
      return res.status(404).json({ ok: false, error: `Work request not found: ${targetId}` });
    }
    res.json({ ok: true, work_request: found });
  });

  app.get('/vision/receipts', (req, res) => {
    const planIdParam = req.query.planId as string;
    if (!planIdParam) {
      return res.status(400).json({ ok: false, error: 'Query parameter ?planId= is required' });
    }

    const planId = planIdParam.startsWith('plan_') ? planIdParam : `plan_${planIdParam}`;
    const receipts = receiptsStore.filter(r => r.plan_id === planId);

    res.json({
      ok: true,
      receipts: receipts.map((r, idx) => ({
        id: r.id,
        plan_id: r.plan_id,
        type: r.type,
        agent_role: r.agent_role,
        session_id: r.session_id || 'sess-1001',
        ticket_id: r.ticket_id || 'TCK-2026-0053',
        artifact_path: r.artifact_path || 'IMPLEMENTATION_PLANS/active/auth.md',
        summary: r.summary || 'Receipt summary',
        metadata_json: r.metadata_json || '{}',
        tokens_used: r.tokens_used || 1000,
        created_at: r.created_at,
        sequence: idx + 1,
      })),
    });
  });

  // Session Log SSE
  app.get('/log/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const metaMsg = JSON.stringify({
      type: 'session_log_meta',
      data: { sessionId, logFileExists: true, logPath: `/var/log/conduit/${sessionId}.log` },
    });
    res.write(`data: ${metaMsg}\n\n`);

    const logLine = JSON.stringify({
      type: 'session_log',
      data: { sessionId, line: `[stdout] Kernel session ${sessionId} initialized and listening.`, timestamp: new Date().toISOString(), logType: 'stdout' },
    });
    res.write(`data: ${logLine}\n\n`);

    req.on('close', () => {
      res.end();
    });
  });

  } // end if (!LIVE_MODE) — mock routes block

  /**
   * Streaming proxy using http.request() with pipe-through.
   * Used for SSE endpoints so data streams in real-time to the client
   * instead of being buffered by fetch().
   */
  function proxyStreamToBackend(targetBase: string, req: express.Request, res: express.Response) {
    const targetUrl = new URL(targetBase);
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const headers = filterHeaders(req.headers);

    const options: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: `${req.path}${qs}`,
      method: req.method,
      headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Forward status and headers from the backend, then pipe the stream.
      // Strip backend CSP headers (consistent with proxyToBackend) so error-page
      // policies never leak into responses served to the SPA.
      // Node lowercases incoming header names, so the shared lowercase list matches directly.
      const headers: Record<string, any> = { ...proxyRes.headers };
      for (const h of STRIPPED_RESPONSE_HEADERS) {
        delete headers[h];
      }
      res.writeHead(proxyRes.statusCode || 200, headers);
      proxyRes.pipe(res);

      // If the backend connection drops mid-stream, clean up
      proxyRes.on('error', (err: Error) => {
        console.error(`Stream proxy response error → ${targetBase}:`, err.message);
        if (res.headersSent) res.destroy();
        else res.status(502).json({ error: { code: 'BAD_GATEWAY', message: 'Backend streaming error' } });
      });
    });

    proxyReq.on('error', (err: Error) => {
      console.error(`Stream proxy error → ${targetBase}:`, err.message);
      if (res.headersSent) {
        res.destroy();
      } else {
        res.status(502).json({
          error: { code: 'BAD_GATEWAY', message: `Backend unreachable: ${targetBase}` }
        });
      }
    });

    // When the client disconnects, abort the upstream request
    req.on('close', () => {
      proxyReq.destroy();
    });

    // Forward the request body if present
    if (req.body && Object.keys(req.body).length > 0) {
      proxyReq.write(JSON.stringify(req.body));
    }
    proxyReq.end();
  }

  // ============================================================
  // LIVE MODE — proxy API calls to real conduit backends
  // ============================================================
  if (LIVE_MODE) {
    app.all('*', async (req, res, next) => {
      const target = getBackendForPath(req.path);
      if (target) {
        // Use streaming proxy for SSE endpoints so logs stream in real-time
        if (req.path.startsWith('/log/')) {
          return proxyStreamToBackend(target, req, res);
        }
        return proxyToBackend(target, req, res);
      }
      next(); // not an API path → let Vite/static handle
    });
  }

  // ============================================================
  // /api/status — always available (server-side, reports mode)
  // ============================================================
  app.get('/api/status', (req, res) => {
    const base = {
      pgConnected: Boolean(process.env.CONDUIT_PG_DSN),
      pgDsn: process.env.CONDUIT_PG_DSN || 'postgresql://nexus_admin:***@postgres.internal.nexus:5432/nexus (stub)',
      pgSchema: process.env.CONDUIT_PG_SCHEMA || 'conduit',
      wrpKernelActive: true,
      wrpKernelUrl: process.env.WRP_KERNEL_URL || 'http://localhost:3103',
      activeLeasesCount: sessionsStore.filter(s => s.state === 'running').length,
      circuitBreakerTripped: circuitBreakerState.tripped,
      lastSyncTimestamp: new Date().toISOString(),
    };

    if (LIVE_MODE) {
      res.json({
        ...base,
        liveMode: true,
        conduitMcpUrl: MCP_URL,
        conduitSrvUrl: SRV_URL,
        conduitSrvActive: true,
        mcpServerUrl: MCP_URL,
      });
    } else {
      res.json({
        ...base,
        liveMode: false,
        conduitSrvActive: true,
        conduitSrvUrl: process.env.CONDUIT_SRV_URL || 'http://localhost:3104',
        mcpServerUrl: process.env.MCP_BASE_URL || 'http://localhost:3100',
      });
    }
  });

  // Vite middleware for dev or static server in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const mode = LIVE_MODE ? `LIVE (→ MCP ${MCP_URL} | SRV ${SRV_URL})` : 'MOCK';
    console.log(`WRP Kernel Runtime & Control Plane running on http://0.0.0.0:${PORT} [${mode}]`);
  });
}

startServer();
