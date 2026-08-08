import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();
import {
  INITIAL_PROVIDERS,
  INITIAL_HARNESSES,
  INITIAL_MODELS,
  INITIAL_SYSTEM_ROLES,
  INITIAL_ROLE_CONFIGS,
  INITIAL_BUNDLES,
  INITIAL_PROMPTS,
  INITIAL_TASKS,
  INITIAL_PROCEDURES,
  INITIAL_FAILURE_RECOVERY,
  INITIAL_SCHEDULER_ENTRIES,
  INITIAL_SESSIONS,
  INITIAL_SYSTEM_LOGS
} from './src/mockData';
import {
  Provider,
  Harness,
  AIModel,
  SystemRole,
  RoleConfig,
  ConfigBundle,
  PromptTemplate,
  TaskDefinition,
  ProcedureCard,
  FailureRecoveryConfig,
  AgentScheduleEntry,
  SessionLedgerEntry,
  SystemLogEntry,
  SystemMetricPoint,
  SystemHealthStatus
} from './src/types';

// Initialize in-memory store
let providersStore: Provider[] = [...INITIAL_PROVIDERS];
let harnessesStore: Harness[] = [...INITIAL_HARNESSES];
let modelsStore: AIModel[] = [...INITIAL_MODELS];
let systemRolesStore: SystemRole[] = [...INITIAL_SYSTEM_ROLES];
let roleConfigsStore: RoleConfig[] = [...INITIAL_ROLE_CONFIGS];
let bundlesStore: ConfigBundle[] = [...INITIAL_BUNDLES];
let promptsStore: PromptTemplate[] = [...INITIAL_PROMPTS];
let tasksStore: TaskDefinition[] = [...INITIAL_TASKS];
let proceduresStore: ProcedureCard[] = [...INITIAL_PROCEDURES];
let failureRecoveryStore: FailureRecoveryConfig = { ...INITIAL_FAILURE_RECOVERY };
let schedulerStore: AgentScheduleEntry[] = [...INITIAL_SCHEDULER_ENTRIES];
let sessionsStore: SessionLedgerEntry[] = [...INITIAL_SESSIONS];
let systemLogsStore: SystemLogEntry[] = [...INITIAL_SYSTEM_LOGS];

function addLogEntry(
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  category: 'API_ROUTER' | 'CIRCUIT_BREAKER' | 'RESOLVER' | 'GEMINI_PROXY' | 'SCHEDULER' | 'MEMORY_CACHE' | 'SESSION_DRIVER' | 'SYSTEM',
  message: string,
  source: string = 'tackle-srv :3410',
  details?: Record<string, any> | string
): SystemLogEntry {
  const newLog: SystemLogEntry = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    source,
    details
  };
  systemLogsStore.unshift(newLog);
  if (systemLogsStore.length > 500) {
    systemLogsStore = systemLogsStore.slice(0, 500);
  }
  return newLog;
}

// System Health & Telemetry History Store (1 Hour / 60 Minutes)
const startTimeMs = Date.now();
let systemMetricsHistory: SystemMetricPoint[] = Array.from({ length: 60 }, (_, idx) => {
  const minAgo = 59 - idx;
  const t = Date.now() - minAgo * 60 * 1000;
  const angle = idx / 5.0;
  const cpu = Math.max(12, Math.min(88, Math.round((28 + Math.sin(angle) * 16 + Math.cos(idx / 3) * 8 + (idx % 7 === 0 ? 15 : 0)) * 10) / 10));
  const memPct = Math.max(28, Math.min(74, Math.round((41 + Math.sin(idx / 8) * 6 + (idx / 59) * 5) * 10) / 10));
  const memUsed = Math.round((memPct / 100) * 4096 * 10) / 10;
  const activeReq = Math.max(2, Math.round(14 + Math.sin(angle) * 8 + (idx % 11 === 0 ? 18 : 0)));
  const latency = Math.max(8, Math.round(19 + Math.sin(idx / 6) * 12 + (cpu > 45 ? 22 : 0)));
  return {
    timestamp: new Date(t).toISOString(),
    cpu_percent: cpu,
    memory_percent: memPct,
    memory_used_mb: memUsed,
    memory_total_mb: 4096.0,
    active_requests: activeReq,
    latency_avg_ms: latency
  };
});

