// commands/prompts.show.ts — `tackle prompts show <role>/<slug> [--version <n>]`

import { getPrompt } from "../db.js";
import { renderKeyValue, trimTrailingNewline } from "../format.js";

export interface PromptsShowArgs {
  role: string;
  slug: string;
  version?: number;
}

export async function runPromptsShow(args: PromptsShowArgs): Promise<number> {
  const prompt = await getPrompt(args.role, args.slug, args.version);
  if (!prompt) {
    const ver = args.version !== undefined ? ` v${args.version}` : " (latest)";
    console.error(
      `Prompt not found: ${args.role}/${args.slug}${ver}`
    );
    return 1;
  }

  // Body first, then _tackle metadata block at the bottom — matches the
  // prompt bridge's prompts/get response shape, so operators see the same
  // view whether they hit the MCP bridge or the CLI.
  console.log(trimTrailingNewline(prompt.body_md));
  console.log();
  console.log("---");
  console.log("_tackle:");
  console.log(
    renderKeyValue([
      { key: "  id", value: prompt.id },
      { key: "  role", value: prompt.role },
      { key: "  slug", value: prompt.slug },
      { key: "  version", value: prompt.version },
      { key: "  title", value: prompt.title },
      { key: "  tags", value: prompt.tags },
      { key: "  parameter_schema", value: prompt.parameter_schema },
      { key: "  created_at", value: prompt.created_at },
      { key: "  updated_at", value: prompt.updated_at },
    ])
  );
  return 0;
}
