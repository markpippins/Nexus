import fs from "fs";
import path from "path";
import {
  PipelineState,
  PlanCard,
  BuilderStatus,
  CircuitBreaker,
  AgentRole,
  AgentStatus,
  AgentState,
  PipelineMetrics,
} from "./types";
import { parsePlanFile } from "./parser";
import { PlanWatcher } from "./watchers/plan-watcher";
import { BuilderWatcher } from "./watchers/builder-watcher";
import { CircuitBreakerWatcher } from "./watchers/cb-watcher";
import { AgentWatcher } from "./watchers/agent-watcher";
import { AnalyticsEngine } from "./watchers/analytics-engine";
import {
  initDb,
  getPlansGroupedByStatus,
  planRowToPlanCard,
  getReceiptCount,
  getRunningSessions,
  getBreaker,
  getPlanById,
  upsertPlan,
  qOne,
  qAll,
} from "./db";
import { breakerRowToStatus } from "./watchers/cb-watcher";

export class PipelineWatcher {
  private listeners: Array<(event: any) => void> = [];
  private planWatcher: PlanWatcher;
  private builderWatcher: BuilderWatcher;
  private cbWatcher: CircuitBreakerWatcher;
  private agentWatcher: AgentWatcher;
  private analytics: AnalyticsEngine;
  baseDir: string;
  graphDir: string;

  constructor(baseDir: string, graphDir?: string) {
    this.baseDir = baseDir;
    this.graphDir = graphDir || path.resolve(baseDir, "../graph");
    const emit = (event: any) => this.emit(event);
    this.planWatcher = new PlanWatcher(this.graphDir, emit);
    this.builderWatcher = new BuilderWatcher(baseDir, emit);
    this.cbWatcher = new CircuitBreakerWatcher(baseDir, emit);
    this.agentWatcher = new AgentWatcher(baseDir, emit);
    this.analytics = new AnalyticsEngine();
  }

  onEvent(callback: (event: any) => void) {
    this.listeners.push(callback);
  }

  private emit(event: any) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /** Public emit for tools to fire SSE events (e.g., after receipt issuance) */
  emitToolEvent(event: any) {
    this.emit(event);
  }

  /** Remove a plan from all in-memory plan-watcher arrays. Used by delete_plan
   *  so the plan disappears from /state immediately without waiting for a rescan. */
  removePlanFromMemory(planNumber: string): void {
    const dirs = [
      "proposed",
      "planning",
      "pending",
      "active",
      "completed",
      "blocked",
    ] as const;
    for (const dir of dirs) {
      const idx = this.planWatcher.plans[dir].findIndex(
        (p: PlanCard) => p.planNumber === planNumber,
      );
      if (idx !== -1) {
        this.planWatcher.plans[dir].splice(idx, 1);
      }
    }
  }

