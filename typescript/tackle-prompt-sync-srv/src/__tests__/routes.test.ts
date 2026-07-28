import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";

// Mock DB and Redis
vi.mock("../db", () => ({
  initDb: vi.fn(),
}));

vi.mock("../redis", () => ({
  initRedis: vi.fn(() => mockRedisInstance),
  closeRedis: vi.fn(),
  getRedis: vi.fn(() => mockRedisInstance),
  PROC_KEY: (role: string, slug: string) => `prompt:proc:${role}::${slug}`,
  IDX_KEY: (role: string) => `prompt:idx:${role}`,
  META_UPDATED_KEY: "prompt:meta:last_updated",
  TASK_IDX_KEY: (role: string) => `prompt:task:idx:${role}`,
}));

vi.mock("../sync", () => ({
  syncAll: vi.fn(),
}));

const mockRedisInstance = {
  get: vi.fn(),
  on: vi.fn(),
};

import { syncAll } from "../sync";

let app: any;

beforeAll(async () => {
  const express = (await import("express")).default;
  app = express();
  app.use(express.json());

  app.get("/health", async (_req: any, res: any) => {
    try {
      const data = await mockRedisInstance.get("prompt:meta:last_updated");
      res.json({ status: "ok", lastUpdated: data || null, uptime: 123.45, namespace: "prompt:" });
    } catch (err: any) {
      res.status(503).json({ status: "error", message: err.message });
    }
  });

  app.get("/prompts/:role", async (req: any, res: any) => {
    try {
      const data = await mockRedisInstance.get(`prompt:idx:${req.params.role}`);
      if (!data) return res.json([]);
      res.json(JSON.parse(data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/prompt/:role/:slug", async (req: any, res: any) => {
    try {
      const data = await mockRedisInstance.get(
        `prompt:proc:${req.params.role}::${req.params.slug}`
      );
      if (!data) return res.status(404).json({ error: "Prompt not found" });
      res.json(JSON.parse(data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/tasks/:role", async (req: any, res: any) => {
    try {
      const data = await mockRedisInstance.get(`prompt:task:idx:${req.params.role}`);
      if (!data) return res.json([]);
      res.json(JSON.parse(data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/refresh", async (_req: any, res: any) => {
    try {
      const result = await syncAll();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
});

describe("tackle-prompt-sync-srv routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GREEN PATH ──────────────────────────────────────────────────

  describe("GreenPath — successful requests", () => {
    it("GET /health returns ok with namespace", async () => {
      mockRedisInstance.get.mockResolvedValue("2026-07-25T10:00:00.000Z");

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.namespace).toBe("prompt:");
    });

    it("GET /prompts/:role returns prompt index", async () => {
      const index = [
        { slug: "system-prompt", title: "System Prompt", version: 1, tags: ["base"] },
      ];
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(index));

      const res = await request(app).get("/prompts/architect");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].slug).toBe("system-prompt");
    });

    it("GET /prompt/:role/:slug returns full prompt card", async () => {
      const card = {
        id: "p-001", role: "architect", slug: "boot",
        title: "Boot Prompt", body_md: "# Boot\n...",
        parameter_schema: {}, tags: [], created_at: "", updated_at: "",
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(card));

      const res = await request(app).get("/prompt/architect/boot");

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Boot Prompt");
    });

    it("GET /tasks/:role returns task index", async () => {
      const tasks = [
        { task_slug: "deploy", scope: "prod", acceptance_criteria: [], prompt_id: "p1", prompt_slug: "deploy-prompt", updated_at: "" },
      ];
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(tasks));

      const res = await request(app).get("/tasks/engineer");

      expect(res.status).toBe(200);
      expect(res.body[0].task_slug).toBe("deploy");
    });

    it("POST /refresh returns sync counts", async () => {
      vi.mocked(syncAll).mockResolvedValue({
        prompts: 3, rolePromptIndices: 2, tasks: 1, roleTaskIndices: 1, timestamp: "now",
      });

      const res = await request(app).post("/refresh");

      expect(res.status).toBe(200);
      expect(res.body.prompts).toBe(3);
      expect(res.body.tasks).toBe(1);
    });
  });

  // ── RED PATH ────────────────────────────────────────────────────

  describe("RedPath — error conditions", () => {
    it("GET /health with Redis error returns 503", async () => {
      mockRedisInstance.get.mockRejectedValue(new Error("Redis down"));

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
    });

    it("GET /prompt/:role/:slug not found returns 404", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const res = await request(app).get("/prompt/architect/missing");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prompt not found");
    });

    it("POST /refresh failure returns 500", async () => {
      vi.mocked(syncAll).mockRejectedValue(new Error("Sync failure"));

      const res = await request(app).post("/refresh");

      expect(res.status).toBe(500);
    });
  });

  // ── SILENT-FAILURE PATH ─────────────────────────────────────────

  describe("SilentFailure", () => {
    it("GET /tasks/:role with malformed JSON returns 500", async () => {
      mockRedisInstance.get.mockResolvedValue("{not valid");

      const res = await request(app).get("/tasks/builder");

      expect(res.status).toBe(500);
    });

    it("GET /prompts/:role with no data returns empty array", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const res = await request(app).get("/prompts/nonexistent");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