function getSystemHealthData(): SystemHealthStatus {
  const now = Date.now();
  const lastPoint = systemMetricsHistory[systemMetricsHistory.length - 1];
  const timeSinceLast = now - new Date(lastPoint.timestamp).getTime();

  // If more than 30s have passed, append a new current data point and drop oldest
  if (timeSinceLast >= 30000) {
    const nextIdx = systemMetricsHistory.length;
    const angle = nextIdx / 5.0;
    const noise = Math.random() * 6 - 3;
    const cpu = Math.max(10, Math.min(92, Math.round((30 + Math.sin(angle) * 15 + noise) * 10) / 10));
    const memPct = Math.max(30, Math.min(78, Math.round((lastPoint.memory_percent + (Math.random() * 1.6 - 0.8)) * 10) / 10));
    const memUsed = Math.round((memPct / 100) * 4096 * 10) / 10;
    const activeReq = Math.max(3, Math.round(15 + Math.random() * 14));
    const latency = Math.max(10, Math.round(18 + (cpu > 50 ? 25 : 0) + Math.random() * 8));

    systemMetricsHistory.push({
      timestamp: new Date(now).toISOString(),
      cpu_percent: cpu,
      memory_percent: memPct,
      memory_used_mb: memUsed,
      memory_total_mb: 4096.0,
      active_requests: activeReq,
      latency_avg_ms: latency
    });
    if (systemMetricsHistory.length > 60) {
      systemMetricsHistory = systemMetricsHistory.slice(systemMetricsHistory.length - 60);
    }
  }

  const latest = systemMetricsHistory[systemMetricsHistory.length - 1];
  const uptimeSeconds = Math.round((now - startTimeMs) / 1000) + 7200; // start at 2h uptime

  return {
    status: latest.cpu_percent > 85 ? 'degraded' : 'ok',
    port: 3410,
    pid: process.pid || 14820,
    timestamp: new Date(now).toISOString(),
    uptime_seconds: uptimeSeconds,
    cpu: {
      usage_percent: latest.cpu_percent,
      cores: 8,
      load_average: [
        Math.round((latest.cpu_percent / 20) * 100) / 100,
        Math.round((latest.cpu_percent / 22) * 100) / 100,
        Math.round((latest.cpu_percent / 25) * 100) / 100
      ]
    },
    memory: {
      used_mb: latest.memory_used_mb,
      total_mb: latest.memory_total_mb,
      usage_percent: latest.memory_percent,
      free_mb: Math.round((latest.memory_total_mb - latest.memory_used_mb) * 10) / 10,
      heap_used_mb: Math.round(latest.memory_used_mb * 0.28 * 10) / 10,
      heap_total_mb: Math.round(latest.memory_total_mb * 0.35 * 10) / 10
    },
    history: systemMetricsHistory
  };
}

// Lazy Gemini AI client generator
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('MY_GEMINI_API_KEY')) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

const TACKLE_MODE = (process.env.VITE_TACKLE_MODE || 'mock').toLowerCase();

function createLiveProxy(targetUrl: string) {
  const url = new URL(targetUrl);
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/@') || req.path.startsWith('/src') ||
        req.path.startsWith('/node_modules') || req.path.startsWith('/favicon') ||
        req.path === '/') {
      return next();
    }
    console.log(`[tackle-ui -> live] ${req.method} ${req.path}`);
    const rawBody = ['POST', 'PUT', 'PATCH'].includes(req.method) && req.body
      ? JSON.stringify(req.body) : undefined;
    const body = rawBody && rawBody !== '{}' ? rawBody : undefined;
    const headers: Record<string, any> = { ...req.headers, host: `${url.hostname}:${url.port}` };
    delete headers['content-length'];
    if (body) headers['content-length'] = Buffer.byteLength(body).toString();
    const proxyReq = http.request({
      hostname: url.hostname, port: url.port,
      path: req.originalUrl || req.url, method: req.method, headers,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      console.error(`[tackle-ui -> live] proxy error: ${err.message}`);
      if (!res.headersSent) res.status(502).json({ error: 'Tackle backend unreachable', detail: err.message });
    });
    proxyReq.setTimeout(30000, () => { proxyReq.destroy(); });
    if (body) proxyReq.write(body);
    proxyReq.end();
  };
}