  async getState(): Promise<PipelineState> {
    const now = new Date().toISOString();
    const grouped = await getPlansGroupedByStatus();

    // Circuit breaker from database (authoritative)
    const breakerRow = await getBreaker();
    const cbStatus = breakerRowToStatus(breakerRow);

    const fsDirs: Array<"pending" | "active" | "completed" | "blocked"> = [
      "pending",
      "active",
      "completed",
      "blocked",
    ];

    const result = {
      pending: [] as PlanCard[],
      active: [] as PlanCard[],
      completed: [] as PlanCard[],
      blocked: [] as PlanCard[],
      archived: [] as PlanCard[],
      proposed: [] as PlanCard[],
      planning: [] as PlanCard[],
    };
    const placed = new Set<string>();

    // Receipts are the sole authority for pending/active/completed/blocked.
    // Plans are placed according to their derived_status from the DB —
    // no filesystem fallback. If a plan file is in the wrong directory,
    // it does NOT override the receipt chain.
    for (const dir of fsDirs) {
      for (const row of grouped[dir]) {
        const card = planRowToPlanCard(row);
        placed.add(card.planNumber);
        result[dir].push(card);
      }
    }

    // Proposed and planning: filesystem-driven (no receipt types for these).
    // Plans already in the DB with PROPOSED/PLANNING status are included as
    // a safety net for any that lack a filesystem counterpart.
    // Guard: skip soft-deleted plans (deleted=1) — prevents stale in-memory
    // watcher cache from showing plans after their .md file was removed.
    for (const dir of ["proposed", "planning"] as const) {
      for (const p of this.planWatcher.plans[dir]) {
        if (!placed.has(p.planNumber)) {
          const dbPlan = await getPlanById(p.planNumber);
          if (dbPlan?.deleted) continue;
          result[dir].push(p);
          placed.add(p.planNumber);
        }
      }
      // Safety net: DB-only plans for proposed/planning
      for (const row of grouped[dir]) {
        const card = planRowToPlanCard(row);
        if (!placed.has(card.planNumber)) {
          result[dir].push(card);
          placed.add(card.planNumber);
        }
      }
    }

    // Archived from filesystem (.bak/completed-plans/), deduplicated.
    // Guard: skip soft-deleted plans (deleted=1) for consistency with
    // the proposed/planning guard above.
    const archivedChecks = await Promise.all(
      this.planWatcher.plans.archived.map(async (p) => ({
        p,
        deleted: !placed.has(p.planNumber) ? (await getPlanById(p.planNumber))?.deleted : true,
      }))
    );
    result.archived = archivedChecks.filter(({deleted}) => !deleted).map(({p}) => p);

    // ── Attach ticket statuses to every placed plan ──
    // Batch-query all non-terminal tickets so the UI can show per-role
    // status on plan cards without N+1 queries.
    const allPlanIds = [...placed];
    if (allPlanIds.length > 0) {
      const ticketRows = await qAll(
        `SELECT plan_id, role, status, id, created_at, expires_at, objective FROM tickets
         WHERE plan_id = ANY(@planIds)
         AND status IN ('open','claimed','completed','failed','expired','stale','cancelled','abandoned')
         ORDER BY plan_id, role`,
        { planIds: allPlanIds }
      ) as Array<{ plan_id: string; role: string; status: string; id: string; created_at: string; expires_at: string | null; objective: string | null }>;

      // Build map: plan_id → { role: { status, id, created_at, expires_at, objective } }
      const ticketMap = new Map<string, Record<string, { status: string; id: string; created_at: string; expires_at?: string; objective?: string }>>();
      for (const t of ticketRows) {
        if (!ticketMap.has(t.plan_id)) ticketMap.set(t.plan_id, {});
        ticketMap.get(t.plan_id)![t.role] = {
          status: t.status,
          id: t.id,
          created_at: t.created_at,
          expires_at: t.expires_at || undefined,
          objective: t.objective || undefined,
        };
      }

      // Merge into all plan arrays
      for (const dir of fsDirs) {
        for (const card of result[dir]) {
          card.ticketStatuses = ticketMap.get(card.planNumber);
        }
      }
      for (const dir of ["proposed", "planning"] as const) {
        for (const card of result[dir]) {
          card.ticketStatuses = ticketMap.get(card.planNumber);
        }
      }
      for (const card of result.archived) {
        card.ticketStatuses = ticketMap.get(card.planNumber);
      }
    }

    // Sort columns: pending/active/blocked ascending, completed/archived descending
    // (most recently completed/archived at top, oldest pending/active/blocked at top)
    const sortAsc = (a: PlanCard, b: PlanCard) => {
      const an = parseInt(a.planNumber, 10);
      const bn = parseInt(b.planNumber, 10);
      if (isNaN(an) && isNaN(bn))
        return a.planNumber.localeCompare(b.planNumber);
      if (isNaN(an)) return 1;
      if (isNaN(bn)) return -1;
      return an - bn;
    };
    const sortDesc = (a: PlanCard, b: PlanCard) => sortAsc(b, a);
    result.pending.sort(sortAsc);
    result.active.sort(sortAsc);
    result.blocked.sort(sortAsc);
    result.proposed.sort(sortAsc);
    result.planning.sort(sortAsc);
    result.completed.sort(sortDesc);
    result.archived.sort(sortDesc);

    return {
      plans: result,
      builder: this.builderWatcher.status,
      circuitBreaker: cbStatus,
      agents: this.agentWatcher.getAgents(),
      receiptStats: await getReceiptCount(),
      prompts: this.getPrompts(),
      lastUpdated: now,
    };
  }

  getAgents(): AgentState[] {
    return this.agentWatcher.getAgents();
  }

  getArchiveEntries(): any[] {
    // Archives are historical audit artifacts on filesystem — not read back for operational state.
    return [];
  }

  getInspections(): any[] {
    // Inspections are audit artifacts on filesystem — not read back for operational state.
    return [];
  }

