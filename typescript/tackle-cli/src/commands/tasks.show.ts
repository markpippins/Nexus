// commands/tasks.show.ts — `tackle tasks show <task-slug>`

import { getTask } from "../db.js";
import { renderKeyValue } from "../format.js";

export interface TasksShowArgs {
  taskSlug: string;
}

export async function runTasksShow(args: TasksShowArgs): Promise<number> {
  const task = await getTask(args.taskSlug, /* withPrompt */ true);
  if (!task) {
    console.error(`Task not found: ${args.taskSlug}`);
    return 1;
  }

  // The prompt ref is shown as role/slug@version for human readability.
  // The DB stores prompt_id (a UUID); we joined tackle.prompts in getTask()
  // so we can resolve it back to the template's role/slug/version triple.
  const promptRef =
    task.prompt_role && task.prompt_slug && task.prompt_version !== undefined
      ? `${task.prompt_role}/${task.prompt_slug}@v${task.prompt_version}`
      : `(unresolved prompt_id: ${task.prompt_id})`;

  console.log(renderKeyValue([
    { key: "task_slug", value: task.task_slug },
    { key: "role", value: task.role },
    { key: "scope", value: task.scope },
    { key: "active", value: task.active },
    { key: "acceptance_criteria", value: task.acceptance_criteria },
    { key: "prompt_ref", value: promptRef },
    { key: "prompt_id", value: task.prompt_id },
    { key: "created_at", value: task.created_at },
    { key: "updated_at", value: task.updated_at },
  ]));
  return 0;
}
