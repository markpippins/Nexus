import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncAll } from "../sync";

// Mock the DB module
vi.mock("../db", () => ({
  fetchLatestPrompts: vi.fn(),
  fetchActiveTasks: vi.fn(),
}));

// Mock the Redis module
const mockRedis = {
  pipeline: vi.fn(),
  get: vi.fn(),
};

vi.mock("../redis", () => ({
  getRedis: vi.fn(() => mockRedis),
  PROC_KEY: (role: string, slug: string) => `prompt:proc:${role}::${slug}`,
  IDX_KEY: (role: string) => `prompt:idx:${role}`,
  META_UPDATED_KEY: "prompt:meta:last_updated",
  TASK_IDX_KEY: (role: string) => `prompt:task:idx:${role}`,
}));

import { fetchLatestPrompts, fetchActiveTasks } from "../db";

// ── Helpers ────────────────────────────────────────────────────────

function mockPipeline() {
  const results: [null, string][] = [];
  const set = vi.fn().mockReturnValue({});
  const exec = vi.fn().mockResolvedValue(results);
  mockRedis.pipeline.mockReturnValue({ set, exec });
  return { set, exec };
}

function makePromptRow(overrides: Partial<any> = {}) {
  return {
    id: overrides.id || "p-001",
    role: overrides.role || "architect",
    slug: overrides.slug || "test-prompt",
    version: overrides.version ?? 1,
    title: overrides.title || "Test Prompt",
    body_md: overrides.body_md || "# Test\n\nBody content",
    parameter_schema: overrides.parameter_schema || { temperature: 0.7 },
    tags: overrides.hasOwnProperty('tags') ? overrides.tags : ["test"],
    created_at: "2026-07-25T00:00:00.000Z",
    updated_at: overrides.updated_at || "2026-07-25T00:00:00.000Z",
  };
}

