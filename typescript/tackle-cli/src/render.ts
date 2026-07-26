// render.ts — ${param} substitution for `tackle prompts render`.
//
// The prompt body_md uses ${key} markers. We substitute each provided key
// with its value. Unsubstituted markers are left intact so the operator can
// see which parameters are still missing — the same template may be reused
// across many task scopes with different bindings.
//
// We deliberately do NOT shell-escape or HTML-escape: prompt templates are
// consumed by agents as text, not executed. The CLI is an inspection tool;
// operators are expected to provide literal substitution values.

export interface RenderParams {
  [key: string]: string;
}

/**
 * Parse repeated `--params key=val` args into a RenderParams map.
 *
 * Accepts only the repeated-flag form:
 *   --params key=val --params key2=val2
 *
 * Commas in values are preserved (no comma-based splitting).
 * Later occurrences of the same key win.
 */
export function parseParamsArgs(flags: string[]): RenderParams {
  const out: RenderParams = {};
  for (const flag of flags) {
    const eq = flag.indexOf("=");
    if (eq < 0) {
      throw new Error(
        `Invalid --params pair "${flag}" — expected key=value (no '=' found).`
      );
    }
    const key = flag.slice(0, eq).trim();
    const val = flag.slice(eq + 1);
    if (!key) {
      throw new Error(`Invalid --params pair "${flag}" — empty key.`);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Substitute ${key} markers in body with the provided values.
 *
 * Uses a regex that matches `${name}` literally (no whitespace inside).
 * Any `${name}` whose key is not in `params` is left intact.
 *
 * Returns the rendered body and a list of keys that were substituted
 * (for confirmation reporting) plus a list of keys that remain
 * unsubstituted (so the operator can see what's missing).
 */
export function renderPrompt(
  body: string,
  params: RenderParams
): { rendered: string; substituted: string[]; remaining: string[] } {
  const substituted = new Set<string>();
  const remaining = new Set<string>();

  const rendered = body.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      substituted.add(key);
      return params[key];
    }
    remaining.add(key);
    return match;
  });

  return {
    rendered,
    substituted: Array.from(substituted).sort(),
    remaining: Array.from(remaining).sort(),
  };
}
