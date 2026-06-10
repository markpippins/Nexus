import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { BaseWatcher } from "./base";
import { ChangeCategory, ChangeReportEntry } from "../types";

export class ChangesWatcher extends BaseWatcher {
  entries: ChangeReportEntry[] = [];
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  async initialize(): Promise<void> {
    await this.scanChanges();
    this.startWatching();
  }

  destroy(): void {
    if (this.watcher) this.watcher.close();
  }

  private parseFile(
    filePath: string,
    category: ChangeCategory,
    location: "active" | "archived",
  ): ChangeReportEntry | null {
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const fileName = path.basename(filePath);
      const titleMatch = content.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : fileName;
      const agent = fileName.startsWith("builder-")
        ? "builder"
        : fileName.startsWith("foreground")
          ? "engineer"
          : "reviewer";
      const planRefs: any[] = [];
      const planMatches = content.matchAll(/##?\s*(?:Plan\s+)?(v?\d+)/gi);
      for (const m of planMatches) {
        const pn = m[1].replace(/^v/, "");
        if (/^\d+$/.test(pn) && !planRefs.find((r: any) => r.planNumber === pn))
          planRefs.push({
            planNumber: pn,
            title: "",
            status: "verified",
            declaredFiles: [],
            testsSummary: null,
          });
      }
      const testMatch = content.match(/(\d+)\/(\d+)\s+tests?/);
      return {
        path: path.relative(this.baseDir, filePath),
        fileName,
        category,
        location,
        mtime: stats.mtime.toISOString(),
        agent,
        sessionId: null,
        title,
        plansProcessed: planRefs.length,
        planRefs,
        summary: content.slice(0, 400).replace(/\n/g, " "),
        totalTests: testMatch ? parseInt(testMatch[1]) : null,
        testsPassing: testMatch ? parseInt(testMatch[2]) : null,
        allAcceptancePassing: !content.includes("❌"),
        fullContent: content,
        newFiles: (content.match(/-\s*(?:NEW|new):/g) || []).length,
        modifyFiles: (content.match(/-\s*(?:MODIFY|modify):/g) || []).length,
      };
    } catch {
      return null;
    }
  }

  private async scanChanges() {
    this.entries = [];
    const scanDir = (
      dirPath: string,
      cat: ChangeCategory,
      loc: "active" | "archived",
    ) => {
      if (!fs.existsSync(dirPath)) return;
      for (const f of fs.readdirSync(dirPath)) {
        if (f === ".gitkeep") continue;
        const entry = this.parseFile(path.join(dirPath, f), cat, loc);
        if (entry) this.entries.push(entry);
      }
    };
    const chDir = path.join(this.baseDir, "CHANGES");
    const bakChDir = path.join(this.baseDir, ".bak", "changes");
    scanDir(path.join(chDir, "committed"), "committed", "active");
    scanDir(path.join(chDir, "flagged"), "flagged", "active");
    scanDir(path.join(chDir, "reviewed"), "reviewed", "active");
    scanDir(path.join(bakChDir, "committed"), "committed", "archived");
    scanDir(path.join(bakChDir, "flagged"), "flagged", "archived");
    scanDir(path.join(bakChDir, "reviewed"), "reviewed", "archived");
    this.entries.sort(
      (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
    );
  }

  private startWatching() {
    const chDir = path.join(this.baseDir, "CHANGES");
    const bakChDir = path.join(this.baseDir, ".bak", "changes");
    this.watcher = chokidar.watch(
      [
        path.join(chDir, "committed"),
        path.join(chDir, "flagged"),
        path.join(chDir, "reviewed"),
        path.join(bakChDir, "committed"),
        path.join(bakChDir, "flagged"),
        path.join(bakChDir, "reviewed"),
      ],
      { persistent: true, ignoreInitial: true, depth: 0 },
    );
    const handle = (filePath: string, eventType: string) => {
      const ext = path.extname(filePath);
      if (ext !== ".md") return;
      const dirName = path.basename(path.dirname(filePath));
      const loc: "active" | "archived" = filePath.includes(".bak")
        ? "archived"
        : "active";
      let cat: ChangeCategory = "committed";
      if (dirName === "flagged") cat = "flagged";
      else if (dirName === "reviewed") cat = "reviewed";
      if (eventType === "add" || eventType === "change") {
        const entry = this.parseFile(filePath, cat, loc);
        if (entry) {
          const idx = this.entries.findIndex((e) => e.path === entry.path);
          if (idx === -1) {
            this.entries.push(entry);
            this.emit({ type: "change_created", data: entry });
          } else {
            this.entries[idx] = entry;
          }
        }
      } else if (eventType === "unlink") {
        const rel = path.relative(this.baseDir, filePath);
        const idx = this.entries.findIndex((e) => e.path === rel);
        if (idx !== -1) {
          this.entries.splice(idx, 1);
          this.emit({ type: "change_archived", data: { path: rel } });
        }
      }
    };
    this.watcher.on("add", (p: string) => handle(p, "add"));
    this.watcher.on("change", (p: string) => handle(p, "change"));
    this.watcher.on("unlink", (p: string) => handle(p, "unlink"));
  }
}
