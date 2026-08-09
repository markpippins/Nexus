import { Router } from "express";
import {
  getAIConfigSnapshot,
  getAIProviders,
  getAIProvider,
  upsertAIProvider,
  deleteAIProvider,
  getAIHarnesses,
  getAIHarness,
  upsertAIHarness,
  deleteAIHarness,
  getAIModels,
  getAIModel,
  upsertAIModel,
  deleteAIModel,
  getAIRoleConfigs,
  getAIRoleConfig,
  upsertAIRoleConfig,
  upsertConfigBundles,
  upsertConfigBundle,
  deleteConfigBundle,
  getAllConfigBundles,
  getConfigBundles,
  getConfigBundle,
  deleteAIRoleConfig,
  seedDefaultAIConfig,
  importAIConfig,
  validateAIConfig,
  getResolvedRoleConfig,
  startSession,
  updateSessionPid,
  getSession,
  endSession,
} from "../db";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export const aiConfigRouter = Router();

// ── Full snapshot ──────────────────────────────────────────────

aiConfigRouter.get("/", async (_req, res) => {
  try {
    res.json(await getAIConfigSnapshot());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Validate ───────────────────────────────────────────────────

aiConfigRouter.get("/validate", async (_req, res) => {
  try {
    const warnings = await validateAIConfig();
    res.json({ valid: warnings.length === 0, warnings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Seed defaults ──────────────────────────────────────────────

aiConfigRouter.post("/seed-defaults", async (req, res) => {
  try {
    const { force } = req.body || {};
    const result = await seedDefaultAIConfig(!!force);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Import full snapshot ───────────────────────────────────────

aiConfigRouter.post("/import", async (req, res) => {
  try {
    const { providers, harnesses, models, roles, bundles } = req.body || {};
    if (!providers && !harnesses && !models && !roles) {
      res.status(400).json({ error: "No import data provided" });
      return;
    }
    const result = await importAIConfig({
      providers: providers || [],
      harnesses: harnesses || [],
      models: models || [],
      roles: roles || [],
      bundles: bundles || [],
    });
    res.json({ imported: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Providers ──────────────────────────────────────────────────

aiConfigRouter.get("/providers", async (_req, res) => {
  try {
    res.json(await getAIProviders());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.get("/provider/:id", async (req, res) => {
  try {
    const provider = await getAIProvider(req.params.id);
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    res.json(provider);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.post("/provider", async (req, res) => {
  try {
    const { id, name, type, endpoint_url, api_key, config_json } = req.body || {};
    if (!id || !name || !type) {
      res.status(400).json({ error: "id, name, and type are required" });
      return;
    }
    await upsertAIProvider({ id, name, type, endpoint_url, api_key, config_json });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.delete("/provider/:id", async (req, res) => {
  try {
    const deleted = await deleteAIProvider(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Harnesses ──────────────────────────────────────────────────

aiConfigRouter.get("/harnesses", async (_req, res) => {
  try {
    res.json(await getAIHarnesses());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.get("/harness/:id", async (req, res) => {
  try {
    const harness = await getAIHarness(req.params.id);
    if (!harness) {
      res.status(404).json({ error: "Harness not found" });
      return;
    }
    res.json(harness);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.post("/harness", async (req, res) => {
  try {
    const { id, name, invocation_semantics } = req.body || {};
    if (!id || !name) {
      res.status(400).json({ error: "id and name are required" });
      return;
    }
    await upsertAIHarness({ id, name, invocation_semantics });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.delete("/harness/:id", async (req, res) => {
  try {
    const deleted = await deleteAIHarness(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Models ─────────────────────────────────────────────────────

aiConfigRouter.get("/models", async (_req, res) => {
  try {
    res.json(await getAIModels());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.get("/model/:id", async (req, res) => {
  try {
    const model = await getAIModel(req.params.id);
    if (!model) {
      res.status(404).json({ error: "Model not found" });
      return;
    }
    res.json(model);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.post("/model", async (req, res) => {
  try {
    const { id, name, harness_id, provider_id, model_identifier } = req.body || {};
    if (!id || !name || !harness_id || !model_identifier) {
      res.status(400).json({ error: "id, name, harness_id, and model_identifier are required" });
      return;
    }
    await upsertAIModel({ id, name, harness_id, provider_id, model_identifier });
    res.json({ saved: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.delete("/model/:id", async (req, res) => {
  try {
    const deleted = await deleteAIModel(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Role Configs ───────────────────────────────────────────────

aiConfigRouter.get("/roles", async (_req, res) => {
  try {
    res.json(await getAIRoleConfigs());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.get("/role/:role", async (req, res) => {
  try {
    const role = await getAIRoleConfig(req.params.role);
    if (!role) {
      res.status(404).json({ error: "Role config not found" });
      return;
    }
    res.json(role);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.post("/role", async (req, res) => {
  try {
    console.log('[tackle-srv] POST /config/ai/role body:', JSON.stringify(req.body, null, 2));
    const { id, role, provider_id, harness_id, model_id, extra_params, bundles } = req.body || {};
    console.log('[tackle-srv] Destructured bundles:', bundles);
    if (!id || !role || !provider_id || !harness_id || !model_id) {
      res.status(400).json({ error: "id, role, provider_id, harness_id, and model_id are required" });
      return;
    }

    if (Array.isArray(bundles) && bundles.length > 0) {
      console.log('[tackle-srv] Saving bundles for role:', role, 'count:', bundles.length);
      await upsertConfigBundles(role, bundles);
    } else {
      await upsertAIRoleConfig({ id, role, provider_id, harness_id, model_id, extra_params });
    }

    res.json({ saved: true, id, role });
  } catch (e: any) {
    console.error('[tackle-srv] Error saving role:', e.message);
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.delete("/role/:role", async (req, res) => {
  try {
    const deleted = await deleteAIRoleConfig(req.params.role);
    res.json({ deleted, role: req.params.role });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Config Bundles ─────────────────────────────────────────────

aiConfigRouter.get("/bundles", async (_req, res) => {
  try {
    res.json(await getAllConfigBundles());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.get("/bundles/:role", async (req, res) => {
  try {
    res.json(await getConfigBundles(req.params.role));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.get("/bundle/:id", async (req, res) => {
  try {
    const bundle = await getConfigBundle(req.params.id);
    if (!bundle) {
      res.status(404).json({ error: "Bundle not found" });
      return;
    }
    res.json(bundle);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.post("/bundle", async (req, res) => {
  try {
    const { id, name, role, model_id, provider_id, harness_id, priority,
            invocation_mode, command, endpoint_url, timeout_ms,
            valid_from, valid_to, is_active, metadata } = req.body || {};
    if (!name || !role || !model_id) {
      res.status(400).json({ error: "name, role, and model_id are required" });
      return;
    }
    // Auto-generate id for new bundles (mock-mode parity: the UI does not
    // send an id when creating). Editing bundles carries an id → upsert.
    const bundleId = id || `bundle-${Date.now().toString(36)}`;
    await upsertConfigBundle({
      id: bundleId, name, role, model_id,
      provider_id, harness_id, priority,
      invocation_mode, command, endpoint_url, timeout_ms,
      valid_from, valid_to, is_active, metadata,
    });
    res.json({ saved: true, id: bundleId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.delete("/bundle/:id", async (req, res) => {
  try {
    const deleted = await deleteConfigBundle(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

aiConfigRouter.post("/bundles/:role", async (req, res) => {
  try {
    const { bundles } = req.body || {};
    if (!Array.isArray(bundles) || bundles.length === 0) {
      res.status(400).json({ error: "bundles array is required" });
      return;
    }
    await upsertConfigBundles(req.params.role, bundles);
    res.json({ saved: true, role: req.params.role, count: bundles.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Resolved Config ────────────────────────────────────────────

aiConfigRouter.get("/resolve/:role", async (req, res) => {
  try {
    const config = await getResolvedRoleConfig(req.params.role);
    if (!config) {
      res.status(404).json({ error: `No config found for role '${req.params.role}'` });
      return;
    }
    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Test Invoke ────────────────────────────────────────────────

aiConfigRouter.post("/test", async (req, res) => {
  try {
    const { model_id, test_prompt } = req.body || {};
    if (!model_id || !test_prompt) {
      res.status(400).json({ error: "model_id and test_prompt are required" });
      return;
    }

    const models = await getAIModels();
    const model = models.find((m: any) => m.id === model_id);
    if (!model) {
      res.status(404).json({ error: `Model ${model_id} not found` });
      return;
    }

    const harnesses = await getAIHarnesses();
    const harness = harnesses.find((h: any) => h.id === model.harness_id);
    if (!harness) {
      res.status(404).json({ error: `Harness ${model.harness_id} not found` });
      return;
    }

    let harnessType = "opencode";
    try {
      const sem = JSON.parse(harness.invocation_semantics || "{}");
      const binary = (sem.binary || "opencode").toLowerCase();
      if (binary.includes("codex")) harnessType = "codex";
      else if (binary.includes("ollama")) harnessType = "ollama";
      else harnessType = "opencode";
    } catch { /* use default */ }

    const now = new Date().toISOString();
    const sessionId = `test-${model_id}-${Date.now()}`;
    await startSession({
      id: sessionId,
      agent_role: "test",
      start_iso: now,
      model: model.model_identifier,
    });

    const projectRoot = process.env.PIPELINE_ROOT || "/home/codex/dev";
    // .conduit-data was deleted 2026-08-09 and mirrored to audit/CONDUIT_DATA
    const sessionsDir = path.join(projectRoot, "nexus", "audit", "CONDUIT_DATA", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionLogPath = path.join(sessionsDir, `${sessionId}.log`);
    const logStream = fs.createWriteStream(sessionLogPath, { flags: "a" });

    const proc = spawn(harnessType, [
      "run", "--model", model.model_identifier,
      "--dir", projectRoot,
      "--print-logs", "--log-level", "ERROR",
      test_prompt,
    ], {
      detached: true,
      stdio: ["ignore", logStream, logStream],
    });
    proc.unref();

    if (proc.pid && proc.pid > 0) {
      await updateSessionPid(sessionId, proc.pid);
    }

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] TEST INVOKE model=${model_id} session=${sessionId} pid=${proc.pid} log=${sessionLogPath}`);

    res.json({
      started: true,
      sessionId,
      model_id,
      model_name: model.name,
      model_identifier: model.model_identifier,
      harness: harnessType,
      logPath: `/log/${sessionId}`,
      timestamp,
    });
  } catch (e: any) {
    console.error(`[${new Date().toISOString()}] TEST INVOKE error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});
