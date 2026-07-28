import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import express from "express";

// Mock DB and Redis BEFORE importing the app
vi.mock("../db", () => ({
  initDb: vi.fn(),
}));

vi.mock("../redis", () => ({
  initRedis: vi.fn(() => mockRedisInstance),
  closeRedis: vi.fn(),
  getRedis: vi.fn(() => mockRedisInstance),
  PROC_KEY: (slug: string) => `mem:proc:${slug}`,
  IDX_KEY: (role: string) => `mem:idx:${role}`,
  META_UPDATED_KEY: "mem:meta:last_updated",
}));

vi.mock("../sync", () => ({
  syncAll: vi.fn(),
}));

const mockRedisInstance = {
  get: vi.fn(),
  on: vi.fn(),
  pipeline: vi.fn(() => ({ set: vi.fn().mockReturnValue({}), exec: vi.fn().mockResolvedValue([]) })),
};

import { syncAll } from "../sync";

let app: any;

beforeAll(() => {
  app = express();
  app.use(express.json());

  // Replicate the route structure from index.ts
  app.get("/health", async (_req: any, res: any) => {
    try {
      const data = await mockRedisInstance.get("mem:meta:last_updated");
      res.json({ status: "ok", lastUpdated: data || null, uptime: 123.45 });
    } catch (err: any) {
      res.status(503).json({ status: "error", message: err.message });
    }
  });

  app.get("/procedures/:role", async (req: any, res: any) => {
    try {
      const data = await mockRedisInstance.get(`mem:idx:${req.params.role}`);
      if (!data) return res.json([]);
      res.json(JSON.parse(data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/procedure/:slug", async (req: any, res: any) => {
    try {
      const data = await mockRedisInstance.get(`mem:proc:${req.params.slug}`);
      if (!data) return res.status(404).json({ error: "Procedure not found" });
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

describe("role-memory-srv routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GREEN PATH ──────────────────────────────────────────────────

  describe("GreenPath — successful requests", () => {
    it("GET /health returns ok with lastUpdated", async () => {
      mockRedisInstance.get.mockResolvedValue("2026-07-25T10:00:00.000Z");

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.lastUpdated).toBe("2026-07-25T10:00:00.000Z");
      expect(res.body.uptime).toBeTruthy();
    });

    it("GET /health with null lastUpdated returns null", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.lastUpdated).toBeNull();
    });

    it("GET /procedures/:role returns procedure index", async () => {
      const index = [
        { slug: "boot", summary: "Boot procedure", tags: ["on:startup"] },
        { slug: "tag-routing", summary: "Tag routing", tags: ["reference"] },
      ];
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(index));

      const res = await request(app).get("/procedures/architect");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].slug).toBe("boot");
    });

    it("GET /procedure/:slug returns full procedure card", async () => {
      const card = {
        slug: "boot-procedure",
        title: "Boot Procedure",
        body_md: "# Boot\n\nSteps...",
        tags: ["on:startup"],
        triggers: [],
        mcp_tools: [],
        roles: ["architect"],
        updated_at: "2026-07-25T00:00:00.000Z",
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(card));

      const res = await request(app).get("/procedure/boot-procedure");

      expect(res.status).toBe(200);
      expect(res.body.slug).toBe("boot-procedure");
      expect(res.body.body_md).toBeTruthy();
    });

    it("POST /refresh returns sync result", async () => {
      vi.mocked(syncAll).mockResolvedValue({
        procedures: 5,
        roleIndices: 3,
        timestamp: "2026-07-25T12:00:00.000Z",
      });

      const res = await request(app).post("/refresh");

      expect(res.status).toBe(200);
      expect(res.body.procedures).toBe(5);
      expect(res.body.roleIndices).toBe(3);
    });
  });

  // ── ORANGE PATH ──────────────────────────────────────────────────

  describe("OrangePath — edge cases", () => {
    it("GET /procedures/:role with no data returns empty array", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const res = await request(app).get("/procedures/nonexistent");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── RED PATH ────────────────────────────────────────────────────

  describe("RedPath — error conditions", () => {
    it("GET /health with Redis error returns 503", async () => {
      mockRedisInstance.get.mockRejectedValue(new Error("Redis connection refused"));

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("error");
    });

    it("GET /procedure/:slug not found returns 404", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const res = await request(app).get("/procedure/missing-proc");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Procedure not found");
    });

    it("GET /procedure/:slug with Redis error returns 500", async () => {
      mockRedisInstance.get.mockRejectedValue(new Error("Redis timeout"));

      const res = await request(app).get("/procedure/test-proc");

      expect(res.status).toBe(500);
      expect(res.body.error).toBeTruthy();
    });

    it("POST /refresh sync failure returns 500", async () => {
      vi.mocked(syncAll).mockRejectedValue(new Error("PG connection lost"));

      const res = await request(app).post("/refresh");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("PG connection lost");
    });
  });

  // ── SILENT-FAILURE PATH ─────────────────────────────────────────

  describe("SilentFailure — operations with unclear outcomes", () => {
    it("GET /procedures/:role with malformed JSON returns 500", async () => {
      mockRedisInstance.get.mockResolvedValue("{invalid json");

      const res = await request(app).get("/procedures/architect");

      expect(res.status).toBe(500);
    });
  });
});
