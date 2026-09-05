// The seven sonar-mcp tools (post-merge completion flow: Planner grouping input,
// Builder closure loop, Reviewer merge check + completion writeback).
//
//  1. sonar_search_issues   — filter by severity/rule/component/new-code/resolution
//  2. sonar_get_hotspot     — security hotspot detail
//  3. sonar_mark_fp         — false-positive writeback (issue transition or hotspot review)
//  4. sonar_mark_complete   — completion writeback: issue → RESOLVED/FIXED, hotspot → REVIEWED+FIXED
//  5. sonar_add_comment     — issue comment writeback
//  6. sonar_set_tags        — issue tag writeback
//  7. sonar_quality_gate    — project quality-gate status (Reviewer merge check)
//
// Endpoints mirror ballerina sonar-sync's proven paths:
//   /api/issues/search, /api/hotspots/search, /api/issues/do_transition,
//   /api/hotspots/change_status, /api/issues/add_comment, /api/issues/set_tags,
//   /api/qualitygates/project_status
//
// Writeback is SonarQube-side only (like sonar_mark_fp). Propagation of
// status/resolution into the canonical sonar.issues / sonar.hotspots ledger
// happens via sonar-sync's scheduled pull (that pull has NO `resolved`
// filter and upserts status + resolution), so a completed item becomes
// renderable as "complete" in Assembly on the next sync tick without any
// skip-list maintenance.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sonarGet, sonarPostForm, SonarError } from "../db/client.js";
import { json, briefIssue, briefHotspot } from "../db/format.js";

const PROJECT_KEY = "nexus";

function err(e: unknown) {
  if (e instanceof SonarError) {
    return json({ error: e.message, status: e.status, endpoint: e.endpoint });
  }
  return json({ error: String(e) });
}

/** Auto-detect whether a key is a hotspot (probe /api/hotspots/show like
 * sonar_mark_fp) unless the caller declared the kind explicitly. */
async function detectKind(
  key: string,
  declared?: "issue" | "hotspot",
): Promise<"issue" | "hotspot"> {
  if (declared) return declared;
  try {
    await sonarGet("/api/hotspots/show", { hotspot: key });
    return "hotspot";
  } catch {
    return "issue";
  }
}

/**
 * Completion writeback — Reviewer post-merge action (ruling b1396dce).
 * Issue: transition `resolve` → status RESOLVED, resolution FIXED.
 * Hotspot: change_status REVIEWED + resolution FIXED.
 * Optional message is attached as an issue comment (e.g. merge ref / PR #).
 * sonar-sync's scheduled pull propagates status/resolution into the ledger.
 */
export async function markComplete(args: {
  key: string;
  kind?: "issue" | "hotspot";
  message?: string;
}) {
  const kind = await detectKind(args.key, args.kind);
  if (kind === "hotspot") {
    await sonarPostForm("/api/hotspots/change_status", {
      hotspot: args.key,
      status: "REVIEWED",
      resolution: "FIXED",
    });
    return { key: args.key, kind: "hotspot", marked: "REVIEWED+FIXED" };
  }
  await sonarPostForm("/api/issues/do_transition", {
    issue: args.key,
    transition: "resolve",
  });
  if (args.message) {
    await sonarPostForm("/api/issues/add_comment", {
      issue: args.key,
      text: args.message,
    });
  }
  return { key: args.key, kind: "issue", marked: "RESOLVED+FIXED" };
}

