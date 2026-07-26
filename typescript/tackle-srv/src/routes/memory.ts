import { Router } from "express";
import {
  getProceduresForRole,
  getProcedureBySlug,
  triggerRefresh,
  hasRoleMemoryChangedSince,
} from "../memory";
import { getDb } from "../db";

export const memoryRouter = Router();

memoryRouter.get("/procedures/:role", async (req, res) => {
  try {
    const procedures = await getProceduresForRole(req.params.role);
    res.json({ role: req.params.role, count: procedures.length, procedures });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

memoryRouter.get("/procedure/:slug", async (req, res) => {
  try {
    const card = await getProcedureBySlug(req.params.slug);
    if (!card) {
      res.status(404).json({ error: `Procedure '${req.params.slug}' not found` });
      return;
    }
    res.json(card);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

memoryRouter.post("/check-since", async (req, res) => {
  try {
    const { role, since } = req.body || {};
    if (!role || !since) {
      res.status(400).json({ error: "role and since are required" });
      return;
    }
    const pool = getDb();
    const changed = await hasRoleMemoryChangedSince(pool, role, since);
    res.json({ role, since, changed });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

memoryRouter.post("/refresh", async (_req, res) => {
  try {
    const result = await triggerRefresh();
    if (!result.success) {
      res.status(500).json({ error: `Refresh failed: ${result.error}` });
      return;
    }
    res.json({
      refreshed: true,
      procedures: result.result?.procedures ?? 0,
      roleIndices: result.result?.roleIndices ?? 0,
      timestamp: result.result?.timestamp ?? new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
