/**
 * ip-grammar-validator.ts
 *
 * Implementation Plan Grammar Validator
 *
 * Enforces the WRP compiler contract: Implementation Plans must be pure
 * semantic graphs (DOMAIN_COMPONENT, CAPABILITY, CONSTRAINT) with NO
 * execution semantics leaked from the WorkRequest layer.
 *
 * Validation rules (from the locked CCNF/WRP spec):
 *   1. VERB SCAN      — reject execution verbs (create, write, install…)
 *   2. PROCEDURAL     — reject step ordering / temporal sequencing
 *   3. TOOL LEAKAGE   — reject filesystem, runtime, language-specific terms
 *   4. COLLAPSIBILITY — reject if node maps 1:1 to a WorkRequest opcode
 *
 * Invariant:
 *   An Implementation Plan must remain valid under any change of execution
 *   strategy (Python → Java, local → containerized). If it changes, it
 *   was actually a WorkRequest disguised as an IP.
 */

// ── Forbidden execution verbs ────────────────────────────────────────────
// These belong ONLY in WorkRequest opcodes, never in Implementation Plans.
const FORBIDDEN_VERBS = new Set([
  // Filesystem
  "create", "write", "delete", "move", "copy", "rename", "append", "read",
  // Environment
  "install", "initialize", "configure", "deploy", "compile", "build",
  "run", "execute", "start", "stop", "restart", "launch",
  // Code construction
  "generate", "implement", "patch", "scaffold", "refactor",
  // Service
  "register", "bind", "mount", "publish",
  // Validation
  "validate", "verify", "check", "test", "lint",
  // Overly generic synonyms
  "setup", "set up", "bootstrap", "init",
]);

// ── Procedural / temporal sequencing patterns ────────────────────────────
const PROCEDURAL_PATTERNS = [
  /\bstep\s+\d+/i,               // "step 1", "step 2"
  /\bfirst\b.*\bthen\b/i,         // "first … then"
  /\bthen\b.*\bfinally\b/i,       // "then … finally"
  /\bnext\b.*\b(?:we|will|need)/i,
  /\bin\s+order\s+to\b/i,        // "in order to"
  /\b(?:after|before)\s+.*ing\b/i, // "after creating", "before deploying"
  /^\d+\.\s+/,                    // "1. do this" (numbered lists as steps)
];

// ── Tool / environment / filesystem leakage patterns ─────────────────────
const TOOL_LEAKAGE_PATTERNS = [
  // Filesystem paths
  /\/(?:home|tmp|var|etc|usr|opt|mnt)/i,
  /\.\.[\/\\]/,
  /[a-zA-Z]:\\/,                  // Windows paths
  // Shell commands / runtime
  /\b(?:npm|yarn|pip|mvn|gradle|docker|kubectl|helm|git)\s+(?:install|run|exec|build|deploy|add)\b/i,
  /\bvenv\b/i,
  /\bvirtualenv\b/i,
  /\brequirements\.txt\b/i,
  /\bpackage\.json\b/i,
  /\bDockerfile\b/i,
  /\bdocker-compose\b/i,
  /\bMakefile\b/i,
  // Language-specific frameworks
  /\b(?:React|Angular|Vue|Django|Flask|FastAPI|Spring|Express|Next\.?js|Nuxt)\s+(?:component|module|app|service|controller)\b/i,
  // Code-level constructs
  /\b(?:class|interface|function|method|import|export|extends|implements)\s+\w+\b/i,
  /\bsemicolon\b/i,
  /\bsyntax\b/i,
  // Generic tool leakage
  /\b(?:CLI|API|SDK|library|framework)\s+(?:call|command|invocation|usage)\b/i,
];

// ── WorkRequest opcode set (for collapsibility check) ────────────────────
const WORK_REQUEST_OPCODES = new Set([
  // Filesystem
  "CREATE_DIR", "DELETE_DIR", "MOVE_PATH", "COPY_PATH",
  "WRITE_FILE", "APPEND_FILE", "READ_FILE", "RENAME_PATH",
  // Environment
  "INIT_VENV", "INSTALL_DEPENDENCIES", "SET_ENV_VAR",
  "CONFIGURE_RUNTIME", "SELECT_PYTHON_VERSION", "RUN_SHELL_COMMAND",
  // Code construction
  "CREATE_MODULE", "WRITE_SOURCE_FILE", "APPLY_TEMPLATE",
  "GENERATE_CLASS", "GENERATE_FUNCTION", "PATCH_FILE",
  // Service registration
  "REGISTER_SERVICE", "UPDATE_SERVICE_REGISTRY", "CONFIGURE_ROUTE",
  "DEFINE_ENDPOINT", "BIND_PORT", "DEPLOY_SERVICE",
  // Validation
  "VALIDATE_SYNTAX", "CHECK_DEPENDENCIES", "RUN_TYPECHECK",
  "RUN_TEST_SUITE", "VERIFY_SCHEMA", "DRY_RUN_EXECUTION",
  // Event / observability
  "EMIT_EVENT", "LOG_ARTIFACT", "REGISTER_TRACEPOINT", "PUBLISH_STATE",
]);