export function registerTools(server: McpServer) {
  // ── 1. sonar_search_issues ─────────────────────────────────────────
  server.tool(
    "sonar_search_issues",
    "Search SonarQube issues for the nexus project. Filter by severity, rule, component (file), new-code flag, resolution, and more. Planner grouping entry point.",
    {
      severities: z.string().optional().describe("Comma list: INFO,MINOR,MAJOR,CRITICAL,BLOCKER"),
      rules: z.string().optional().describe("Comma list of rule keys"),
      components: z.string().optional().describe("Comma list of component keys (files/modules)"),
      resolved: z.enum(["false", "true", "only"]).optional().describe("false = open issues (default)"),
      statuses: z.string().optional().describe("Comma list: OPEN,CONFIRMED,REOPENED,RESOLVED,CLOSED"),
      type: z.enum(["CODE_SMELL", "BUG", "VULNERABILITY"]).optional(),
      "inNewCode": z.string().optional().describe("'true' = new-code issues only (leak period / PR gate class)"),
      sinceLeakPeriod: z.string().optional().describe("'true' = issues created since last leak period"),
      facets: z.string().optional().describe("Comma list of facets to aggregate, e.g. severities,rules,components"),
      ps: z.number().int().min(1).max(500).optional().describe("Page size (default 100)"),
      p: z.number().int().min(1).optional().describe("Page number"),
    },
    async (args) => {
      try {
        const data = await sonarGet("/api/issues/search", {
          projectKeys: PROJECT_KEY,
          severities: args.severities,
          rules: args.rules,
          components: args.components,
          resolved: args.resolved ?? "false",
          statuses: args.statuses,
          type: args.type,
          inNewCode: args.inNewCode,
          sinceLeakPeriod: args.sinceLeakPeriod,
          facets: args.facets,
          ps: args.ps ?? 100,
          p: args.p,
        });
        return json({
          total: data.total,
          page: (args.p ?? 1),
          ps: (args.ps ?? 100),
          issues: (data.issues ?? []).map(briefIssue),
          facets: data.facets,
        });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── 2. sonar_get_hotspot ───────────────────────────────────────────
  server.tool(
    "sonar_get_hotspot",
    "Get full detail for a security hotspot by key, including its security category and review status.",
    {
      hotspot: z.string().describe("Hotspot key"),
    },
    async (args) => {
      try {
        const data = await sonarGet("/api/hotspots/show", { hotspot: args.hotspot });
        return json({
          ...briefHotspot(data),
          securityCategory: data.securityCategory,
          vulnerabilityDescription: data.vulnerabilityDescription,
          fixRecommendations: data.fixRecommendations,
        });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── 3. sonar_mark_fp ───────────────────────────────────────────────
  server.tool(
    "sonar_mark_fp",
    "Mark a finding as reviewed-safe / false positive. For an issue: transition it to resolution FALSE-POSITIVE. For a hotspot key (detected by prefix or explicit kind param): review it as SAFE.",
    {
      key: z.string().describe("Issue or hotspot key"),
      kind: z.enum(["issue", "hotspot"]).optional().describe("Explicit kind; auto-detected from key prefix when omitted"),
      message: z.string().optional().describe("Optional justification comment added when marking an issue"),
    },
    async (args) => {
      try {
        let isHotspot = args.kind === "hotspot";
        if (!args.kind) {
          // Key formats are indistinguishable — probe the hotspot API.
          // (api/hotspots/show 404s/400s on a non-hotspot key.)
          try {
            await sonarGet("/api/hotspots/show", { hotspot: args.key });
            isHotspot = true;
          } catch {
            isHotspot = false;
          }
        }
        if (isHotspot) {
          await sonarPostForm("/api/hotspots/change_status", {
            hotspot: args.key,
            status: "REVIEWED",
            resolution: "SAFE",
          });
          return json({ key: args.key, kind: "hotspot", marked: "SAFE" });
        }
        await sonarPostForm("/api/issues/do_transition", {
          issue: args.key,
          transition: "falsepositive",
        });
        if (args.message) {
          await sonarPostForm("/api/issues/add_comment", { issue: args.key, text: args.message });
        }
        return json({ key: args.key, kind: "issue", marked: "FALSE-POSITIVE" });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── 4. sonar_mark_complete ────────────────────────────────────────
  server.tool(
    "sonar_mark_complete",
    "Mark a finding as completed/fixed (Reviewer post-merge action). For an issue: transition it to RESOLVED/FIXED. For a hotspot key (detected by prefix or explicit kind param): review it as REVIEWED+FIXED. Use after the fix's PR is merged. sonar-sync's next pull propagates the completion into the ledger for Assembly rendering.",
    {
      key: z.string().describe("Issue or hotspot key"),
      kind: z.enum(["issue", "hotspot"]).optional().describe("Explicit kind; auto-detected from key prefix when omitted"),
      message: z.string().optional().describe("Optional justification comment added when marking an issue (e.g. merge ref / PR #)"),
    },
    async (args) => {
      try {
        return json(await markComplete(args));
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── 5. sonar_add_comment ───────────────────────────────────────────
  server.tool(
    "sonar_add_comment",
    "Add a comment to an issue (Builder closure notes, triage rationale).",
    {
      issue: z.string().describe("Issue key"),
      text: z.string().min(1).describe("Comment text"),
    },
    async (args) => {
      try {
        await sonarPostForm("/api/issues/add_comment", { issue: args.issue, text: args.text });
        return json({ issue: args.issue, comment: "added" });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── 6. sonar_set_tags ──────────────────────────────────────────────
  server.tool(
    "sonar_set_tags",
    "Replace the tags on an issue. Use for Planner triage vocabulary (e.g. night-shift, fp-candidate, batch-3).",
    {
      issue: z.string().describe("Issue key"),
      tags: z.string().describe("Comma-separated tag list (replaces existing tags)"),
    },
    async (args) => {
      try {
        await sonarPostForm("/api/issues/set_tags", { issue: args.issue, tags: args.tags });
        return json({ issue: args.issue, tags: args.tags.split(",").map((t) => t.trim()) });
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── 7. sonar_quality_gate ──────────────────────────────────────────
  server.tool(
    "sonar_quality_gate",
    "Get the quality-gate status for the nexus project (Reviewer merge check — gate must be PASSED).",
    {
      analysisId: z.string().optional().describe("Optional specific analysis to evaluate"),
    },
    async (args) => {
      try {
        const data = await sonarGet("/api/qualitygates/project_status", {
          projectKey: PROJECT_KEY,
          analysisId: args.analysisId,
        });
        const st = data.projectStatus ?? {};
        return json({
          status: st.status,
          conditions: (st.conditions ?? []).map((c: any) => ({
            metric: c.metricKey,
            status: c.status,
            actual: c.actualValue,
            gate: c.errorThreshold ? `error>${c.errorThreshold}` : undefined,
          })),
        });
      } catch (e) {
        return err(e);
      }
    },
  );
}
