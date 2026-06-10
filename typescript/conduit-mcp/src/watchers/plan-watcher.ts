import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { BaseWatcher } from "./base";
import { PlanCard, PlanStatus } from "../types";
import { parsePlanFile } from "../parser";
import {
  upsertPlan,
  getLatestReceiptType,
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
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private planDir: string;

  constructor(baseDir: string, emit: (event: any) => void) {
    super(baseDir, emit);
    this.planDir = path.join(this.baseDir, "IMPLEMENTATION_PLANS");
  }

  async initialize(): Promise<void> {
    await this.readAllDirectories();
    // Fallback: populate from DB if filesystem plans are sparse
    await this.loadFromDb();
    this.startWatching();
  }

  destroy(): void {
    if (this.watcher) this.watcher.close();
  }

  private async readAllDirectories() {
    const dirs: PlanStatus[] = ["pending", "active", "completed", "blocked"];
    for (const dir of dirs) {
      const fullPath = path.join(this.planDir, dir);
      this.plans[dir] = await this.readPlanDir(fullPath, dir);
    }
    // Read proposed and planning (v067)
    for (const dir of ["proposed", "planning"] as const) {
      const fullPath = path.join(this.planDir, dir);
      const cards = await this.readPlanDir(fullPath, dir);
      this.plans[dir] = cards;
    }
    // Read archived from .bak/completed-plans/
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
          // Guard: skip if plan is soft-deleted in DB (prevents orphaned files
          // from being re-added to in-memory state after server restart)
          try {
            const dbPlan = getPlanById(card.planNumber);
            if (dbPlan?.deleted) {
              continue; // skip — plan is soft-deleted
            }
          } catch {
            // DB might not be initialized yet — proceed
          }

          // Upsert plan into SQLite database
          try {
            upsertPlan({
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
    // Merge DB-backed plans into the in-memory cache so /state works
    // even when IMPLEMENTATION_PLANS/ is empty (conduit-manager is DB-primary).
    try {
      const grouped = getPlansGroupedByStatus();
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

  private startWatching() {
    // If IMPLEMENTATION_PLANS doesn't exist, skip filesystem watch entirely
    if (!fs.existsSync(this.planDir)) {
      console.log(
        "plan-watcher: IMPLEMENTATION_PLANS not found — filesystem watch disabled (DB-primary mode).",
      );
      return;
    }

    this.watcher = chokidar.watch(
      [
        path.join(this.planDir, "pending", "*.md"),
        path.join(this.planDir, "active", "*.md"),
        path.join(this.planDir, "completed", "*.md"),
        path.join(this.planDir, "blocked", "*.md"),
        path.join(this.planDir, "proposed", "*.md"),
        path.join(this.planDir, "planning", "*.md"),
      ],
      { persistent: true, ignoreInitial: true },
    );

    this.watcher.on("add", async (filePath: string) => {
      // Content sync only — filesystem event is NOT a state transition.
      // Upsert into SQLite so the file's content is available for queries,
      // but do NOT emit a state-change SSE event. State changes come from
      // receipt issuance, not file placement.
      const dir = path.basename(path.dirname(filePath)) as PlanStatus;
      const cards = await this.readPlanDir(path.dirname(filePath), dir);
      const card = cards[0];
      if (card) {
        // Guard: if the plan was soft-deleted in the DB, don't re-add it
        // to in-memory state. This prevents deleted plans from reappearing
        // when an external process writes a .md file to IMPLEMENTATION_PLANS.
        try {
          const dbPlan = getPlanById(card.planNumber);
          if (dbPlan?.deleted) {
            return; // skip — plan is soft-deleted
          }
        } catch {
          // DB might not be initialized yet — proceed with filesystem state
        }
        this.plans[dir].push(card);
        // Emit a content event (informational, not state-changing)
        this.emit({
          type: "plan_file_added",
          data: { plan: card, directory: dir },
        });

        // Reconciliation check: does the file's directory match receipt state?
        try {
          const receiptType = getLatestReceiptType(card.planNumber);
          const expectedDirs: Record<string, PlanStatus[]> = {
            PLAN_CREATE: ["pending"],
            IMPLEMENTATION: ["active"],
            REVIEW_PASS: ["completed"],
            REVIEW_REJECT: ["active"],
            BLOCK: ["blocked"],
            PROPOSED: ["proposed"],
            PLANNING: ["planning"],
          };
          const expected = expectedDirs[receiptType || "PLAN_CREATE"] || [
            "pending",
          ];
          if (!expected.includes(dir) && receiptType) {
            console.warn(
              `Reconciliation mismatch: plan ${card.planNumber} ` +
                `found in ${dir}/ but receipt chain says ${receiptType} ` +
                `(expected directory: ${expected.join(" or ")})`,
            );
          }
        } catch (err) {
          // DB might not be initialized yet — skip reconciliation
        }
      }
    });

    this.watcher.on("unlink", (filePath: string) => {
      // File deletion is NOT a state transition. Plans are receipts, not files.
      // If a plan file disappears, it may have been archived or cleaned up.
      // The receipt chain in SQLite is still authoritative.
      const fileName = path.basename(filePath);
      const dirs = [
        "pending",
        "active",
        "completed",
        "blocked",
        "proposed",
        "planning",
      ] as const;
      let removed: PlanCard | undefined;
      let fromDir: string | undefined;
      for (const key of dirs) {
        const idx = this.plans[key].findIndex(
          (p: PlanCard) => p.fileName === fileName,
        );
        if (idx !== -1) {
          [removed] = this.plans[key].splice(idx, 1);
          fromDir = key;
          break;
        }
      }
      if (removed && fromDir) {
        // Emit a content event — "a file went away" — not a state event
        this.emit({
          type: "plan_file_removed",
          data: { plan: removed, from: fromDir },
        });
      }
    });
  }
}
