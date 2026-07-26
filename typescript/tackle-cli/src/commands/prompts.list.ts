// commands/prompts.list.ts — `tackle prompts list [--role <role>]`

import { listPrompts } from "../db.js";
import { renderTable } from "../format.js";

export interface PromptsListArgs {
  role?: string;
}

export async function runPromptsList(args: PromptsListArgs): Promise<number> {
  const rows = await listPrompts(args.role);
  if (rows.length === 0) {
    console.log(
      args.role
        ? `(no prompts found for role "${args.role}")`
        : "(no prompts found)"
    );
    return 0;
  }

  const table = renderTable(
    [
      { header: "ROLE", width: 22 },
      { header: "SLUG", width: 32 },
      { header: "VER", width: 5, align: "right" },
      { header: "TITLE", width: 60 },
      { header: "TAGS", width: 30 },
      { header: "UPDATED", width: 21 },
    ],
    rows.map((r) => [
      r.role,
      r.slug,
      r.version,
      r.title,
      r.tags,
      r.updated_at,
    ])
  );
  console.log(table);
  console.log();
  console.log(`(${rows.length} prompt${rows.length === 1 ? "" : "s"})`);
  return 0;
}
