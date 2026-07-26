// commands/prompts.render.ts —
// `tackle prompts render <role>/<slug> --params k=v [--version <n>]`

import { getPrompt } from "../db.js";
import { parseParamsArgs, renderPrompt } from "../render.js";
import { trimTrailingNewline } from "../format.js";

export interface PromptsRenderArgs {
  role: string;
  slug: string;
  version?: number;
  params: string[]; // raw --params flags; parsed via parseParamsArgs
}

export async function runPromptsRender(args: PromptsRenderArgs): Promise<number> {
  const prompt = await getPrompt(args.role, args.slug, args.version);
  if (!prompt) {
    const ver = args.version !== undefined ? ` v${args.version}` : " (latest)";
    console.error(
      `Prompt not found: ${args.role}/${args.slug}${ver}`
    );
    return 1;
  }

  // Parse the --params flags into a {key: val} map. Throws on malformed input.
  const params = parseParamsArgs(args.params);

  const { rendered, substituted, remaining } = renderPrompt(
    prompt.body_md,
    params
  );

  // If the prompt declares a parameter_schema, verify every provided key is
  // declared there. Unknown keys are a warning, not an error — operators may
  // be exploring substitution interactively and we shouldn't be draconian.
  const declared = Array.isArray(prompt.parameter_schema?.properties)
    ? prompt.parameter_schema?.properties
    : prompt.parameter_schema
    ? Object.keys(prompt.parameter_schema)
    : null;
  if (declared && declared.length > 0) {
    const unknown = substituted.filter((k) => !declared.includes(k));
    if (unknown.length > 0) {
      console.error(
        `warning: --params keys not declared in parameter_schema: ${unknown.join(", ")}`
      );
    }
  }

  console.log(trimTrailingNewline(rendered));
  console.log();
  console.log("---");
  if (substituted.length > 0) {
    console.log(`substituted: ${substituted.join(", ")}`);
  } else {
    console.log("substituted: (none)");
  }
  if (remaining.length > 0) {
    console.log(`remaining (no value provided): ${remaining.join(", ")}`);
  } else {
    console.log("remaining: (none — all ${...} markers substituted)");
  }
  return 0;
}
