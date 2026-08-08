/**
 * slash-command-mcp — DSL parser.
 *
 * Grammar (line-oriented, single command string):
 *
 *   command-line := [ service SP ] command [ SP args... ]
 *   service      := [a-z0-9-]+        (service name, e.g. "nebula-mcp" | "nebula")
 *   command      := [a-zA-Z0-9_]+     (tool name, e.g. "nebula_list_agent_records")
 *   args         := flag | positional
 *   flag         := --name[=value] | --name SP value | --name (bare → boolean true)
 *   positional   := bare token (collected in order; rejected at execution
 *                   unless the tool declares positional-friendly params)
 *
 * Values may be quoted with single or double quotes; quotes may contain
 * spaces and `=` signs. A leading `/` is tolerated (mirrors slash/ usage).
 *
 * No shell is ever involved — this parser only splits the DSL string.
 */

export interface ParsedCommand {
  /** Service name if explicitly given (normalized, may include "-mcp" suffix) */
  service?: string;
  /** Tool/command name (exact, as registered) */
  command: string;
  /** Raw string flag values keyed by flag name (before coercion) */
  args: Record<string, string>;
  /** Bare positional tokens in order */
  positionals: string[];
  /** Whether a leading `/` was present */
  hadSlash: boolean;
}

export class DslParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DslParseError";
  }
}

/**
 * Tokenize a DSL string respecting single/double quotes.
 * Returns tokens with a `quoted` flag: a quoted token is always a VALUE,
 * never a flag — even if its content starts with "--".
 */
export interface DslToken {
  value: string;
  quoted: boolean;
}

export function tokenize(input: string): DslToken[] {
  const tokens: DslToken[] = [];
  let current = "";
  let quote: string | null = null;
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quote) {
      if (ch === quote) {
        quote = null;
        quoted = true;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (current.length === 0) {
        // Opening quote at token start — the whole token is a quoted value.
        quote = ch;
        quoted = false;
        current = "";
      } else {
        // Quote inside an unquoted token (e.g. --name="value") — strip the
        // quote chars and consume the rest in quote mode so the value is
        // clean ("--name=value" → name="value").
        quote = ch;
        quoted = true;
      }
      continue;
    }

    if (ch === " " || ch === "\t") {
      if (current.length > 0) {
        tokens.push({ value: current, quoted });
        current = "";
        quoted = false;
      }
      continue;
    }

    current += ch;
  }

  if (quote) {
    throw new DslParseError("Unterminated quote in command line");
  }
  if (current.length > 0) {
    tokens.push({ value: current, quoted });
  }

  return tokens;
}

/** Normalize a service token: strip leading "/" and trailing "-mcp" is NOT stripped (keep as-is for matching). */
function isFlagToken(tok: DslToken): boolean {
  // Quoted tokens are always values — never flags, even if they start with "--".
  return !tok.quoted && tok.value.startsWith("--");
}

/**
 * Parse a full DSL command line.
 *
 * @param input e.g. `/nebula-mcp nebula_list_agent_records --role architect --limit "5"`
 * @returns structured parse; throws DslParseError on malformed input
 */
export function parseCommandLine(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new DslParseError("Empty command line");
  }

  const hadSlash = trimmed.startsWith("/");
  const body = hadSlash ? trimmed.slice(1).trim() : trimmed;

  const tokens = tokenize(body);
  if (tokens.length === 0) {
    throw new DslParseError("Empty command line");
  }

  // Decide service vs command: the first token is a service if the second
  // token exists and is a command-looking token (no "--").
  let service: string | undefined;
  let command: string;
  let restTokens: DslToken[];

  if (tokens.length >= 2 && !isFlagToken(tokens[0]) && !isFlagToken(tokens[1])) {
    service = tokens[0].value;
    command = tokens[1].value;
    restTokens = tokens.slice(2);
  } else {
    command = tokens[0].value;
    restTokens = tokens.slice(1);
  }

  if (isFlagToken({ value: command, quoted: tokens[0].quoted })) {
    throw new DslParseError(`Expected a command name, got flag "${command}"`);
  }

  // Parse flags + positionals from restTokens.
  const args: Record<string, string> = {};
  const positionals: string[] = [];

  let i = 0;
  while (i < restTokens.length) {
    const tok = restTokens[i];

    if (isFlagToken(tok)) {
      const eqIdx = tok.value.indexOf("=");
      let name: string;
      let value: string | undefined;

      if (eqIdx >= 0) {
        name = tok.value.slice(2, eqIdx);
        value = tok.value.slice(eqIdx + 1);
      } else {
        name = tok.value.slice(2);
        // Bare flag: next token is a value only if it exists and isn't a flag
        const next = restTokens[i + 1];
        if (next !== undefined && !isFlagToken(next)) {
          value = next.value;
          i++;
        }
      }

      if (!name) {
        throw new DslParseError(`Empty flag name in "${tok.value}"`);
      }
      args[name] = value ?? "";
      i++;
      continue;
    }

    positionals.push(tok.value);
    i++;
  }

  return { service, command, args, positionals, hadSlash };
}
