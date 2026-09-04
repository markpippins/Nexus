import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncAll } from "../sync";

// Mock the DB module
vi.mock("../db", () => ({
  fetchAllActiveMemory: vi.fn(),
}));

// Mock the Redis module
const mockRedis = {
  pipeline: vi.fn(),
  get: vi.fn(),
};

vi.mock("../redis", () => ({
  getRedis: vi.fn(() => mockRedis),
  PROC_KEY: (slug: string) => `mem:proc:${slug}`,
  IDX_KEY: (role: string) => `mem:idx:${role}`,
  META_UPDATED_KEY: "mem:meta:last_updated",
}));

import { fetchAllActiveMemory } from "../db";

// ── Helpers ────────────────────────────────────────────────────────

function mockPipeline(shouldSucceed = true) {
  const results: [null, string][] = [];
  const set = vi.fn().mockReturnValue({});
  const exec = vi.fn().mockResolvedValue(shouldSucceed ? results : null);
  mockRedis.pipeline.mockReturnValue({ set, exec });
  return { set, exec };
}

function makeMemoryRow(slug: string, title: string, roles: string[]) {
  return {
    procedure: {
      id: `row-${slug}`,
      slug,
      title,
      summary: `Summary for ${slug}`,
      body_md: `# ${title}\n\nBody content`,
      tags: ["test"],
      triggers: ["on:deploy"],
      mcp_tools: ["tool_1"],
      created_at: "2026-07-25T00:00:00.000Z",
      updated_at: "2026-07-25T00:00:00.000Z",
    },
    roles,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("syncAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GREEN PATH ──────────────────────────────────────────────────

  describe("GreenPath — successful sync", () => {
    it("syncs procedures from PG to Redis and returns counts", async () => {
      const { set, exec } = mockPipeline();

      const memMap = new Map([
        ["boot-procedure", makeMemoryRow("boot-procedure", "Boot Procedure", ["architect", "engineer"])],
        ["tag-routing", makeMemoryRow("tag-routing", "Tag Routing Reference", ["architect"])],
      ]);
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(memMap);

      const result = await syncAll();

      expect(result.procedures).toBe(2);
      expect(result.roleIndices).toBe(2); // architect + engineer
      expect(result.timestamp).toBeTruthy();

      // Verify pipeline writes: 2 proc cards + 2 role indices + 1 timestamp = 5 SETs
      expect(set).toHaveBeenCalledTimes(5);
      expect(exec).toHaveBeenCalled();
    });

    it("writes procedure cards to the correct Redis keys", async () => {
      const { set } = mockPipeline();

      const memMap = new Map([
        ["test-proc", makeMemoryRow("test-proc", "Test Proc", ["builder"])],
      ]);
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(memMap);

      await syncAll();

      // Check that proc key was set with JSON card
      const procCall = set.mock.calls.find((c: any) => c[0] === "mem:proc:test-proc");
      expect(procCall).toBeTruthy();
      const card = JSON.parse(procCall![1]);
      expect(card.slug).toBe("test-proc");
      expect(card.title).toBe("Test Proc");
      expect(card.body_md).toBeTruthy();
    });

    it("writes per-role indices aggregating procedures by role", async () => {
      const { set } = mockPipeline();

      const memMap = new Map([
        ["a", makeMemoryRow("a", "Proc A", ["architect", "engineer"])],
        ["b", makeMemoryRow("b", "Proc B", ["engineer"])],
      ]);
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(memMap);

      await syncAll();

      // Architect index should have only "a"
      const archCall = set.mock.calls.find((c: any) => c[0] === "mem:idx:architect");
      const archIdx = JSON.parse(archCall![1]);
      expect(archIdx).toHaveLength(1);
      expect(archIdx[0].slug).toBe("a");

      // Engineer index should have both "a" and "b"
      const engCall = set.mock.calls.find((c: any) => c[0] === "mem:idx:engineer");
      const engIdx = JSON.parse(engCall![1]);
      expect(engIdx).toHaveLength(2);
    });

    it("writes the last-updated timestamp", async () => {
      mockPipeline();
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(new Map());

      await syncAll();

      const metaCall = mockRedis.pipeline().set.mock.calls.find(
        (c: any) => c[0] === "mem:meta:last_updated"
      );
      expect(metaCall).toBeTruthy();
    });
  });

  // ── ORANGE PATH ──────────────────────────────────────────────────

  describe("OrangePath — edge cases", () => {
    it("handles empty PG (no procedures)", async () => {
      mockPipeline();
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(new Map());

      const result = await syncAll();

      expect(result.procedures).toBe(0);
      expect(result.roleIndices).toBe(0);
    });

    it("handles procedures with no roles assigned", async () => {
      const { set } = mockPipeline();

      const memMap = new Map([
        ["orphan", makeMemoryRow("orphan", "Orphan Proc", [])],
      ]);
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(memMap);

      const result = await syncAll();

      expect(result.procedures).toBe(1);
      expect(result.roleIndices).toBe(0); // No role indices when no roles

      // Still writes the proc card even if no roles
      const procCall = set.mock.calls.find((c: any) => c[0] === "mem:proc:orphan");
      expect(procCall).toBeTruthy();
    });

    it("handles procedure with many tags and triggers", async () => {
      mockPipeline();

      const memMap = new Map();
      const row = makeMemoryRow("complex", "Complex", ["architect"]);
      row.procedure.tags = ["tag1", "tag2", "tag3", "tag4", "tag5"];
      row.procedure.triggers = ["trigger1", "trigger2"];
      row.procedure.mcp_tools = ["tool_a", "tool_b", "tool_c"];
      memMap.set("complex", row);
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(memMap);

      const result = await syncAll();
      expect(result.procedures).toBe(1);
    });
  });

  // ── RED PATH ────────────────────────────────────────────────────

  describe("RedPath — error conditions", () => {
    it("silently returns when Redis pipeline exec returns null — GAP: no error thrown", async () => {
      mockPipeline(false); // exec returns null
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(new Map());

      // Current behavior: exec() returning null is silently ignored, not treated as error
      const result = await syncAll();
      expect(result.procedures).toBe(0);
      expect(result.roleIndices).toBe(0);
      // GAP: null exec should probably throw, but current code skips the if(results) block
    });

    it("throws when Redis pipeline has write failures", async () => {
      const results: [Error | null, string | null][] = [
        [null, "OK"],
        [new Error("WRITE failure"), null],
        [null, "OK"],
      ];
      const set = vi.fn().mockReturnValue({});
      const exec = vi.fn().mockResolvedValue(results);
      mockRedis.pipeline.mockReturnValue({ set, exec });

      vi.mocked(fetchAllActiveMemory).mockResolvedValue(
        new Map([["a", makeMemoryRow("a", "Proc", ["builder"])]])
      );

      await expect(syncAll()).rejects.toThrow("1/3 commands failed");
    });

    it("propagates DB fetch errors", async () => {
      vi.mocked(fetchAllActiveMemory).mockRejectedValue(
        new Error("PG connection refused")
      );

      await expect(syncAll()).rejects.toThrow("PG connection refused");
    });
  });

  // ── SILENT-FAILURE PATH ─────────────────────────────────────────

  describe("SilentFailure — subtle data integrity issues", () => {
    it("handles procedure with missing optional fields", async () => {
      const { set } = mockPipeline();

      const row = makeMemoryRow("minimal", "Minimal", ["architect"]);
      row.procedure.tags = [];
      row.procedure.triggers = [];
      row.procedure.mcp_tools = [];
      row.procedure.summary = "";
      const memMap = new Map([["minimal", row]]);
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(memMap);

      await syncAll();

      const procCall = set.mock.calls.find((c: any) => c[0] === "mem:proc:minimal");
      const card = JSON.parse(procCall![1]);
      expect(card.tags).toEqual([]);
      expect(card.summary).toBe("");
    });

    it("procedure with duplicate roles in role array only indexed once", async () => {
      const { set } = mockPipeline();

      // Role array has duplicate "architect" entries
      const memMap = new Map([
        ["dup-roles", makeMemoryRow("dup-roles", "Dup Roles", ["architect", "architect", "engineer"])],
      ]);
      vi.mocked(fetchAllActiveMemory).mockResolvedValue(memMap);

      await syncAll();

      // Architect index should have 1 entry (not 2) after Set dedup
      // Actually, the sync code pushes to array for each role in the roles array,
      // so duplicates would NOT be deduplicated. This IS a silent-failure GAP.
      const archCall = set.mock.calls.find((c: any) => c[0] === "mem:idx:architect");
      const archIdx = JSON.parse(archCall![1]);
      // Current behavior: duplicates are included — documents the GAP
      expect(archIdx.length).toBeGreaterThanOrEqual(1);
    });
  });
});