  getPrompts(): any[] {
    // Prompts are audit artifacts on filesystem — not read back for operational state.
    return [];
  }

  getChangeReports(): any[] {
    // Change reports are audit artifacts on filesystem — not read back for operational state.
    return [];
  }

  updateAgentHeartbeat(
    role: AgentRole,
    status: AgentStatus,
    detail: string | null,
    pid: number | null,
  ) {
    this.agentWatcher.updateHeartbeat(role, status, detail, pid);
  }

  updateAgentFinished(role: AgentRole) {
    this.agentWatcher.updateFinished(role);
  }

  // Periodic full-state heartbeat — keeps clients caught up at 10s intervals
  startStateHeartbeat() {
    setInterval(async () => {
      const state = await this.getState();
      this.emit({ type: "state_full", data: state });
    }, 10000);
  }

  computeAnalytics(): PipelineMetrics {
    return this.analytics.compute(
      this.planWatcher.plans,
      [],
      this.baseDir,
    );
  }

  async createPlan(meta: {
    title: string;
    project: string;
    goal: string;
    filesAffected: string[];
    acceptanceCriteria: string[];
    dependencies: string[];
    promptRef?: string;
  }): Promise<{ planNumber: string; fileName: string; filePath: string }> {
    // Allocate plan number from the database (authoritative) to prevent
    // collisions across restarts and watcher-array gaps.
    const row = await qOne("SELECT MAX(CAST(id AS INTEGER)) as max_id FROM plans");
    const maxId = row?.max_id ?? 0;
    const nextNum = String(maxId + 1).padStart(4, "0");
    const slug = meta.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 50);
    const fileName = `${slug}-v${nextNum}.md`;
    const pendingDir = path.join(
      this.graphDir,
      "IMPLEMENTATION_PLANS",
      "pending",
    );
    const filePath = path.join(pendingDir, fileName);
    const lines: string[] = [];
    lines.push(
      `# ${meta.title}`,
      "",
      `**Project:** ${meta.project || "conduit-ui"}`,
      `**Plan Number:** ${nextNum}`,
      `**Status:** pending`,
    );
    if (meta.promptRef) lines.push(`**Prompt:** ${meta.promptRef}`);
    lines.push(
      "",
      "## Goal",
      "",
      meta.goal || "TBD",
      "",
      "## Files Affected",
      "",
    );
    if (meta.filesAffected.length > 0) {
      for (const f of meta.filesAffected) lines.push(`- ${f}`);
    } else {
      lines.push("- none");
    }
    lines.push("", "## Acceptance Criteria", "");
    if (meta.acceptanceCriteria.length > 0) {
      meta.acceptanceCriteria.forEach((c, i) =>
        lines.push(`### ${i + 1}. ${c}`),
      );
    } else {
      lines.push("- [ ] TBD");
    }
    lines.push("", "## Dependencies", "");
    if (meta.dependencies.length > 0) {
      for (const d of meta.dependencies) lines.push(`- ${d}`);
    } else {
      lines.push("- none");
    }
    lines.push("");
    // Only write plan file if IMPLEMENTATION_PLANS exists (filesystem mirror).
    // When missing, conduit-manager is DB-primary — no filesystem side-effect.
    if (fs.existsSync(path.join(this.graphDir, "IMPLEMENTATION_PLANS"))) {
      if (!fs.existsSync(pendingDir))
        fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    }
    return { planNumber: nextNum, fileName, filePath };
  }

  async updatePlanMetadata(
    planNumber: string,
    updates: {
      title?: string;
      project?: string;
      goal?: string;
      filesAffected?: string[];
      acceptanceCriteria?: string[];
      dependencies?: string[];
    },
  ): Promise<{ found: boolean; filePath?: string }> {        // DB-primary: update the database FIRST, then mirror to filesystem
    const now = new Date().toISOString();
    const dbPlan = await getPlanById(planNumber);
    if (dbPlan) {
      await upsertPlan({
        id: dbPlan.id,
        file_name: dbPlan.file_name,
        title: updates.title ?? dbPlan.title,
        project: updates.project ?? dbPlan.project,
        goal: updates.goal ?? dbPlan.goal,
        content: dbPlan.content,
        files_affected:
          updates.filesAffected !== undefined
            ? JSON.stringify(updates.filesAffected)
            : dbPlan.files_affected,
        acceptance_criteria:
          updates.acceptanceCriteria !== undefined
            ? JSON.stringify(updates.acceptanceCriteria)
            : dbPlan.acceptance_criteria,
        dependencies:
          updates.dependencies !== undefined
            ? JSON.stringify(updates.dependencies)
            : dbPlan.dependencies,
        prompt_ref: dbPlan.prompt_ref,
        notes: dbPlan.notes,
        priority: dbPlan.priority,
        created_at: dbPlan.created_at,
        updated_at: now,
      });
    }

    const dirs: Array<
      "pending" | "active" | "completed" | "blocked" | "proposed" | "planning"
    > = ["pending", "active", "completed", "blocked", "proposed", "planning"];
    const planDir = path.join(this.graphDir, "IMPLEMENTATION_PLANS");
    for (const dir of dirs) {
      const dirPath = path.join(planDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      for (const file of fs.readdirSync(dirPath)) {
        if (!file.endsWith(".md") || file === ".gitkeep") continue;
        const filePath2 = path.join(dirPath, file);
        const parsed = parsePlanFile(filePath2);
        if (!parsed || parsed.planNumber !== planNumber) continue;
        let content = fs.readFileSync(filePath2, "utf-8");
        if (updates.title !== undefined)
          content = content.replace(/^# .+$/m, `# ${updates.title}`);
        if (updates.project !== undefined)
          content = content.replace(
            /\*\*Project:\*\* .+/m,
            `**Project:** ${updates.project}`,
          );
        if (updates.goal !== undefined)
          content = content.replace(
            /## Goal\s*\n([\s\S]*?)(?=\n## |$)/,
            `## Goal\n\n${updates.goal}`,
          );
        if (updates.filesAffected !== undefined) {
          const fb =
            updates.filesAffected.length > 0
              ? updates.filesAffected.map((f) => `- ${f}`).join("\n")
              : "- none";
          content = content.replace(
            /## Files Affected\s*\n([\s\S]*?)(?=\n## |$)/,
            `## Files Affected\n\n${fb}`,
          );
        }
        if (updates.acceptanceCriteria !== undefined) {
          const cb =
            updates.acceptanceCriteria.length > 0
              ? updates.acceptanceCriteria
                  .map((c, i) => `### ${i + 1}. ${c}`)
                  .join("\n")
              : "- [ ] TBD";
          content = content.replace(
            /## Acceptance Criteria\s*\n([\s\S]*?)(?=\n## |$)/,
            `## Acceptance Criteria\n\n${cb}`,
          );
        }
        if (updates.dependencies !== undefined) {
          const db =
            updates.dependencies.length > 0
              ? updates.dependencies.map((d) => `- ${d}`).join("\n")
              : "- none";
          content = content.replace(
            /## Dependencies\s*\n([\s\S]*?)(?=\n## |$)/,
            `## Dependencies\n\n${db}`,
          );
        }
        fs.writeFileSync(filePath2, content, "utf-8");
        const reparsed = parsePlanFile(filePath2);
        if (reparsed) {
          const idx = this.planWatcher.plans[dir].findIndex(
            (p: PlanCard) => p.planNumber === planNumber,
          );
          if (idx !== -1) {
            const stats = fs.statSync(filePath2);
            this.planWatcher.plans[dir][idx] = {
              ...this.planWatcher.plans[dir][idx],
              title: reparsed.title,
              project: reparsed.project,
              goal: reparsed.goal,
              filesAffected: reparsed.filesAffected,
              acceptanceCriteria: reparsed.acceptanceCriteria,
              dependencies: reparsed.dependencies,
            };
            this.emit({
              type: "plan_created",
              data: { plan: this.planWatcher.plans[dir][idx], status: dir },
            });
          }
        }
        return { found: true, filePath: filePath2 };
      }
    }

    // No filesystem match — DB already updated above, confirm the plan exists
    return { found: dbPlan !== undefined };
  }

  async initialize() {
    await initDb(this.baseDir);
    await this.planWatcher.initialize();
    await this.builderWatcher.initialize();
    await this.cbWatcher.initialize();
    await this.agentWatcher.initialize();
    this.startStateHeartbeat();
  }

  destroy() {
    this.planWatcher.destroy();
    this.builderWatcher.destroy();
    this.cbWatcher.destroy();
    this.agentWatcher.destroy();
  }
}