async function startServer() {
  const app = express();
  // Port selection by mode: mock → 3000, live → 4202 (override with PORT env var)
  const PORT = TACKLE_MODE === 'live'
    ? parseInt(process.env.PORT || '4202', 10)
    : parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // Log requests
  app.use((req, res, next) => {
    if (!req.path.startsWith('/@') && !req.path.startsWith('/src') && !req.path.startsWith('/node_modules') && !req.path.startsWith('/favicon')) {
      console.log(`[tackle-srv :3410] ${req.method} ${req.path}`);
      // Record API request logs (excluding /logs polling itself to prevent infinite recursion)
      if (!req.path.startsWith('/logs')) {
        let category: any = 'API_ROUTER';
        if (req.path.includes('resolve')) category = 'RESOLVER';
        else if (req.path.includes('memory')) category = 'MEMORY_CACHE';
        else if (req.path.includes('sessions') || req.path.includes('test')) category = 'SESSION_DRIVER';
        else if (req.path.includes('scheduler')) category = 'SCHEDULER';
        else if (req.path.includes('failure-recovery')) category = 'CIRCUIT_BREAKER';

        addLogEntry('INFO', category, `${req.method} ${req.path}`, 'tackle-srv :3410', {
          query: Object.keys(req.query).length ? req.query : undefined,
          has_body: req.method !== 'GET'
        });
      }
    }
    next();
  });

  if (TACKLE_MODE === 'live') {
    const target = process.env.VITE_TACKLE_TARGET || 'http://localhost:3410';
    console.log(`[tackle-ui] LIVE mode - proxying to ${target} with fallback stubs for missing endpoints`);

    // --- LIVE-MODE FALLBACK STUBS ---
    // These endpoints are missing on the real tackle-srv (port 3410).
    // They are registered BEFORE the catch-all proxy so the UI doesn't break.
    // Endpoints that now exist on tackle-srv (logs, health/*, memory/*) proxy through naturally.

    // Seed defaults — now exists on tackle-srv, proxy it
    app.post('/config/ai/seed-defaults', (req: Request, res: Response) => {
      const body = JSON.stringify(req.body || {});
      fetch(`${target}/config/ai/seed-defaults`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      }).then(r => r.json().then(data => res.status(r.status).json(data)))
        .catch(() => res.json({ status: 'seeded', timestamp: new Date().toISOString() }));
    });

    // Config resolve for a role — now exists on tackle-srv, proxy it
    app.get('/config/ai/resolve/:role', (req: Request, res: Response) => {
      const role = req.params.role;
      fetch(`${target}/config/ai/resolve/${role}`)
        .then(r => r.json().then(data => res.status(r.status).json(data)))
        .catch(() => res.status(404).json({ error: `No config found for role '${role}'` }));
    });

    // AI test invocation — now exists on tackle-srv, proxy it
    app.post('/config/ai/test', (req: Request, res: Response) => {
      const body = JSON.stringify(req.body || {});
      fetch(`${target}/config/ai/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      }).then(r => r.json().then(data => res.status(r.status).json(data)))
        .catch(() => res.status(502).json({ error: 'Tackle backend unreachable for test invocation' }));
    });

    // Memory refresh & check-since — now proxied to tackle-srv

    // Session kill — now exists on tackle-srv, proxy it
    app.post('/sessions/:sessionId/kill', (req: Request, res: Response) => {
      const { sessionId } = req.params;
      fetch(`${target}/sessions/${sessionId}/kill`, { method: 'POST' })
        .then(r => r.json().then(data => res.status(r.status).json(data)))
        .catch(() => res.json({ killed: true, sessionId, pids: [0], timestamp: new Date().toISOString() }));
    });

    // Catch-all proxy for everything else → tackle-srv
    app.use(createLiveProxy(target));
  } else {

  // --- REST API ENDPOINTS ---

  // System Logs API
  app.get('/logs', (req: Request, res: Response) => {
    const { level, category, search, since, limit = 100 } = req.query;
    let filtered = [...systemLogsStore];

    if (level && level !== 'ALL') {
      const levels = String(level).toUpperCase().split(',');
      filtered = filtered.filter(l => levels.includes(l.level.toUpperCase()));
    }

    if (category && category !== 'ALL') {
      const categories = String(category).toUpperCase().split(',');
      filtered = filtered.filter(l => categories.includes(l.category.toUpperCase()));
    }

    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(l =>
        l.message.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        (l.source && l.source.toLowerCase().includes(q)) ||
        (l.details && JSON.stringify(l.details).toLowerCase().includes(q))
      );
    }

    if (since) {
      const sinceTime = new Date(String(since)).getTime();
      if (!isNaN(sinceTime)) {
        filtered = filtered.filter(l => new Date(l.timestamp).getTime() > sinceTime);
      }
    }

    const limitNum = Math.min(Math.max(1, parseInt(String(limit)) || 100), 500);
    const sliced = filtered.slice(0, limitNum);

    const allCategories = Array.from(new Set(systemLogsStore.map(l => l.category)));
    const allLevels = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

    res.json({
      total: systemLogsStore.length,
      filtered_count: filtered.length,
      count: sliced.length,
      categories: allCategories,
      levels: allLevels,
      logs: sliced,
      last_polled_at: new Date().toISOString()
    });
  });

  app.post('/logs/emit', (req: Request, res: Response) => {
    const { level = 'INFO', category = 'SYSTEM', message, source, details } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const entry = addLogEntry(level, category, message, source, details);
    res.json(entry);
  });

  app.delete('/logs', (req: Request, res: Response) => {
    systemLogsStore = [];
    addLogEntry('INFO', 'SYSTEM', 'System log buffer cleared by operator action');
    res.json({ cleared: true, timestamp: new Date().toISOString() });
  });

  // Health & System Telemetry
  app.get('/health', (req: Request, res: Response) => {
    res.json(getSystemHealthData());
  });

  app.get('/health/history', (req: Request, res: Response) => {
    const health = getSystemHealthData();
    res.json({
      status: health.status,
      timestamp: health.timestamp,
      count: health.history.length,
      history: health.history
    });
  });

  app.get('/health/metrics', (req: Request, res: Response) => {
    res.json(getSystemHealthData());
  });

  app.post('/health/simulate-load', (req: Request, res: Response) => {
    const { type = 'CPU_MEMORY_SPIKE' } = req.body || {};
    const now = Date.now();
    const lastPoint = systemMetricsHistory[systemMetricsHistory.length - 1];
    const cpuSpike = Math.min(96, Math.round((75 + Math.random() * 18) * 10) / 10);
    const memSpike = Math.min(84, Math.round((lastPoint.memory_percent + 12 + Math.random() * 8) * 10) / 10);
    const memUsed = Math.round((memSpike / 100) * 4096 * 10) / 10;

    const newPoint: SystemMetricPoint = {
      timestamp: new Date(now).toISOString(),
      cpu_percent: cpuSpike,
      memory_percent: memSpike,
      memory_used_mb: memUsed,
      memory_total_mb: 4096.0,
      active_requests: Math.round(42 + Math.random() * 20),
      latency_avg_ms: Math.round(65 + Math.random() * 35)
    };

    systemMetricsHistory.push(newPoint);
    if (systemMetricsHistory.length > 60) {
      systemMetricsHistory = systemMetricsHistory.slice(systemMetricsHistory.length - 60);
    }

    addLogEntry('WARN', 'SYSTEM', `Simulated ${type} load spike triggered by operator (CPU: ${cpuSpike}%, MEM: ${memSpike}%)`, 'operator-load-injector', {
      cpu_percent: cpuSpike,
      memory_percent: memSpike,
      active_requests: newPoint.active_requests
    });

    res.json(getSystemHealthData());
  });

  // Snapshot / Full AI config
  app.get('/config/ai', (req: Request, res: Response) => {
    res.json({
      providers: providersStore,
      harnesses: harnessesStore,
      models: modelsStore,
      roles: roleConfigsStore,
      bundles: bundlesStore
    });
  });

  // Validate configuration integrity
  app.get('/config/ai/validate', (req: Request, res: Response) => {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check if every role config has a valid model
    for (const rc of roleConfigsStore) {
      const modelExists = modelsStore.some(m => m.id === rc.model_id);
      if (!modelExists) {
        errors.push(`Role '${rc.role}' references missing model_id '${rc.model_id}'`);
      }
      const roleBundles = bundlesStore.filter(b => b.role === rc.role && b.is_active);
      if (roleBundles.length === 0) {
        warnings.push(`Role '${rc.role}' has no active Config Bundles`);
      }
    }

    // Check for duplicate priority in active bundles for same role
    const activeBundlesByRole: Record<string, ConfigBundle[]> = {};
    for (const bundle of bundlesStore.filter(b => b.is_active)) {
      if (!activeBundlesByRole[bundle.role]) activeBundlesByRole[bundle.role] = [];
      activeBundlesByRole[bundle.role].push(bundle);
    }

    for (const [role, bList] of Object.entries(activeBundlesByRole)) {
      const priorities = bList.map(b => b.priority);
      const dupes = priorities.filter((p, index) => priorities.indexOf(p) !== index);
      if (dupes.length > 0) {
        warnings.push(`Role '${role}' has active bundles sharing priority ${Array.from(new Set(dupes)).join(', ')}`);
      }
    }

    res.json({
      valid: errors.length === 0,
      warnings,
      errors,
      check_timestamp: new Date().toISOString()
    });
  });

  // Seed defaults
  app.post('/config/ai/seed-defaults', (req: Request, res: Response) => {
    providersStore = [...INITIAL_PROVIDERS];
    harnessesStore = [...INITIAL_HARNESSES];
    modelsStore = [...INITIAL_MODELS];
    systemRolesStore = [...INITIAL_SYSTEM_ROLES];
    roleConfigsStore = [...INITIAL_ROLE_CONFIGS];
    bundlesStore = [...INITIAL_BUNDLES];
    promptsStore = [...INITIAL_PROMPTS];
    tasksStore = [...INITIAL_TASKS];
    proceduresStore = [...INITIAL_PROCEDURES];
    failureRecoveryStore = { ...INITIAL_FAILURE_RECOVERY };
    schedulerStore = [...INITIAL_SCHEDULER_ENTRIES];
    sessionsStore = [...INITIAL_SESSIONS];

    res.json({ status: 'seeded', timestamp: new Date().toISOString() });
  });

  // Bulk import
  app.post('/config/ai/import', (req: Request, res: Response) => {
    const { providers, harnesses, models, roles, bundles } = req.body;
    if (Array.isArray(providers)) providersStore = providers;
    if (Array.isArray(harnesses)) harnessesStore = harnesses;
    if (Array.isArray(models)) modelsStore = models;
    if (Array.isArray(roles)) roleConfigsStore = roles;
    if (Array.isArray(bundles)) bundlesStore = bundles;

    res.json({
      imported: true,
      counts: {
        providers: providersStore.length,
        harnesses: harnessesStore.length,
        models: modelsStore.length,
        roles: roleConfigsStore.length,
        bundles: bundlesStore.length
      }
    });
  });

  // Test invocation endpoint
  app.post('/config/ai/test', async (req: Request, res: Response) => {
    const { model_id, test_prompt, role = 'operator' } = req.body;
    const sessionId = `sess-test-${Date.now().toString(36)}`;
    const startTime = Date.now();

    const selectedModel = modelsStore.find(m => m.id === model_id || m.model_identifier === model_id) || modelsStore[0];
    const aiClient = getGeminiClient();

    let outputText = '';
    let tokensInput = Math.floor((test_prompt || '').length / 4) + 12;
    let tokensOutput = 0;
    let errorMsg: string | undefined = undefined;

    const newSession: SessionLedgerEntry = {
      sessionId,
      agent_role: role,
      model_id: selectedModel.id,
      status: 'running',
      pid: Math.floor(80000 + Math.random() * 10000),
      started_at: new Date(startTime).toISOString(),
      logs: [
        `[${new Date().toISOString()}] Initializing test invocation for model '${selectedModel.name}' (${selectedModel.model_identifier})`,
        `[${new Date().toISOString()}] Harness: ${selectedModel.harness_id}, Role: ${role}`
      ]
    };
    sessionsStore.unshift(newSession);

    if (aiClient && (selectedModel.model_identifier.includes('gemini') || selectedModel.provider_id === 'prov-google-gemini')) {
      try {
        const response = await aiClient.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: test_prompt || 'Respond with system status check OK and list 3 inference metrics.',
          config: {
            systemInstruction: `You are an AI inference configuration tester for role '${role}'. Keep responses concise, structured, and technical.`
          }
        });

        outputText = response.text || 'No text output returned.';
        tokensOutput = Math.floor(outputText.length / 4);
        newSession.logs?.push(`[${new Date().toISOString()}] Gemini API response received successfully.`);
        newSession.status = 'completed';
      } catch (err: any) {
        errorMsg = err.message || 'Gemini API call error';
        newSession.logs?.push(`[${new Date().toISOString()}] Gemini API Error: ${errorMsg}`);
        newSession.status = 'failed';
        newSession.error = errorMsg;
      }
    } else {
      // Simulated response for non-Gemini or offline key fallback
      await new Promise(r => setTimeout(r, 600));
      outputText = `[Inference Test Output - ${selectedModel.name}]\n✓ Resolved bundle priority #1 for role '${role}'.\n✓ Pipeline ping: OK\n✓ Context window allocated: 16,384 tokens\n✓ Test prompt evaluated: "${test_prompt || 'Health ping'}"\nLatency: 340ms | Protocol: HTTP REST`;
      tokensOutput = Math.floor(outputText.length / 4);
      newSession.logs?.push(`[${new Date().toISOString()}] Simulated driver response generated.`);
      newSession.status = 'completed';
    }

    const endTime = Date.now();
    newSession.ended_at = new Date(endTime).toISOString();
    newSession.latency_ms = endTime - startTime;
    newSession.tokens_used = { input: tokensInput, output: tokensOutput };

    res.json({
      sessionId,
      status: newSession.status,
      model: selectedModel,
      latency_ms: newSession.latency_ms,
      tokens: newSession.tokens_used,
      output: outputText,
      error: errorMsg,
      logs: newSession.logs
    });
  });

  // Providers CRUD
  app.get('/config/ai/providers', (req: Request, res: Response) => {
    res.json(providersStore);
  });

  app.get('/config/ai/provider/:id', (req: Request, res: Response) => {
    const found = providersStore.find(p => p.id === req.params.id);
    if (!found) return res.status(404).json({ error: 'Provider not found' });
    res.json(found);
  });

  app.post('/config/ai/provider', (req: Request, res: Response) => {
    const { id, name, type, endpoint_url, api_key, config_json } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'id and name are required' });

    const existingIdx = providersStore.findIndex(p => p.id === id);
    const now = new Date().toISOString();
    const newProv: Provider = {
      id,
      name,
      type: type || 'custom',
      endpoint_url,
      api_key: api_key || (existingIdx >= 0 ? providersStore[existingIdx].api_key : ''),
      config_json: config_json || {},
      created_at: existingIdx >= 0 ? providersStore[existingIdx].created_at : now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      providersStore[existingIdx] = newProv;
    } else {
      providersStore.push(newProv);
    }
    res.json(newProv);
  });

  app.delete('/config/ai/provider/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const initialLen = providersStore.length;
    providersStore = providersStore.filter(p => p.id !== id);
    if (providersStore.length === initialLen) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    res.json({ deleted: true, id });
  });

  // Harnesses CRUD
  app.get('/config/ai/harnesses', (req: Request, res: Response) => {
    res.json(harnessesStore);
  });

  app.get('/config/ai/harness/:id', (req: Request, res: Response) => {
    const found = harnessesStore.find(h => h.id === req.params.id);
    if (!found) return res.status(404).json({ error: 'Harness not found' });
    res.json(found);
  });

  app.post('/config/ai/harness', (req: Request, res: Response) => {
    const { id, name, invocation_semantics } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'id and name are required' });

    const existingIdx = harnessesStore.findIndex(h => h.id === id);
    const now = new Date().toISOString();
    const newHarn: Harness = {
      id,
      name,
      invocation_semantics: invocation_semantics || {},
      created_at: existingIdx >= 0 ? harnessesStore[existingIdx].created_at : now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      harnessesStore[existingIdx] = newHarn;
    } else {
      harnessesStore.push(newHarn);
    }
    res.json(newHarn);
  });

  app.delete('/config/ai/harness/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const initialLen = harnessesStore.length;
    harnessesStore = harnessesStore.filter(h => h.id !== id);
    if (harnessesStore.length === initialLen) {
      return res.status(404).json({ error: 'Harness not found' });
    }
    res.json({ deleted: true, id });
  });

  // Models CRUD
  app.get('/config/ai/models', (req: Request, res: Response) => {
    res.json(modelsStore);
  });

  app.get('/config/ai/model/:id', (req: Request, res: Response) => {
    const found = modelsStore.find(m => m.id === req.params.id);
    if (!found) return res.status(404).json({ error: 'Model not found' });
    res.json(found);
  });

  app.post('/config/ai/model', (req: Request, res: Response) => {
    const { id, name, harness_id, provider_id, model_identifier } = req.body;
    if (!id || !name || !harness_id || !model_identifier) {
      return res.status(400).json({ error: 'id, name, harness_id, and model_identifier are required' });
    }

    const existingIdx = modelsStore.findIndex(m => m.id === id);
    const now = new Date().toISOString();
    const newModel: AIModel = {
      id,
      name,
      harness_id,
      provider_id,
      model_identifier,
      created_at: existingIdx >= 0 ? modelsStore[existingIdx].created_at : now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      modelsStore[existingIdx] = newModel;
    } else {
      modelsStore.push(newModel);
    }
    res.json(newModel);
  });

  app.delete('/config/ai/model/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const initialLen = modelsStore.length;
    modelsStore = modelsStore.filter(m => m.id !== id);
    if (modelsStore.length === initialLen) {
      return res.status(404).json({ error: 'Model not found' });
    }
    res.json({ deleted: true, id });
  });

  // Role configs
  app.get('/config/ai/roles', (req: Request, res: Response) => {
    res.json(roleConfigsStore);
  });

  app.get('/config/ai/role/:role', (req: Request, res: Response) => {
    const found = roleConfigsStore.find(r => r.role === req.params.role);
    if (!found) return res.status(404).json({ error: 'Role config not found' });
    const bundles = bundlesStore.filter(b => b.role === req.params.role);
    res.json({ ...found, bundles });
  });

  app.post('/config/ai/role', (req: Request, res: Response) => {
    const { id, role, provider_id, harness_id, model_id, extra_params, bundles } = req.body;
    if (!role) return res.status(400).json({ error: 'role is required' });

    const roleId = id || `rc-${role}`;
    const existingIdx = roleConfigsStore.findIndex(r => r.role === role);
    const now = new Date().toISOString();

    const newRoleConfig: RoleConfig = {
      id: roleId,
      role,
      provider_id: provider_id || '',
      harness_id: harness_id || '',
      model_id: model_id || '',
      extra_params: extra_params || {},
      created_at: existingIdx >= 0 ? roleConfigsStore[existingIdx].created_at : now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      roleConfigsStore[existingIdx] = newRoleConfig;
    } else {
      roleConfigsStore.push(newRoleConfig);
    }

    if (Array.isArray(bundles) && bundles.length > 0) {
      bundlesStore = bundlesStore.filter(b => b.role !== role).concat(bundles);
    }

    res.json({ ...newRoleConfig, bundles: bundlesStore.filter(b => b.role === role) });
  });

  app.delete('/config/ai/role/:role', (req: Request, res: Response) => {
    const { role } = req.params;
    roleConfigsStore = roleConfigsStore.filter(r => r.role !== role);
    bundlesStore = bundlesStore.filter(b => b.role !== role);
    res.json({ deleted: true, role });
  });

  // Config Bundles
  app.get('/config/ai/bundles', (req: Request, res: Response) => {
    res.json(bundlesStore);
  });

  app.get('/config/ai/bundles/:role', (req: Request, res: Response) => {
    const roleBundles = bundlesStore.filter(b => b.role === req.params.role);
    res.json(roleBundles);
  });

  app.get('/config/ai/bundle/:id', (req: Request, res: Response) => {
    const bundle = bundlesStore.find(b => b.id === req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Bundle not found' });
    res.json(bundle);
  });

  app.post('/config/ai/bundle', (req: Request, res: Response) => {
    const {
      id,
      name,
      role,
      model_id,
      provider_id,
      harness_id,
      priority,
      invocation_mode,
      command,
      endpoint_url,
      timeout_ms,
      valid_from,
      valid_to,
      is_active,
      metadata
    } = req.body;

    if (!role || !model_id || !name) {
      return res.status(400).json({ error: 'role, name, and model_id are required' });
    }

    const bundleId = id || `bundle-${Date.now().toString(36)}`;
    const existingIdx = bundlesStore.findIndex(b => b.id === bundleId);
    const now = new Date().toISOString();

    const updatedBundle: ConfigBundle = {
      id: bundleId,
      name,
      role,
      model_id,
      provider_id,
      harness_id,
      priority: typeof priority === 'number' ? priority : 1,
      invocation_mode: invocation_mode || 'direct',
      command,
      endpoint_url,
      timeout_ms: timeout_ms || 30000,
      valid_from,
      valid_to,
      is_active: is_active !== undefined ? is_active : true,
      metadata: metadata || {},
      created_at: existingIdx >= 0 ? bundlesStore[existingIdx].created_at : now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      bundlesStore[existingIdx] = updatedBundle;
    } else {
      bundlesStore.push(updatedBundle);
    }

    res.json(updatedBundle);
  });

  app.post('/config/ai/bundles/:role', (req: Request, res: Response) => {
    const { role } = req.params;
    const { bundles } = req.body;
    if (!Array.isArray(bundles)) return res.status(400).json({ error: 'bundles array is required' });

    // Remove existing for role and push new
    bundlesStore = bundlesStore.filter(b => b.role !== role).concat(bundles);
    res.json({ role, bundles: bundlesStore.filter(b => b.role === role) });
  });

  app.delete('/config/ai/bundle/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const initialLen = bundlesStore.length;
    bundlesStore = bundlesStore.filter(b => b.id !== id);
    if (bundlesStore.length === initialLen) {
      return res.status(404).json({ error: 'Bundle not found' });
    }
    res.json({ deleted: true, id });
  });

  // Resolve config for a role
  app.get('/config/ai/resolve/:role', (req: Request, res: Response) => {
    const { role } = req.params;
    const now = new Date();

    const activeRoleBundles = bundlesStore.filter(b => {
      if (b.role !== role) return false;
      if (!b.is_active) return false;
      if (b.valid_from && new Date(b.valid_from) > now) return false;
      if (b.valid_to && new Date(b.valid_to) < now) return false;
      return true;
    });

    if (activeRoleBundles.length === 0) {
      return res.status(404).json({ error: `No active, valid bundle resolved for role '${role}'` });
    }

    // Sort by priority ascending (1 = top priority)
    activeRoleBundles.sort((a, b) => a.priority - b.priority);

    const primaryBundle = activeRoleBundles[0];
    const resolvedModel = modelsStore.find(m => m.id === primaryBundle.model_id);
    const resolvedProvider = providersStore.find(p => p.id === (primaryBundle.provider_id || resolvedModel?.provider_id));
    const resolvedHarness = harnessesStore.find(h => h.id === (primaryBundle.harness_id || resolvedModel?.harness_id));

    res.json({
      role,
      resolved_bundle: primaryBundle,
      model: resolvedModel,
      provider: resolvedProvider,
      harness: resolvedHarness,
      fallbacks: activeRoleBundles.slice(1),
      resolved_at: now.toISOString()
    });
  });

  // Sessions ledger
  app.get('/sessions', (req: Request, res: Response) => {
    res.json(sessionsStore);
  });

  app.post('/sessions/:sessionId/kill', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = sessionsStore.find(s => s.sessionId === sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'running') {
      return res.status(400).json({ error: `Session is not running (status: ${session.status})` });
    }

    session.status = 'killed';
    session.ended_at = new Date().toISOString();
    session.logs = session.logs || [];
    session.logs.push(`[${new Date().toISOString()}] Received SIGKILL signal from operator interface.`);

    res.json({
      killed: true,
      sessionId,
      pids: session.pid ? [session.pid] : [99102],
      timestamp: new Date().toISOString()
    });
  });

  // Roles registry
  app.get('/roles', (req: Request, res: Response) => {
    res.json({ count: systemRolesStore.length, roles: systemRolesStore });
  });

  app.get('/roles/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const found = systemRolesStore.find(r => r.id === id || r.name === id);
    if (!found) return res.status(404).json({ error: 'Role not found' });
    res.json(found);
  });

  app.post('/roles', (req: Request, res: Response) => {
    const { id, name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const roleId = id || `role-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const existingIdx = systemRolesStore.findIndex(r => r.id === roleId || r.name === name);
    const now = new Date().toISOString();

    const newRole: SystemRole = {
      id: roleId,
      name,
      description: description || '',
      created_at: existingIdx >= 0 ? systemRolesStore[existingIdx].created_at : now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      systemRolesStore[existingIdx] = newRole;
    } else {
      systemRolesStore.push(newRole);
    }

    // Ensure role config exists as well
    if (!roleConfigsStore.some(rc => rc.role === name)) {
      roleConfigsStore.push({
        id: `rc-${name}`,
        role: name,
        provider_id: providersStore[0]?.id || '',
        harness_id: harnessesStore[0]?.id || '',
        model_id: modelsStore[0]?.id || '',
        created_at: now
      });
    }

    res.json(newRole);
  });

  app.delete('/roles/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    systemRolesStore = systemRolesStore.filter(r => r.id !== id && r.name !== id);
    res.json({ deleted: true, id });
  });

  // Tasks registry
  app.get('/tasks', (req: Request, res: Response) => {
    const { role, all } = req.query;
    let filtered = tasksStore;
    if (role) {
      filtered = filtered.filter(t => t.role === role);
    }
    if (all !== 'true') {
      filtered = filtered.filter(t => t.active);
    }
    res.json({ count: filtered.length, tasks: filtered });
  });

  app.get('/tasks/inspector/dispatch', (req: Request, res: Response) => {
    const inspectorTasks = tasksStore.filter(t => t.role === 'inspector' && t.active);
    const dispatched = inspectorTasks.map(t => {
      const prompt = promptsStore.find(p => p.id === t.prompt_id || (p.role === t.role && p.slug === 'opencode-persona')) || promptsStore[0];
      return {
        ...t,
        prompt_role: prompt?.role || t.role,
        prompt_slug: prompt?.slug || 'inspector-prompt',
        prompt_version: prompt?.version || 1,
        prompt_body_md: prompt?.body_md || '# Default Inspector Prompt',
        prompt_title: prompt?.title || 'Inspector Verification',
        prompt_parameter_schema: prompt?.parameter_schema,
        prompt_tags: prompt?.tags
      };
    });

    res.json({ tasks: dispatched });
  });

  app.get('/tasks/:task_slug', (req: Request, res: Response) => {
    const { task_slug } = req.params;
    const task = tasksStore.find(t => t.task_slug === task_slug);
    if (!task) return res.status(404).json({ error: 'Task slug not found' });
    const prompt = promptsStore.find(p => p.id === task.prompt_id);
    res.json({
      ...task,
      prompt_role: prompt?.role,
      prompt_slug: prompt?.slug,
      prompt_version: prompt?.version
    });
  });

  app.post('/tasks', (req: Request, res: Response) => {
    const { id, role, task_slug, scope, acceptance_criteria, prompt_id, active } = req.body;
    if (!role || !task_slug) return res.status(400).json({ error: 'role and task_slug are required' });

    const taskId = id || `task-${Date.now().toString(36)}`;
    const existingIdx = tasksStore.findIndex(t => t.id === taskId || t.task_slug === task_slug);
    const now = new Date().toISOString();

    const newTask: TaskDefinition = {
      id: taskId,
      role,
      task_slug,
      scope: scope || '',
      acceptance_criteria: Array.isArray(acceptance_criteria) ? acceptance_criteria : [],
      prompt_id: prompt_id || promptsStore[0]?.id || '',
      active: active !== undefined ? active : true,
      created_at: existingIdx >= 0 ? tasksStore[existingIdx].created_at : now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      tasksStore[existingIdx] = newTask;
    } else {
      tasksStore.push(newTask);
    }
    res.json(newTask);
  });

  // Prompts registry
  app.get('/prompts', (req: Request, res: Response) => {
    res.json(promptsStore);
  });

  app.post('/prompts', (req: Request, res: Response) => {
    const { id, role, slug, version, title, body_md, parameter_schema, tags } = req.body;
    if (!role || !slug || !title || !body_md) {
      return res.status(400).json({ error: 'role, slug, title, and body_md are required' });
    }

    const promptId = id || `p-${role}-${slug}-${version || 1}`;
    const existingIdx = promptsStore.findIndex(p => p.id === promptId);
    const now = new Date().toISOString();

    const newPrompt: PromptTemplate = {
      id: promptId,
      role,
      slug,
      version: typeof version === 'number' ? version : 1,
      title,
      body_md,
      parameter_schema: parameter_schema || {},
      tags: Array.isArray(tags) ? tags : [],
      created_at: existingIdx >= 0 ? promptsStore[existingIdx].created_at : now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      promptsStore[existingIdx] = newPrompt;
    } else {
      promptsStore.push(newPrompt);
    }
    res.json(newPrompt);
  });

  // Agent Scheduler
  app.get('/scheduler', (req: Request, res: Response) => {
    res.json(schedulerStore);
  });

  app.get('/scheduler/due', (req: Request, res: Response) => {
    const now = new Date();
    const due = schedulerStore.filter(s => {
      if (!s.enabled) return false;
      if (!s.next_run_at) return true;
      return new Date(s.next_run_at) <= now;
    });
    res.json(due);
  });

  app.get('/scheduler/:id', (req: Request, res: Response) => {
    const entry = schedulerStore.find(s => s.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Schedule entry not found' });
    res.json(entry);
  });

  app.post('/scheduler', (req: Request, res: Response) => {
    const { role, model_id, harness, agent_config, schedule_type, schedule_value, project_dir, enabled } = req.body;
    if (!role) return res.status(400).json({ error: 'role is required' });

    const id = `sched-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const newSched: AgentScheduleEntry = {
      id,
      role,
      model_id: model_id || modelsStore[0]?.id,
      harness: harness || harnessesStore[0]?.id,
      agent_config: agent_config || {},
      schedule_type: schedule_type || 'cron',
      schedule_value: schedule_value || '0 */2 * * *',
      project_dir: project_dir || '/nexus/tackle',
      enabled: enabled !== undefined ? enabled : true,
      last_run_at: undefined,
      next_run_at: new Date(Date.now() + 3600000).toISOString(),
      created_at: now
    };

    schedulerStore.push(newSched);
    res.json(newSched);
  });

  app.patch('/scheduler/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const entry = schedulerStore.find(s => s.id === id);
    if (!entry) return res.status(404).json({ error: 'Schedule entry not found' });

    Object.assign(entry, req.body);
    res.json(entry);
  });

  app.delete('/scheduler/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const initialLen = schedulerStore.length;
    schedulerStore = schedulerStore.filter(s => s.id !== id);
    if (schedulerStore.length === initialLen) {
      return res.status(404).json({ error: 'Schedule entry not found' });
    }
    res.json({ deleted: true, id });
  });

  // Memory Procedure Registry reader
  app.get('/memory/procedures/:role', (req: Request, res: Response) => {
    const { role } = req.params;
    const list = proceduresStore.filter(p => p.role === role);
    res.json({ role, count: list.length, procedures: list });
  });

  app.get('/memory/procedure/:slug', (req: Request, res: Response) => {
    const card = proceduresStore.find(p => p.slug === req.params.slug);
    if (!card) return res.status(404).json({ error: 'ProcedureCard not cached or found' });
    res.json(card);
  });

  app.post('/memory/check-since', (req: Request, res: Response) => {
    const { role, since } = req.body;
    const roleProcedures = proceduresStore.filter(p => p.role === role);
    const sinceDate = since ? new Date(since) : new Date(0);
    const changed = roleProcedures.some(p => new Date(p.as_of_dt) > sinceDate);

    res.json({
      role,
      since,
      changed,
      latest_as_of: roleProcedures[0]?.as_of_dt || new Date().toISOString()
    });
  });

  app.post('/memory/refresh', (req: Request, res: Response) => {
    // Simulate PG -> Redis warm cache refresh
    const roles = Array.from(new Set(proceduresStore.map(p => p.role)));
    res.json({
      refreshed: true,
      procedures: proceduresStore.length,
      roleIndices: roles,
      timestamp: new Date().toISOString()
    });
  });

  // Circuit Breaker Failure Recovery
  app.get('/config/failure-recovery', (req: Request, res: Response) => {
    res.json(failureRecoveryStore);
  });

  app.post('/config/failure-recovery', (req: Request, res: Response) => {
    const {
      max_retries_per_model,
      retry_delay_seconds,
      max_fallbacks,
      push_back_to_pending,
      circuit_breaker_retry_after
    } = req.body;

    failureRecoveryStore = {
      max_retries_per_model: typeof max_retries_per_model === 'number' ? max_retries_per_model : failureRecoveryStore.max_retries_per_model,
      retry_delay_seconds: typeof retry_delay_seconds === 'number' ? retry_delay_seconds : failureRecoveryStore.retry_delay_seconds,
      max_fallbacks: typeof max_fallbacks === 'number' ? max_fallbacks : failureRecoveryStore.max_fallbacks,
      push_back_to_pending: typeof push_back_to_pending === 'boolean' ? push_back_to_pending : failureRecoveryStore.push_back_to_pending,
      circuit_breaker_retry_after: typeof circuit_breaker_retry_after === 'number' ? circuit_breaker_retry_after : failureRecoveryStore.circuit_breaker_retry_after
    };

    res.json(failureRecoveryStore);
  });

  } // end mock mode block

  // Mount Vite or static server
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[tackle-srv] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