function makeTaskRow(overrides: Partial<any> = {}) {
  return {
    task_slug: overrides.task_slug || "test-task",
    role: overrides.role || "architect",
    scope: overrides.scope || "Test task scope",
    acceptance_criteria: overrides.acceptance_criteria || ["criterion 1", "criterion 2"],
    prompt_id: overrides.prompt_id || "p-001",
    updated_at: overrides.updated_at || "2026-07-25T00:00:00.000Z",
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("syncAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GREEN PATH ──────────────────────────────────────────────────

  describe("GreenPath — successful sync", () => {
    it("syncs prompts and tasks from PG to Redis, returns counts", async () => {
      const { set, exec } = mockPipeline();

      vi.mocked(fetchLatestPrompts).mockResolvedValue([
        makePromptRow({ slug: "system-prompt", role: "architect" }),
        makePromptRow({ id: "p-002", slug: "code-review", role: "engineer" }),
      ]);
      vi.mocked(fetchActiveTasks).mockResolvedValue([
        makeTaskRow(),
      ]);

      const result = await syncAll();

      expect(result.prompts).toBe(2);
      expect(result.rolePromptIndices).toBe(2); // architect + engineer
      expect(result.tasks).toBe(1);
      expect(result.roleTaskIndices).toBe(1);
      expect(result.timestamp).toBeTruthy();

      // pipeline calls: 2 proc cards + 2 role prompt indices + 1 task:idx + 1 meta = 6
      expect(set).toHaveBeenCalledTimes(6);
      expect(exec).toHaveBeenCalled();
    });

    it("writes prompt cards with correct key format", async () => {
      const { set } = mockPipeline();

      vi.mocked(fetchLatestPrompts).mockResolvedValue([
        makePromptRow({ slug: "boot", role: "architect" }),
      ]);
      vi.mocked(fetchActiveTasks).mockResolvedValue([]);

      await syncAll();

      const procCall = set.mock.calls.find((c: any) => c[0] === "prompt:proc:architect::boot");
      expect(procCall).toBeTruthy();
      const card = JSON.parse(procCall[1]);
      expect(card.slug).toBe("boot");
      expect(card.body_md).toBeTruthy();
      expect(card.parameter_schema).toEqual({ temperature: 0.7 });
    });

    it("resolves prompt_id → slug for task indices", async () => {
      const { set } = mockPipeline();

      vi.mocked(fetchLatestPrompts).mockResolvedValue([
        makePromptRow({ id: "p-abc", slug: "greeting", role: "builder" }),
      ]);
      vi.mocked(fetchActiveTasks).mockResolvedValue([
        makeTaskRow({ prompt_id: "p-abc", role: "builder" }),
      ]);

      await syncAll();

      const taskCall = set.mock.calls.find((c: any) => c[0] === "prompt:task:idx:builder");
      const taskIdx = JSON.parse(taskCall[1]);
      expect(taskIdx[0].prompt_slug).toBe("greeting");
    });
  });

  // ── ORANGE PATH ──────────────────────────────────────────────────

  describe("OrangePath — edge cases", () => {
    it("handles empty PG (no prompts, no tasks)", async () => {
      mockPipeline();
      vi.mocked(fetchLatestPrompts).mockResolvedValue([]);
      vi.mocked(fetchActiveTasks).mockResolvedValue([]);

      const result = await syncAll();

      expect(result.prompts).toBe(0);
      expect(result.tasks).toBe(0);
      expect(result.rolePromptIndices).toBe(0);
    });

    it("handles tasks without matching prompts (orphan prompt_id)", async () => {
      mockPipeline();

      vi.mocked(fetchLatestPrompts).mockResolvedValue([]);
      vi.mocked(fetchActiveTasks).mockResolvedValue([
        makeTaskRow({ prompt_id: "orphan-id" }),
      ]);

      const result = await syncAll();

      expect(result.tasks).toBe(1);
      // The orphan task should still be indexed but with empty prompt_slug
    });

    it("handles many prompts across many roles", async () => {
      mockPipeline();

      const prompts = [
        makePromptRow({ id: "1", role: "architect", slug: "a1" }),
        makePromptRow({ id: "2", role: "engineer", slug: "e1" }),
        makePromptRow({ id: "3", role: "builder", slug: "b1" }),
        makePromptRow({ id: "4", role: "reviewer", slug: "r1" }),
      ];
      vi.mocked(fetchLatestPrompts).mockResolvedValue(prompts);
      vi.mocked(fetchActiveTasks).mockResolvedValue([]);

      const result = await syncAll();

      expect(result.prompts).toBe(4);
      expect(result.rolePromptIndices).toBe(4);
    });
  });

  // ── RED PATH ────────────────────────────────────────────────────

  describe("RedPath — error conditions", () => {
    it("propagates DB fetch errors for prompts", async () => {
      vi.mocked(fetchLatestPrompts).mockRejectedValue(
        new Error("PG prompt fetch failed")
      );

      await expect(syncAll()).rejects.toThrow("PG prompt fetch failed");
    });

    it("propagates DB fetch errors for tasks", async () => {
      vi.mocked(fetchLatestPrompts).mockResolvedValue([]);
      vi.mocked(fetchActiveTasks).mockRejectedValue(
        new Error("PG task fetch failed")
      );

      await expect(syncAll()).rejects.toThrow("PG task fetch failed");
    });

    it("throws when Redis pipeline has write failures", async () => {
      const results: [Error | null, string][] = [
        [new Error("OOM"), null],
      ];
      const set = vi.fn().mockReturnValue({});
      const exec = vi.fn().mockResolvedValue(results);
      mockRedis.pipeline.mockReturnValue({ set, exec });

      vi.mocked(fetchLatestPrompts).mockResolvedValue([makePromptRow()]);
      vi.mocked(fetchActiveTasks).mockResolvedValue([]);

      await expect(syncAll()).rejects.toThrow("commands failed");
    });
  });

  // ── SILENT-FAILURE PATH ─────────────────────────────────────────

  describe("SilentFailure — subtle data issues", () => {
    it("prompt row with null tags serializes correctly", async () => {
      const { set } = mockPipeline();

      vi.mocked(fetchLatestPrompts).mockResolvedValue([
        makePromptRow({ tags: null as any }),
      ]);
      vi.mocked(fetchActiveTasks).mockResolvedValue([]);

      await syncAll();

      const procCall = set.mock.calls.find((c: any) =>
        c[0]?.startsWith("prompt:proc:")
      );
      const card = JSON.parse(procCall[1]);
      expect(card.tags).toBeNull();
    });

    it("prompt row with empty parameter_schema serializes correctly", async () => {
      const { set } = mockPipeline();

      vi.mocked(fetchLatestPrompts).mockResolvedValue([
        makePromptRow({ parameter_schema: {} }),
      ]);
      vi.mocked(fetchActiveTasks).mockResolvedValue([]);

      await syncAll();

      const procCall = set.mock.calls.find((c: any) =>
        c[0]?.startsWith("prompt:proc:")
      );
      const card = JSON.parse(procCall[1]);
      expect(card.parameter_schema).toEqual({});
    });
  });
});
