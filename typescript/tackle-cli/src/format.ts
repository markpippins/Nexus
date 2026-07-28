// format.ts — terminal output helpers: column-aligned tables, metadata
// blocks, and a small unified-diff generator that doesn't pull in an
// external dependency.
//
// We hand-roll these rather than depend on `cli-table3` / `diff` / `chalk`
// because the CLI's surface is small and keeping deps thin makes the
// package easy to ship as a single `npm link` binary.

// ── Tables ──────────────────────────────────────────────────────────

export interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "right";
}

/**
 * Render an array of rows as a fixed-width column table.
 *
 * `columns[i].width` is the max width for column i; values wider than that
 * are truncated with an ellipsis. Each value is stringified via String().
 */
export function renderTable(
  columns: TableColumn[],
  rows: (string | number | boolean | string[])[][]
): string {
  // Compute actual column widths based on the header + widest cell.
  const widths = columns.map((c) => c.header.length);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = formatCell(row[i]);
      if (cell.length > widths[i]) widths[i] = cell.length;
    }
  }
  // Cap at column.width (the declared max).
  for (let i = 0; i < widths.length; i++) {
    if (columns[i].width && widths[i] > columns[i].width) {
      widths[i] = columns[i].width;
    }
  }

  const sep = "  ";
  const headerLine = columns
    .map((c, i) => padCell(c.header, widths[i], c.align))
    .join(sep);
  const dividerLine = columns
    .map((_, i) => "-".repeat(widths[i]))
    .join(sep);

  const body = rows.map((row) =>
    row
      .map((cell, i) => padCell(formatCell(cell), widths[i], columns[i].align))
      .join(sep)
  );

  return [headerLine, dividerLine, ...body].join("\n");
}

function formatCell(v: string | number | boolean | string[]): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return "[" + v.join(", ") + "]";
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function padCell(s: string, width: number, align?: "left" | "right"): string {
  // Truncate with ellipsis if too long.
  if (s.length > width) {
    return s.slice(0, Math.max(0, width - 1)) + "…";
  }
  if (align === "right") {
    return " ".repeat(width - s.length) + s;
  }
  return s + " ".repeat(width - s.length);
}

// ── Metadata block ───────────────────────────────────────────────────

/**
 * Render a key/value block as:
 *   key: value
 *   key: value
 *
 * Multi-line values are indented under the key. Arrays are formatted as
 * bullet lists.
 */
export function renderKeyValue(
  entries: { key: string; value: unknown }[]
): string {
  const lines: string[] = [];
  for (const { key, value } of entries) {
    if (typeof value === "undefined" || value === null) {
      lines.push(`${key}: (none)`);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${String(item)}`);
        }
      }
      continue;
    }
    if (typeof value === "object") {
      lines.push(`${key}:`);
      lines.push(`  ${JSON.stringify(value)}`);
      continue;
    }
    lines.push(`${key}: ${String(value)}`);
  }
  return lines.join("\n");
}

/** Truncate a long string for compact display, with an ellipsis. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

/** Trim a single trailing newline (cosmetic — bodies end with \n in DB). */
export function trimTrailingNewline(s: string): string {
  return s.replace(/\n$/, "");
}

// ── Unified diff (hand-rolled) ─────────────────────────────────────

/**
 * Produce a minimal unified-diff between two strings.
 *
 * We split each body on "\n" and walk the two line arrays with a simple
 * LCS-based edit script. The output format matches `git diff`:
 *
 *   @@ -L_old,C_old +L_new,C_new @@
 *    unchanged
 *   -removed
 *   +added
 *    unchanged
 *
 * This is a straightforward O(n*m) DP — bodies are small (≤~20KB), so
 * keeping the implementation trivial is fine and avoids a `diff` dep.
 */
export function unifiedDiff(
  from: string,
  to: string,
  fromLabel?: string,
  toLabel?: string
): string {
  const a = from.split("\n");
  const b = to.split("\n");

  // Build LCS table.
  const n = a.length;
  const m = b.length;
  // dp[i][j] = length of LCS of a[i..] and b[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Walk the table to extract the edit script as [op, line] tuples.
  type Op = " " | "-" | "+";
  const ops: { op: Op; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: " ", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: "-", line: a[i] });
      i++;
    } else {
      ops.push({ op: "+", line: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ op: "-", line: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ op: "+", line: b[j] });
    j++;
  }

  // Render the unified-diff header.
  const header: string[] = [];
  if (fromLabel !== undefined) header.push(`--- ${fromLabel}`);
  if (toLabel !== undefined) header.push(`+++ ${toLabel}`);

  if (ops.length === 0) {
    return header.join("\n") + (header.length ? "\n" : "") + "(no differences)";
  }

  // Coalesce into a single hunk (small inputs — one hunk is fine).
  const hunkLines: string[] = [];
  let aStart = 1; // 1-indexed
  let bStart = 1;
  let aCount = 0;
  let bCount = 0;
  for (const op of ops) {
    if (op.op === " " || op.op === "-") aCount++;
    if (op.op === " " || op.op === "+") bCount++;
  }
  hunkLines.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
  for (const op of ops) {
    hunkLines.push(`${op.op}${op.line}`);
  }

  return [...header, ...hunkLines].join("\n");
}
