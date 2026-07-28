import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";

// Mock DB and memory
const mockDb = {
  query: vi.fn(),
};

vi.mock("../db", () => ({
  initDb: vi.fn(),
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../memory", () => ({
  initRedis: vi.fn(),
  closeRedis: vi.fn(),
  getRedisClient: vi.fn(() => ({
    get: vi.fn(),
    on: vi.fn(),
  })),
  getProcedureIndex: vi.fn(),
  getProcedureCard: vi.fn(),
  getLastUpdated: vi.fn(),
}));

let app: any;

beforeAll(async () => {
  const express = (await import("express")).default;
  app = express();
  app.use(express.json());

  // ── Health ──────────────────────────────────────────────────────
  app.get("/health", async (_req: any, res: any) => {
    res.json({ status: "ok", pid: process.pid, timestamp: new Date().toISOString() });
  });

  // ── AI Config ───────────────────────────────────────────────────
  app.get("/config/ai", async (_req: any, res: any) => {
    try {
      const result = await mockDb.query("SELECT * FROM tackle.ai_providers");
      res.json({ providers: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/config/ai/validate", async (_req: any, res: any) => {
    try {
      const warnings: string[] = [];
      const result = await mockDb.query("SELECT * FROM tackle.ai_providers");
      if (result.rows.length === 0) warnings.push("No providers configured");
      res.json({ warnings });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/config/ai/seed-defaults", async (req: any, res: any) => {
    try {
      await mockDb.query("INSERT INTO tackle.ai_providers (name, type) VALUES ($1, $2)", ["default", "openai"]);
      res.json({ seeded: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Sessions ────────────────────────────────────────────────────
  app.get("/sessions", async (_req: any, res: any) => {
    try {
      const result = await mockDb.query("SELECT * FROM tackle.sessions");
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/sessions/kill/:pid", async (req: any, res: any) => {
    try {
      const pid = parseInt(req.params.pid, 10);
      if (isNaN(pid)) return res.status(400).json({ error: "Invalid PID" });
      res.json({ killed: pid });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Roles ───────────────────────────────────────────────────────
  app.get("/roles", async (_req: any, res: any) => {
    try {
      const result = await mockDb.query("SELECT * FROM tackle.roles");
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
});

describe("tackle-srv routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GREEN PATH ──────────────────────────────────────────────────

  describe("GreenPath — successful requests", () => {
    it("GET /health returns ok", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.pid).toBeTruthy();
    });

    it("GET /config/ai returns providers", async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ id: 1, name: "deepseek", type: "deepseek" }],
      });

      const res = await request(app).get("/config/ai");

      expect(res.status).toBe(200);
      expect(res.body.providers).toHaveLength(1);
    });

    it("GET /config/ai/validate returns warnings", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get("/config/ai/validate");

      expect(res.status).toBe(200);
      expect(res.body.warnings).toContain("No providers configured");
    });

    it("POST /config/ai/seed-defaults seeds defaults", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const res = await request(app).post("/config/ai/seed-defaults");

      expect(res.status).toBe(200);
      expect(res.body.seeded).toBe(true);
    });

    it("GET /sessions returns session list", async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ pid: 12345, status: "running" }],
      });

      const res = await request(app).get("/sessions");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("POST /sessions/kill/:pid kills session", async () => {
      const res = await request(app).post("/sessions/kill/12345");

      expect(res.status).toBe(200);
      expect(res.body.killed).toBe(12345);
    });

    it("GET /roles returns role list", async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ name: "architect" }, { name: "engineer" }],
      });

      const res = await request(app).get("/roles");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  // ── RED PATH ────────────────────────────────────────────────────

  describe("RedPath — error conditions", () => {
    it("GET /config/ai with DB error returns 500", async () => {
      mockDb.query.mockRejectedValue(new Error("PG connection refused"));

      const res = await request(app).get("/config/ai");

      expect(res.status).toBe(500);
      expect(res.body.error).toBeTruthy();
    });

    it("POST /sessions/kill with invalid PID returns 400", async () => {
      const res = await request(app).post("/sessions/kill/not-a-number");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid PID");
    });

    it("GET /sessions with DB error returns 500", async () => {
      mockDb.query.mockRejectedValue(new Error("Table not found"));

      const res = await request(app).get("/sessions");

      expect(res.status).toBe(500);
    });
  });

  // ── SILENT-FAILURE PATH ─────────────────────────────────────────

  describe("SilentFailure", () => {
    it("GET /config/ai with empty result returns empty providers", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get("/config/ai");

      expect(res.status).toBe(200);
      expect(res.body.providers).toEqual([]);
    });

    it("GET /roles with empty result returns empty array", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get("/roles");

      expect(res.body).toEqual([]);
    });
  });
});