// ── Opcode-to-readable label mapping (for collapsibility error messages) ─
const OPCODE_LABELS: Record<string, string> = {
  "CREATE_DIR": "create a directory",
  "DELETE_DIR": "delete a directory",
  "WRITE_FILE": "write a file",
  "INIT_VENV": "initialize a virtual environment",
  "INSTALL_DEPENDENCIES": "install dependencies",
  "RUN_SHELL_COMMAND": "run a shell command",
  "REGISTER_SERVICE": "register a service",
  "DEPLOY_SERVICE": "deploy a service",
  "VALIDATE_SYNTAX": "validate syntax",
  "RUN_TEST_SUITE": "run test suite",
  "EMIT_EVENT": "emit an event",
};

// ── Validation result types ──────────────────────────────────────────────

export interface ValidationFinding {
  rule: "VERB_SCAN" | "PROCEDURAL" | "TOOL_LEAKAGE" | "COLLAPSIBILITY";
  severity: "ERROR" | "WARNING";
  message: string;
  match?: string;
}

export interface ValidationResult {
  valid: boolean;
  findings: ValidationFinding[];
  score: number; // 0-100, higher = cleaner
}

// ── Tokenizer helpers ────────────────────────────────────────────────────

/** Extract individual words from a string (lowercased) */
function words(s: string): string[] {
  return s.toLowerCase().split(/[\s,;:.!?()\[\]{}"'`]+/).filter(Boolean);
}

// ── Rule 1: Verb scan ────────────────────────────────────────────────────

function checkVerbScan(text: string, field: string): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const tokens = words(text);
  for (const token of tokens) {
    if (FORBIDDEN_VERBS.has(token)) {
      findings.push({
        rule: "VERB_SCAN",
        severity: "ERROR",
        message: `Execution verb "${token}" found in ${field}. Implementation Plans must describe *what* exists (CAPABILITY, DOMAIN_COMPONENT), not *how* to build it.`,
        match: token,
      });
    }
  }
  return findings;
}

// ── Rule 2: Procedural language detection ────────────────────────────────

function checkProcedural(text: string, field: string): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const pattern of PROCEDURAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        rule: "PROCEDURAL",
        severity: "ERROR",
        message: `Procedural / temporal sequencing detected in ${field}: "${match[0]}". Implementation Plans are graphs, not workflows. Use dependency edges (depends_on, enables) instead.`,
        match: match[0],
      });
    }
  }
  return findings;
}

// ── Rule 3: Tool leakage check ───────────────────────────────────────────

function checkToolLeakage(text: string, field: string): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const pattern of TOOL_LEAKAGE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        rule: "TOOL_LEAKAGE",
        severity: "ERROR",
        message: `Tool / environment / filesystem leakage detected in ${field}: "${match[0]}". Implementation Plans must be tool-independent. File paths, shell commands, and framework-specific references belong in WorkRequest opcodes.`,
        match: match[0],
      });
    }
  }
  return findings;
}

// ── Rule 4: Collapsibility test ──────────────────────────────────────────

function checkCollapsibility(text: string, field: string): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const lower = text.toLowerCase();
  const tokens = words(text);

  for (const [opcode, label] of Object.entries(OPCODE_LABELS)) {
    // Check if the text directly describes this opcode
    const opcodeWords = opcode.toLowerCase().split("_");
    // If all words of the opcode appear in the text, it's collapsible
    const allOpcodeWordsPresent = opcodeWords.every((w) =>
      tokens.includes(w)
    );
    if (allOpcodeWordsPresent) {
      findings.push({
        rule: "COLLAPSIBILITY",
        severity: "WARNING",
        message: `Goal "${text}" in ${field} maps directly to WorkRequest opcode ${opcode} (${label}). Implementation Plans should describe *what* the system does, not *how* to execute. Consider rephrasing as a CAPABILITY or DOMAIN_COMPONENT.`,
        match: opcode,
      });
    }
  }

  // Check for direct execution mapping patterns
  const directMapPatterns = [
    /\b(?:create|write|generate|implement)\s+(?:a|an|the)\s+\w+\s+(?:file|class|function|module|service|component|directory)\b/i,
    /\binstall\s+\w+\s+(?:dependenc|package|library|module)/i,
    /\brun\s+\w+\s+(?:test|script|command|build)/i,
    /\bset\s+up\s+(?:a|an|the)\s+\w+/i,
  ];
  for (const pattern of directMapPatterns) {
    const match = lower.match(pattern);
    if (match) {
      findings.push({
        rule: "COLLAPSIBILITY",
        severity: "ERROR",
        message: `Goal "${text}" in ${field} directly describes an execution action. Implementation Plans must describe structure (DOMAIN_COMPONENT, CAPABILITY), not instructions. This belongs in a WorkRequest.`,
        match: match[0],
      });
    }
  }

  return findings;
}

// ── Main validation entry point ────────────────────────────────────────

