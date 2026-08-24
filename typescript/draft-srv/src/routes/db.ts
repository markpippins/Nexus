import { Request, Response, Router } from 'express';
import { getDriver, isEngineAvailable, listCapabilities } from '../drivers/registry';
import { ConnSpec } from '../drivers/types';

/**
 * DB Workbench routes — byte-compatible with the contract data-explorer-ui's
 * dbEngine.ts already speaks (relative /api/db/*). Engine selection comes from
 * the request (`engine` field, default postgres) so the UI can add engine
 * pickers later without another contract change.
 */
export function dbWorkbenchRoutes(): Router {
  const router = Router();

  // Engine capability catalog (NEW, additive — lets the UI grey out
  // not-yet-enabled engines instead of failing opaquely).
  router.get('/db/engines', (_req: Request, res: Response) => {
    res.json({ engines: listCapabilities() });
  });

  router.post('/db/test-connection', async (req: Request, res: Response) => {
    const spec = req.body || {};
    const engine = getDriver((req.body || {}).engine);
    if (!engine) return res.status(400).json({ success: false, message: `Unknown engine "${spec.engine}"` });
    if (!engine.capabilities.available) {
      return res.status(501).json({
        success: false,
        message: `Engine "${engine.capabilities.id}" is provisioned but not enabled. Missing: ${engine.capabilities.missingDeps.join(', ') || 'implementation'}`,
      });
    }
    try {
      const result = await engine.testConnection(spec as ConnSpec);
      if (!result.success) return res.status(502).json(result);
      res.json(result);
    } catch (err: any) {
      res.status(err?.code === 'ENGINE_NOT_IMPLEMENTED' ? 501 : 500).json({
        success: false,
        message: err?.message || 'test-connection failed',
      });
    }
  });

  router.post('/db/schemas', async (req: Request, res: Response) => {
    const spec = req.body || {};
    const engine = getDriver(spec.engine);
    if (!engine) return res.status(400).json({ error: `Unknown engine "${spec.engine}"` });
    if (!isEngineAvailable(spec.engine)) {
      return res.status(501).json({ error: `Engine "${engine.capabilities.id}" is not enabled yet` });
    }
    try {
      const result = await engine.discoverSchemas(spec as ConnSpec);
      res.json(result);
    } catch (err: any) {
      res.status(err?.code === 'ENGINE_NOT_IMPLEMENTED' ? 501 : 502).json({
        error: err?.message || 'Schema discovery failed',
      });
    }
  });

  router.post('/db/query', async (req: Request, res: Response) => {
    const { connection, sql } = req.body || {};
    if (!connection || !sql) {
      return res.status(400).json({ error: 'connection and sql are required' });
    }
    const engine = getDriver(connection.engine);
    if (!engine) return res.status(400).json({ error: `Unknown engine "${connection.engine}"` });
    if (!isEngineAvailable(connection.engine)) {
      return res.status(501).json({ error: `Engine "${engine.capabilities.id}" is not enabled yet` });
    }
    try {
      const result = await engine.execute(connection as ConnSpec, String(sql));
      res.json(result); // errors arrive as status:'error' result bodies
    } catch (err: any) {
      res.status(err?.code === 'ENGINE_NOT_IMPLEMENTED' ? 501 : 500).json({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        status: 'error',
        error: err?.message || 'Query failed',
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  });

  return router;
}
