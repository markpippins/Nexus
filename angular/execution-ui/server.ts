import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { mockStore } from './src/services/mockData.ts';

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '4212', 10);

  app.use(express.json());

  // --- API ROUTES (/api/execution) ---

  // 0. Root Readiness Check
  app.get('/health', (req, res) => {
    res.json(mockStore.getRootHealth());
  });

  // 0b. Inline Health Summary
  app.get('/api/execution/health', (req, res) => {
    res.json(mockStore.getInlineHealth());
  });

  // 1. Lifecycle state — the aggregate root
  app.get('/api/execution/requests/:id/state', (req, res) => {
    const state = mockStore.getRequestState(req.params.id);
    if (!state) {
      return res.status(404).json({ error: `Request ${req.params.id} not found` });
    }
    res.json(state);
  });

  // 2. Lease integrity — stale active leases
  app.get('/api/execution/leases/stale', (req, res) => {
    res.json(mockStore.getStaleLeases());
  });

  // 2b. Lease lifecycle
  app.get('/api/execution/leases/:id/lifecycle', (req, res) => {
    const lifecycle = mockStore.getLeaseLifecycle(req.params.id);
    if (!lifecycle) {
      return res.status(404).json({ error: `Lease ${req.params.id} not found` });
    }
    res.json(lifecycle);
  });

  // 3. Cross-table consistency scan
  app.get('/api/execution/health/integrity-scan', (req, res) => {
    res.json(mockStore.getIntegrityScan());
  });

  // 4. Attempt/lease/request tree
  app.get('/api/execution/requests/:id/attempts', (req, res) => {
    const tree = mockStore.getRequestAttemptsTree(req.params.id);
    if (!tree) {
      return res.status(404).json({ error: `Request ${req.params.id} not found` });
    }
    res.json(tree);
  });

  // 4b. Receipts lineage
  app.get('/api/execution/requests/:id/receipts/lineage', (req, res) => {
    const lineage = mockStore.getReceiptsLineage(req.params.id);
    if (!lineage) {
      return res.status(404).json({ error: `Request ${req.params.id} not found` });
    }
    res.json(lineage);
  });

  // 5. Fleet view
  app.get('/api/execution/health/by-executor', (req, res) => {
    const executorId = req.query.executor_id as string | undefined;
    res.json(mockStore.getFleetByExecutor(executorId));
  });

  // 5b. Status distribution
  app.get('/api/execution/health/status-distribution', (req, res) => {
    res.json(mockStore.getStatusDistribution());
  });

  // 6. Pipeline origin (lineage-honest)
  app.get('/api/execution/receipts/:id/pipeline-origin', (req, res) => {
    const origin = mockStore.getPipelineOrigin(req.params.id);
    if (!origin) {
      return res.status(404).json({ error: `Receipt ${req.params.id} not found` });
    }
    res.json(origin);
  });

  // --- VITE MIDDLEWARE SETUP ---
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
    console.log(`[execution-srv] Observability backend listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
