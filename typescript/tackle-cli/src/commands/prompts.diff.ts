// commands/prompts.diff.ts —
// `tackle prompts diff <role>/<slug> --from <v1> --to <v2>`

import { getPrompt, listPromptVersions } from "../db.js";
import { unifiedDiff } from "../format.js";

export interface PromptsDiffArgs {
  role: string;
  slug: string;
  fromVersion: number;
  toVersion: number;
}

export async function runPromptsDiff(args: PromptsDiffArgs): Promise<number> {
  if (args.fromVersion === args.toVersion) {
    console.error(
      `--from and --to are equal (v${args.fromVersion}); nothing to diff.`
    );
    return 1;
  }

  // Fetch both versions in parallel. If either is missing, surface a clear
  // error BEFORE attempting the diff — saying "from v3 not found" is more
  // helpful than dumping a NULL into the diff generator.
  const [fromRow, toRow] = await Promise.all([
    getPrompt(args.role, args.slug, args.fromVersion),
    getPrompt(args.role, args.slug, args.toVersion),
  ]);

  if (!fromRow) {
    console.error(
      `Prompt not found: ${args.role}/${args.slug} v${args.fromVersion}`
    );
    return 1;
  }
  if (!toRow) {
    console.error(
      `Prompt not found: ${args.role}/${args.slug} v${args.toVersion}`
    );
    return 1;
  }

  // Friendly labels for the diff header.
  const fromLabel = `${args.role}/${args.slug} v${args.fromVersion} (body_md)`;
  const toLabel = `${args.role}/${args.slug} v${args.toVersion} (body_md)`;

  const diff = unifiedDiff(fromRow.body_md, toRow.body_md, fromLabel, toLabel);
  console.log(diff);

  // If the bodies were identical, exit with a distinct code so shell
  // pipelines can detect no-diff (matches `diff -q` behavior of exit 0
  // with "no differences" line; we use exit 0 for both — the diff text
  // itself communicates the result).
  return 0;
}

/**
 * Optional helper: if --from or --to is omitted, pick the previous and
 * current latest versions automatically. Not invoked from the main entry
 * yet — the spec requires explicit --from and --to — but exposed here for
 * future convenience.
 */
export async function resolveVersionBounds(
  role: string,
  slug: string
): Promise<{ latest: number; previous: number | undefined }> {
  const versions = await listPromptVersions(role, slug);
  if (versions.length === 0) {
    throw new Error(`No versions found for ${role}/${slug}`);
  }
  const sorted = versions.map((v) => v.version).sort((a, b) => a - b);
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
  return { latest, previous };
}
