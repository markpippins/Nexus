// commands/tasks.list.ts — `tackle tasks list [--role <role>] [--all]`

import { listTasks } from "../db.js";
import { renderTable } from "../format.js";

export interface TasksListArgs {
  role?: string;
  all: boolean;
}

export async function runTasksList(args: TasksListArgs): Promise<number> {
  const rows = await listTasks(args.role, args.all);
  if (rows.length === 0) {
    console.log(
      args.role
        ? `(no tasks found for role "${args.role}"${args.all ? " (incl. inactive)" : ""})`
        : `(no tasks found${args.all ? " (incl. inactive)" : ""})`
    );
    return 0;
  }

  const table = renderTable(
    [
      { header: "ROLE", width: 22 },
      { header: "TASK_SLUG", width: 32 },
      { header: "SCOPE", width: 28 },
      { header: "ACTIVE", width: 8 },
      { header: "ACCEPTANCE_CRITERIA", width: 50 },
      { header: "UPDATED", width: 21 },
    ],
    rows.map((t) => [
      t.role,
      t.task_slug,
      t.scope,
      t.active ? "yes" : "no",
      t.acceptance_criteria,
      t.updated_at,
    ])
  );
  console.log(table);
  console.log();
  console.log(`(${rows.length} task${rows.length === 1 ? "" : "s"})`);
  return 0;
}
