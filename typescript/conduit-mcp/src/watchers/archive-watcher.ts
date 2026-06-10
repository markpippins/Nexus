import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { BaseWatcher } from "./base";
import { ArchiveCategory, ArchiveEntry, PlanCard } from "../types";
import { buildArchiveEntry } from "../parser";

export class ArchiveWatcher extends BaseWatcher {
  entries: ArchiveEntry[] = [];
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  async initialize(): Promise<void> {
    await this.scanAllArchives();
    this.startWatching();
  }

  destroy(): void {
    if (this.watcher) this.watcher.close();
  }

  private async scanArchiveDir(dirPath: string, category: ArchiveCategory) {
    try {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file === ".gitkeep") continue;
        const filePath = path.join(dirPath, file);
        const entry = buildArchiveEntry(filePath, category, this.baseDir);
        if (entry) {
          const existing = this.entries.findIndex((e) => e.path === entry.path);
          if (existing === -1) this.entries.push(entry);
          else this.entries[existing] = entry;
        }
      }
    } catch {
      /* ignore */
    }
  }

  private async scanAllArchives() {
    this.entries = [];
    const bakDir = path.join(this.baseDir, ".bak");
    await this.scanArchiveDir(
      path.join(bakDir, "completed-plans"),
      "completed-plans",
    );
    await this.scanArchiveDir(path.join(bakDir, "build-log"), "build-logs");
    await this.scanArchiveDir(path.join(bakDir, "prompts"), "prompts");
    await this.scanArchiveDir(
      path.join(bakDir, "changes", "committed"),
      "changes",
    );
    await this.scanArchiveDir(
      path.join(bakDir, "changes", "flagged"),
      "changes",
    );
    await this.scanArchiveDir(
      path.join(bakDir, "changes", "reviewed"),
      "changes",
    );
  }

  private startWatching() {
    const bakDir = path.join(this.baseDir, ".bak");
    this.watcher = chokidar.watch(
      [
        path.join(bakDir, "completed-plans"),
        path.join(bakDir, "build-log"),
        path.join(bakDir, "prompts"),
        path.join(bakDir, "changes", "committed"),
        path.join(bakDir, "changes", "flagged"),
        path.join(bakDir, "changes", "reviewed"),
      ],
      { persistent: true, ignoreInitial: true, depth: 0 },
    );

    const handleFile = (filePath: string, eventType: string) => {
      const ext = path.extname(filePath);
      if (ext !== ".md" && ext !== ".txt" && ext !== ".log") return;
      const dirName = path.basename(path.dirname(filePath));
      let category: ArchiveCategory = "completed-plans";
      if (dirName === "build-log") category = "build-logs";
      else if (dirName === "prompts") category = "prompts";
      else if (["committed", "flagged", "reviewed"].includes(dirName))
        category = "changes";
      if (eventType === "unlink") {
        const relPath = path.relative(this.baseDir, filePath);
        const idx = this.entries.findIndex((e) => e.path === relPath);
        if (idx !== -1) this.entries.splice(idx, 1);
        return;
      }
      if (eventType === "add" || eventType === "change") {
        const entry = buildArchiveEntry(filePath, category, this.baseDir);
        if (entry) {
          const existing = this.entries.findIndex((e) => e.path === entry.path);
          if (existing === -1) {
            this.entries.push(entry);
            this.emit({ type: "plan_archived", data: entry });
          } else {
            this.entries[existing] = entry;
          }
        }
      }
    };

    this.watcher.on("add", (p: string) => handleFile(p, "add"));
    this.watcher.on("change", (p: string) => handleFile(p, "change"));
    this.watcher.on("unlink", (p: string) => handleFile(p, "unlink"));
  }
}
