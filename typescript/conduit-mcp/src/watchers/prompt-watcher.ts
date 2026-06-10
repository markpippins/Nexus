import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { BaseWatcher } from "./base";
import { PromptEntry } from "../types";

export class PromptWatcher extends BaseWatcher {
  entries: PromptEntry[] = [];
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  async initialize(): Promise<void> {
    await this.scanPrompts();
    this.startWatching();
  }

  destroy(): void {
    if (this.watcher) this.watcher.close();
  }

  private parseFile(
    filePath: string,
    location: "active" | "archived",
  ): PromptEntry | null {
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const fileName = path.basename(filePath);
      const promptMatch = fileName.match(/^(\d+)/);
      const promptNumber = promptMatch ? promptMatch[1] : "";
      const titleMatch = content.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : fileName;
      const summaryMatch = content.match(
        /## Summary\s*\n([\s\S]*?)(?=\n## |$)/,
      );
      const summary = summaryMatch ? summaryMatch[1].trim().slice(0, 300) : "";
      const responseMatch = content.match(
        /## Response\s*\n([\s\S]*?)(?=\n## |\n---\s*\n|$)/,
      );
      const response = responseMatch ? responseMatch[1].trim() : "";
      const planRefs: any[] = [];
      const wrMatches = content.matchAll(/WR-\d+.*?Plan\s+(\d+)/gi);
      for (const m of wrMatches) {
        const pn = m[1];
        if (!planRefs.find((r: any) => r.planNumber === pn))
          planRefs.push({ planNumber: pn, status: "unknown" });
      }
      const execMatch = content.match(
        /## Execution Order[\s\S]*?((?:\d+[,\s]*)+)/i,
      );
      const invocationOrder = execMatch ? execMatch[1].match(/\d+/g) || [] : [];
      return {
        path: path.relative(this.baseDir, filePath),
        fileName,
        promptNumber,
        project: "",
        session: "",
        title,
        summary,
        response,
        location,
        mtime: stats.mtime.toISOString(),
        planRefs,
        invocationOrder,
        fullContent: content,
      };
    } catch {
      return null;
    }
  }

  private async scanPrompts() {
    this.entries = [];
    const scan = (dirPath: string, loc: "active" | "archived") => {
      if (!fs.existsSync(dirPath)) return;
      for (const f of fs.readdirSync(dirPath)) {
        if (f === ".gitkeep") continue;
        const entry = this.parseFile(path.join(dirPath, f), loc);
        if (entry) this.entries.push(entry);
      }
    };
    scan(path.join(this.baseDir, "PROMPTS"), "active");
    scan(path.join(this.baseDir, ".bak", "prompts"), "archived");
    this.entries.sort(
      (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
    );
  }

  private startWatching() {
    const promptsDir = path.join(this.baseDir, "PROMPTS");
    const bakPromptsDir = path.join(this.baseDir, ".bak", "prompts");
    this.watcher = chokidar.watch(
      [path.join(promptsDir, "*.md"), path.join(bakPromptsDir, "*.md")],
      { persistent: true, ignoreInitial: true },
    );
    const handle = (filePath: string, eventType: string) => {
      const loc: "active" | "archived" = filePath.includes(".bak")
        ? "archived"
        : "active";
      if (eventType === "add" || eventType === "change") {
        const entry = this.parseFile(filePath, loc);
        if (entry) {
          const idx = this.entries.findIndex((e) => e.path === entry.path);
          if (idx === -1) {
            this.entries.push(entry);
            this.emit({ type: "prompt_created", data: entry });
          } else {
            this.entries[idx] = entry;
          }
        }
      } else if (eventType === "unlink") {
        const rel = path.relative(this.baseDir, filePath);
        const idx = this.entries.findIndex((e) => e.path === rel);
        if (idx !== -1) {
          this.entries.splice(idx, 1);
          this.emit({ type: "prompt_archived", data: { path: rel } });
        }
      }
    };
    this.watcher.on("add", (p: string) => handle(p, "add"));
    this.watcher.on("change", (p: string) => handle(p, "change"));
    this.watcher.on("unlink", (p: string) => handle(p, "unlink"));
  }
}
