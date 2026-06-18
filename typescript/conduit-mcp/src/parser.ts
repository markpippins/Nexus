import fs from "fs";
import path from "path";
import { ParsedPlan } from "./types";

export function parsePlanFile(filePath: string): ParsedPlan | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const fileName = path.basename(filePath);

    // Extract plan number from filename:
    //   "conduit-mcp-scaffold-v030.md" → "030"
    //   "0001-semantic-projection-builder.md" → "0001"
    const planMatch = fileName.match(/v(\d+)/) || fileName.match(/^(\d+)-/);
    const planNumber = planMatch ? planMatch[1] : "000";

    // Base name from filename
    const baseName = fileName.replace(/\.md$/, "");

    // Extract title and project
    let title = "";
    let project = "";

    // Try YAML frontmatter first
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const yaml = yamlMatch[1];
      const titleMatch = yaml.match(/title:\s*(.+)/);
      const projectMatch = yaml.match(/project:\s*(.+)/);
      if (titleMatch) title = titleMatch[1].trim();
      if (projectMatch) project = projectMatch[1].trim();
    }

    // Fallback to heading
    if (!title) {
      const headingMatch = content.match(/^#\s+(.+)/m);
      if (headingMatch) title = headingMatch[1].trim();
    }

    // Extract Goal section
    const goalMatch = content.match(/## Goal\s*\n([\s\S]*?)(?=\n## )/);
    const goal = goalMatch ? goalMatch[1].trim() : "";

    // Extract Files Affected
    const filesSection = content.match(
      /## Files Affected\s*\n([\s\S]*?)(?=\n## )/,
    );
    const filesAffected: string[] = [];
    if (filesSection) {
      const fileLines = filesSection[1].match(/^[-*]\s+.+/gm);
      if (fileLines) {
        fileLines.forEach((line) => {
          const filePathEntry = line
            .replace(/^[-*]\s+/, "")
            .split(" —")[0]
            .trim();
          if (filePathEntry && !filePathEntry.startsWith("none")) {
            filesAffected.push(filePathEntry);
          }
        });
      }
    }

    // Extract Acceptance Criteria
    const criteriaSection = content.match(
      /## Acceptance Criteria\s*\n([\s\S]*?)(?=\n## |$)/,
    );
    const acceptanceCriteria: string[] = [];
    if (criteriaSection) {
      const criteriaLines = criteriaSection[1].match(/^###\s+\d+\.\s+(.+)/gm);
      if (criteriaLines) {
        criteriaLines.forEach((line) => {
          const text = line.replace(/^###\s+\d+\.\s+/, "").trim();
          if (text) acceptanceCriteria.push(text);
        });
      }
    }

    // Extract Dependencies
    const depsSection = content.match(
      /## Dependencies\s*\n([\s\S]*?)(?=\n## |$)/,
    );
    const dependencies: string[] = [];
    if (depsSection) {
      const depLines = depsSection[1].match(/^[-*]\s+(.+)/gm);
      if (depLines) {
        depLines.forEach((line) => {
          const dep = line.replace(/^[-*]\s+/, "").trim();
          if (dep && dep !== "none") dependencies.push(dep);
        });
      }
    }

    return {
      fileName,
      planNumber,
      baseName,
      title,
      project,
      goal,
      filesAffected,
      acceptanceCriteria,
      dependencies,
    };
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err);
    return null;
  }
}
