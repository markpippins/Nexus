import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { BaseWatcher } from "./base";
import {
  InspectionEntry,
  InspectionCategory,
  InspectionStatus,
  InspectionSeverity,
} from "../types";

export class InspectionWatcher extends BaseWatcher {
  entries: InspectionEntry[] = [];
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  async initialize(): Promise<void> {
    await this.scanInspections();
    this.startWatching();
  }

  destroy(): void {
    if (this.watcher) this.watcher.close();
  }

  private parseFile(
    filePath: string,
    category: InspectionCategory,
    status: InspectionStatus,
  ): InspectionEntry | null {
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const fileName = path.basename(filePath);
      const title =
        content.split("\n")[0]?.replace(/^#\s+/, "").trim() || fileName;
      const planRefs = (content.match(/Plan\s+(\d+)/gi) || []).map(
        (m: string) => m.replace(/Plan\s+/i, ""),
      );
      let severity: InspectionSeverity = "info";
      if (content.match(/\bcritical\b/i)) severity = "critical";
      else if (/(error|fail)/i.test(content)) severity = "error";
      else if (/warn/i.test(content)) severity = "warning";
      return {
        path: path.relative(this.baseDir, filePath),
        fileName,
        category,
        status,
        severity,
        title,
        planRefs,
        mtime: stats.mtime.toISOString(),
        summary: content.slice(0, 300).replace(/\n/g, " "),
        fullContent: content,
      };
    } catch {
      return null;
    }
  }

  private async scanInspections() {
    this.entries = [];
    const inspDir = path.join(this.baseDir, "INSPECTIONS");
    if (!fs.existsSync(inspDir)) return;
    const dirs = fs
      .readdirSync(inspDir)
      .filter((d) => !d.startsWith(".") && d !== "REGISTRY.md");
    for (const dir of dirs) {
      const fullDir = path.join(inspDir, dir);
      if (!fs.statSync(fullDir).isDirectory()) continue;
      const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".md"));
      let cat: InspectionCategory = "report";
      let st: InspectionStatus = "pending";
      if (dir === "errors") {
        cat = "error";
        st = "unresolved";
      } else if (dir === "warnings") {
        cat = "warning";
        st = "unresolved";
      } else if (dir === "blocker-reports") {
        cat = "blocker-report";
        st = "unresolved";
      } else if (dir === "todo") {
        cat = "todo";
        st = "pending";
      } else if (dir === "triage") {
        cat = "triage";
        st = "pending";
      } else if (dir === "resolved") {
        st = "resolved";
      } else if (dir === "unresolved") {
        st = "unresolved";
      } else if (dir === "processed") {
        cat = "todo";
        st = "resolved";
      }
      for (const file of files) {
        const entry = this.parseFile(path.join(fullDir, file), cat, st);
        if (entry) this.entries.push(entry);
      }
    }
    this.entries.sort(
      (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
    );
  }

  private getCatStatus(dirName: string): {
    cat: InspectionCategory;
    st: InspectionStatus;
  } {
    let cat: InspectionCategory = "report";
    let st: InspectionStatus = "pending";
    if (dirName === "errors") {
      cat = "error";
      st = "unresolved";
    } else if (dirName === "warnings") {
      cat = "warning";
      st = "unresolved";
    } else if (dirName === "blocker-reports") {
      cat = "blocker-report";
      st = "unresolved";
    } else if (dirName === "todo") {
      cat = "todo";
      st = "pending";
    } else if (dirName === "triage") {
      cat = "triage";
      st = "pending";
    } else if (dirName === "resolved") {
      st = "resolved";
    } else if (dirName === "unresolved") {
      st = "unresolved";
    } else if (dirName === "processed") {
      cat = "todo";
      st = "resolved";
    }
    return { cat, st };
  }

  private startWatching() {
    const inspDir = path.join(this.baseDir, "INSPECTIONS");
    const globs = [
      "reports",
      "errors",
      "warnings",
      "blocker-reports",
      "todo",
      "triage",
      "resolved",
      "unresolved",
      "processed",
    ].map((d) => path.join(inspDir, d, "*.md"));
    this.watcher = chokidar.watch(globs, {
      persistent: true,
      ignoreInitial: true,
    });
    const handle = (filePath: string, eventType: string) => {
      const dirName = path.basename(path.dirname(filePath));
      const { cat, st } = this.getCatStatus(dirName);
      if (eventType === "add" || eventType === "change") {
        const entry = this.parseFile(filePath, cat, st);
        if (entry) {
          const idx = this.entries.findIndex((e) => e.path === entry.path);
          if (idx === -1) {
            this.entries.push(entry);
            this.emit({ type: "inspection_created", data: entry });
          } else {
            this.entries[idx] = entry;
          }
        }
      } else if (eventType === "unlink") {
        const rel = path.relative(this.baseDir, filePath);
        const idx = this.entries.findIndex((e) => e.path === rel);
        if (idx !== -1) {
          const [r] = this.entries.splice(idx, 1);
          this.emit({ type: "inspection_moved", data: r });
        }
      }
    };
    this.watcher.on("add", (p: string) => handle(p, "add"));
    this.watcher.on("change", (p: string) => handle(p, "change"));
    this.watcher.on("unlink", (p: string) => handle(p, "unlink"));
  }
}