export interface ImplementationPlanFields {
  title?: string;
  goal?: string;
  content?: string;
  acceptanceCriteria?: string[];
  dependencies?: string[];
  decompositionNodes?: Array<{ type: string; name: string; rationale?: string }>;
  openQuestions?: string[];
  riskNotes?: string[];
  validationRules?: string[];
}

/**
 * Validate Implementation Plan fields against the WRP grammar rules.
 *
 * @param plan — Partial plan fields to validate (at least one must be present)
 * @returns ValidationResult with all findings and a cleanliness score
 */
export function validateImplementationPlan(
  plan: ImplementationPlanFields,
): ValidationResult {
  const findings: ValidationFinding[] = [];

  const fieldsToCheck = [
    { value: plan.title, name: "title" },
    { value: plan.goal, name: "goal" },
    { value: plan.content, name: "content" },
  ];

  for (const { value, name } of fieldsToCheck) {
    if (!value) continue;
    findings.push(...checkVerbScan(value, name));
    findings.push(...checkProcedural(value, name));
    findings.push(...checkToolLeakage(value, name));
    findings.push(...checkCollapsibility(value, name));
  }

  // Check acceptance criteria
  if (plan.acceptanceCriteria) {
    for (let i = 0; i < plan.acceptanceCriteria.length; i++) {
      const field = `acceptanceCriteria[${i}]`;
      const value = plan.acceptanceCriteria[i];
      findings.push(...checkVerbScan(value, field));
      findings.push(...checkProcedural(value, field));
      findings.push(...checkToolLeakage(value, field));
      findings.push(...checkCollapsibility(value, field));
    }
  }

  // Check decomposition nodes
  if (plan.decompositionNodes) {
    for (let i = 0; i < plan.decompositionNodes.length; i++) {
      const node = plan.decompositionNodes[i];
      const field = `decomposition[${i}].${node.type || "node"}`;
      findings.push(...checkVerbScan(node.name || "", field));
      findings.push(...checkProcedural(node.name || "", field));
      findings.push(...checkToolLeakage(node.name || "", field));
      findings.push(...checkCollapsibility(node.name || "", field));
      if (node.rationale) {
        findings.push(...checkVerbScan(node.rationale, `${field}/rationale`));
      }
    }
  }

  // Check open questions — these should be questions, not instructions
  if (plan.openQuestions) {
    for (let i = 0; i < plan.openQuestions.length; i++) {
      const value = plan.openQuestions[i];
      if (!/[?？]/.test(value)) {
        findings.push({
          rule: "PROCEDURAL",
          severity: "WARNING",
          message: `Open question ${i} in openQuestions does not end with a question mark: "${value}". Open questions should be framed as unresolved design space, not instructions.`,
          match: value.slice(0, 80),
        });
      }
    }
  }

  // Calculate score: 0-100, higher is cleaner
  const errorCount = findings.filter((f) => f.severity === "ERROR").length;
  const warningCount = findings.filter((f) => f.severity === "WARNING").length;
  const totalIssues = errorCount + warningCount;

  // Score starts at 100, minus 15 per error, minus 5 per warning
  const score = Math.max(0, Math.min(100, 100 - errorCount * 15 - warningCount * 5));

  return {
    valid: errorCount === 0,
    findings,
    score,
  };
}

/**
 * Quick single-field validation — useful for inline tool validation.
 */
export function validateIpGoal(goal: string): ValidationResult {
  return validateImplementationPlan({ goal });
}

/**
 * Validate that a plan field contains only permitted node types
 * (DOMAIN_COMPONENT, CAPABILITY, CONSTRAINT, OPEN_QUESTION).
 */
const PERMITTED_NODE_TYPES = new Set([
  "DOMAIN_COMPONENT",
  "CAPABILITY",
  "CONSTRAINT",
  "OPEN_QUESTION",
]);

export function validateNodeType(type: string): ValidationFinding | null {
  if (!PERMITTED_NODE_TYPES.has(type)) {
    return {
      rule: "VERB_SCAN",
      severity: "ERROR",
      message: `Node type "${type}" is not in the permitted set (DOMAIN_COMPONENT, CAPABILITY, CONSTRAINT, OPEN_QUESTION). Implementation Plan nodes must be structural, not execution-oriented.`,
      match: type,
    };
  }
  return null;
}

/**
 * Validate permitted edge types (depends_on, enables, requires, constrains,
 * composes, specializes, communicates_with).
 */
const PERMITTED_EDGE_TYPES = new Set([
  "depends_on",
  "enables",
  "requires",
  "constrains",
  "composes",
  "specializes",
  "communicates_with",
]);

export function validateEdgeType(type: string): ValidationFinding | null {
  if (!PERMITTED_EDGE_TYPES.has(type)) {
    const allowed = [...PERMITTED_EDGE_TYPES].join(", ");
    return {
      rule: "PROCEDURAL",
      severity: "ERROR",
      message: `Edge type "${type}" is not in the permitted set (${allowed}). Implementation Plan edges must be semantic relationships, not procedural ordering.`,
      match: type,
    };
  }
  return null;
}
