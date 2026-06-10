import fs from 'fs';
import path from 'path';
import { ParsedPlan, ArchiveEntry, ArchiveCategory } from './types';

export function parsePlanFile(filePath: string): ParsedPlan | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Extract plan number from filename:
    //   "conduit-mcp-scaffold-v030.md" → "030"
    //   "0001-semantic-projection-builder.md" → "0001"
    const planMatch = fileName.match(/v(\d+)/) || fileName.match(/^(\d+)-/);
    const planNumber = planMatch ? planMatch[1] : '000';

    // Base name from filename
    const baseName = fileName.replace(/\.md$/, '');

    // Extract title and project
    let title = '';
    let project = '';

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
    const goal = goalMatch ? goalMatch[1].trim() : '';

    // Extract Files Affected
    const filesSection = content.match(/## Files Affected\s*\n([\s\S]*?)(?=\n## )/);
    const filesAffected: string[] = [];
    if (filesSection) {
      const fileLines = filesSection[1].match(/^[-*]\s+.+/gm);
      if (fileLines) {
        fileLines.forEach((line) => {
          const filePathEntry = line.replace(/^[-*]\s+/, '').split(' —')[0].trim();
          if (filePathEntry && !filePathEntry.startsWith('none')) {
            filesAffected.push(filePathEntry);
          }
        });
      }
    }

    // Extract Acceptance Criteria
    const criteriaSection = content.match(/## Acceptance Criteria\s*\n([\s\S]*?)(?=\n## |$)/);
    const acceptanceCriteria: string[] = [];
    if (criteriaSection) {
      const criteriaLines = criteriaSection[1].match(/^###\s+\d+\.\s+(.+)/gm);
      if (criteriaLines) {
        criteriaLines.forEach((line) => {
          const text = line.replace(/^###\s+\d+\.\s+/, '').trim();
          if (text) acceptanceCriteria.push(text);
        });
      }
    }

    // Extract Dependencies
    const depsSection = content.match(/## Dependencies\s*\n([\s\S]*?)(?=\n## |$)/);
    const dependencies: string[] = [];
    if (depsSection) {
      const depLines = depsSection[1].match(/^[-*]\s+(.+)/gm);
      if (depLines) {
        depLines.forEach((line) => {
          const dep = line.replace(/^[-*]\s+/, '').trim();
          if (dep && dep !== 'none') dependencies.push(dep);
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

/** Parse a .meta.txt build-log metadata file */
export function parseMetaFile(filePath: string): Record<string, string> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (key) result[key] = value;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/** Build an ArchiveEntry from a file path */
export function buildArchiveEntry(
  filePath: string,
  category: ArchiveCategory,
  baseDir: string,
): ArchiveEntry | null {
  try {
    const stats = fs.statSync(filePath);
    const relPath = path.relative(baseDir, filePath);
    const fileName = path.basename(filePath);

    const entry: ArchiveEntry = {
      path: relPath,
      fileName,
      category,
      mtime: stats.mtime.toISOString(),
      size: stats.size,
    };

    if (category === 'completed-plans' && fileName.endsWith('.md')) {
      const parsed = parsePlanFile(filePath);
      if (parsed) {
        entry.planNumber = parsed.planNumber;
        entry.title = parsed.title;
        entry.goal = parsed.goal;
        entry.filesAffected = parsed.filesAffected;
        entry.acceptanceCriteria = parsed.acceptanceCriteria.join('\n');
        entry.dependencies = parsed.dependencies.join(', ');
      }
    }

    if (category === 'build-logs' && fileName.endsWith('.meta.txt')) {
      const meta = parseMetaFile(filePath);
      if (meta) {
        entry.sessionId = meta['SESSION_ID'] || meta['sessionId'];
        entry.exitCode = meta['EXIT_CODE'] ? parseInt(meta['EXIT_CODE'], 10) : undefined;
        entry.plansProcessed = meta['PLANS'];
        entry.retriesUsed = meta['RETRIES_USED'] ? parseInt(meta['RETRIES_USED'], 10) : undefined;
      }
    }

    return entry;
  } catch {
    return null;
  }
}
