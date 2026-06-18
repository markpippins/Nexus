import path from "path";
import fs from "fs";
import { BaseWatcher } from "./base";
import { PlanCard, PlanStatus } from "../types";
import { parsePlanFile } from "../parser";
import {
  upsertPlan,
  getPlansGroupedByStatus,
  planRowToPlanCard,
  getPlanById,
} from "../db";

export class PlanWatcher extends BaseWatcher {
  plans: {
    pending: PlanCard[];
    active: PlanCard[];
    completed: PlanCard[];
    blocked: PlanCard[];
    archived: PlanCard[];
    proposed: PlanCard[];
    planning: PlanCard[];
  } = {
    pending: [],
    active: [],
    completed: [],
    blocked: [],
    archived: [],
    proposed: [],
    planning: [],
  };
  private planDir: string;

  constructor(baseDir: string, emit: (event: any) => void) {
    super(baseDir, emit);
    this.planDir = path.join(this.baseDir, "IMPLEMENTATION_PLANS");
  }

  async initialize(): Promise<void> {
    // Startup scan: upsert filesystem plans into DB for content mirroring.
    // Operational state is DB-primary — the plan_status view is authoritative.
    await this.readAllDirectories();
    // Merge DB-backed plans into in-memory cache (catches DB-only plans).
    await this.loadFromDb();
    // DB-primary mode: no chokidar watch. State changes come from
    // receipt issuance via MCP tool handlers, not file placement.
  }

  destroy(): void {
    // No resources to clean up (chokidar removed).
  }

  private async readAllDirectories() {
    const dirs: PlanStatus[] = ["pending", "active", "completed", "blocked"];
    for (const dir of dirs) {
      const fullPath = path.join(this.planDir, dir);
      this.plans[dir] = await this.readPlanDir(fullPath, dir);
    }
    for (const dir of ["proposed", "planning"] as const) {
      const fullPath = path.join(this.planDir, dir);
      const cards = await this.readPlanDir(fullPath, dir);
      this.plans[dir] = cards;
    }
    const archivedDir = path.join(this.baseDir, ".bak", "completed-plans");
    this.plans.archived = await this.readPlanDir(archivedDir, "archived");
  }

  private async readPlanDir(
    dirPath: string,
    status: string,
  ): Promise<PlanCard[]> {
    const cards: PlanCard[] = [];
    try {
      if (!fs.existsSync(dirPath)) return cards;
      const files = fs
        .readdirSync(dirPath)
        .filter((f) => f.endsWith(".md") && f !== ".gitkeep");
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const parsed = parsePlanFile(filePath);
        if (parsed) {
          const stats = fs.statSync(filePath);
          const card: PlanCard = {
            fileName: parsed.fileName,
            planNumber: parsed.planNumber,
            baseName: parsed.baseName,
            title: parsed.title,
            project: parsed.project,
            createdAt: stats.birthtime.toISOString(),
            goal: parsed.goal,
            filesAffected: parsed.filesAffected,
            acceptanceCriteria: parsed.acceptanceCriteria,
            dependencies: parsed.dependencies,
          };
          if (status === "blocked") {
            const content = fs.readFileSync(filePath, "utf-8");
            const firstLine = content.split("\n")[0];
            if (firstLine?.startsWith("# ")) {
              card.blockReason = firstLine.replace("# ", "").trim();
            }
          }
          // Guard: skip soft-deleted plans in DB
          try {
            const dbPlan = await getPlanById(card.planNumber);
            if (dbPlan?.deleted) continue;
          } catch {
            // DB might not be initialized yet — proceed
          }

          // Upsert plan into the database for content mirroring
          try {
            await upsertPlan({
              id: card.planNumber,
              file_name: card.fileName,
              title: card.title,
              project: card.project,
              goal: card.goal || "",
              content: "",
              files_affected: JSON.stringify(card.filesAffected || []),
              acceptance_criteria: JSON.stringify(
                card.acceptanceCriteria || [],
              ),
              dependencies: JSON.stringify(card.dependencies || []),
              prompt_ref: "",
              notes: "",
              priority: 0,
              created_at: card.createdAt,
              updated_at: new Date().toISOString(),
            });
          } catch (err) {
            console.error(
              `Error upserting plan ${card.planNumber} into DB:`,
              err,
            );
          }
          cards.push(card);
        }
      }
    } catch (err) {
      console.error(`Error reading ${dirPath}:`, err);
    }
    return cards;
  }

  private async loadFromDb() {
    try {
      const grouped = await getPlansGroupedByStatus();
      for (const dir of [
        "pending",
        "active",
        "completed",
        "blocked",
        "proposed",
        "planning",
      ] as const) {
        const rows = grouped[dir] || [];
        for (const row of rows) {
          const existing = this.plans[dir].find((p) => p.planNumber === row.id);
          if (!existing) {
            const card = planRowToPlanCard(row);
            this.plans[dir].push(card);
          }
        }
      }
    } catch (err) {
      console.warn(
        "plan-watcher: DB fallback failed — plans may be incomplete.",
        err,
      );
    }
  }
}
