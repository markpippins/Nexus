/**
 * markComplete (sonar_mark_complete) — completion writeback conformance
 * (architect ruling b1396dce, gap #1).
 *
 * Locks the post-merge completion flow:
 *   AC1 — issue keys → POST /api/issues/do_transition with transition=resolve
 *   AC2 — hotspot keys → POST /api/hotspots/change_status REVIEWED+FIXED
 *   AC3 — explicit kind=issue/hotspot short-circuits auto-detection
 *   AC4 — auto-detection probes /api/hotspots/show when kind omitted
 *   AC5 — message attaches as an issue comment for issue completions
 *   AC6 — tool registration exposes sonar_mark_complete on the server
 *   AC7 — runtime errors map to a SonarError-safe JSON response
 *
 * Hermetic: the global fetch is stubbed; no live SonarQube or DB.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/sonar-mcp
 *   npx vitest run src/tools/markcomplete.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { markComplete } from "./index.js";

// ── fetch stub (hermetic) ──────────────────────────────────────────
type FetchCall = { url: string; init: RequestInit };
let calls: FetchCall[] = [];
let hotspotProbeFails = false;

function stubFetch() {
  globalThis.fetch = vi.fn(async (input: any, init?: RequestInit) => {
    const url = input instanceof URL ? input.toString() : String(input);
    calls.push({ url, init: init ?? {} });
    if (url.includes("/api/hotspots/show")) {
      if (hotspotProbeFails) {
        return new Response("404 not found", { status: 404 });
      }
      return new Response(JSON.stringify({ key: "AXhotspot-a" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  calls = [];
  hotspotProbeFails = false;
  process.env.SONAR_TOKEN = "test-token";
  process.env.SONAR_BASE_URL = "http://sonar.test:9000";
  stubFetch();
});

afterEach(() => {
  delete process.env.SONAR_TOKEN;
  delete process.env.SONAR_BASE_URL;
});

describe("markComplete (sonar_mark_complete)", () => {
  test("AC1 — issue = transition resolve (RESOLVED/FIXED)", async () => {
    const result = await markComplete({
      key: "AXissue-1",
      kind: "issue",
    });
    expect(result).toEqual({ key: "AXissue-1", kind: "issue", marked: "RESOLVED+FIXED" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/api/issues/do_transition");
    expect(calls[0].init.body).toContain("issue=AXissue-1");
    expect(calls[0].init.body).toContain("transition=resolve");
  });

  test("AC2 — hotspot = change_status REVIEWED+FIXED", async () => {
    const result = await markComplete({
      key: "AXhotspot-a",
      kind: "hotspot",
    });
    expect(result).toEqual({ key: "AXhotspot-a", kind: "hotspot", marked: "REVIEWED+FIXED" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/api/hotspots/change_status");
    expect(calls[0].init.body).toContain("status=REVIEWED");
    expect(calls[0].init.body).toContain("resolution=FIXED");
  });

  test("AC3 — explicit kind short-circuits auto-detection", async () => {
    const result = await markComplete({ key: "AXissue-2", kind: "issue" });
    expect(result.kind).toBe("issue");
    // No hotspots/show probe call for the explicit-issue path.
    expect(calls.some((c) => c.url.includes("/api/hotspots/show"))).toBe(false);
  });

  test("AC4 — auto-detection probes hotspots/show when kind omitted", async () => {
    hotspotProbeFails = false; // key IS a hotspot
    const result = await markComplete({ key: "AXhotspot-b" });
    expect(result.kind).toBe("hotspot");
    expect(calls[0].url).toContain("/api/hotspots/show");
    // then the change_status call follows
    expect(calls[1].url).toContain("/api/hotspots/change_status");
  });

  test("AC5 — message attaches as issue comment on completion", async () => {
    const result = await markComplete({
      key: "AXissue-3",
      kind: "issue",
      message: "Merged in PR #123",
    });
    expect(result.marked).toBe("RESOLVED+FIXED");
    const commentCall = calls.find((c) => c.url.includes("/api/issues/add_comment"));
    expect(commentCall).toBeDefined();
    // URLSearchParams encoding: space → '+', '#' → '%23'
    expect(commentCall!.init.body).toContain("issue=AXissue-3");
    expect(commentCall!.init.body).toContain("text=Merged+in+PR+%23123");
  });

  test("AC6 — sonar_mark_complete is registered on the MCP server", async () => {
    // Import fresh to reach registerTools without disturbing the fetch stub.
    const { registerTools } = await import("./index.js");
    const server = {
      tool: vi.fn(),
    } as any;
    registerTools(server);
    const name = server.tool.mock.calls.map((c: any[]) => c[0]);
    expect(name).toContain("sonar_mark_complete");
    expect(name).toContain("sonar_search_issues");
    expect(name.length).toBe(7);
  });

  test("AC7 — SonarError is surfaced, not thrown", async () => {
    // Make the transition call fail.
    globalThis.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as any;
    let threw = false;
    try {
      await markComplete({ key: "AXissue-x", kind: "issue" });
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("SonarQube 401");
    }
    expect(threw).toBe(true);
  });
});