/**
 * work-request-isa.ts
 *
 * WorkRequest Instruction Set Architecture (ISA)
 *
 * Defines the CLOSED opcode vocabulary for WorkRequests — the "bytecode"
 * that Conduit executes. No opcode may be added without going through
 * the registry versioning process. This is the execution contract.
 *
 * From the locked CCNF/WRP spec:
 *   "If it's not in the ISA, it cannot happen."
 *
 * Six opcode categories:
 *   A. FILESYSTEM            — files and directory operations
 *   B. ENVIRONMENT           — venv, dependencies, runtime config
 *   C. CODE_CONSTRUCTION     — module/source/template generation
 *   D. SERVICE_REGISTRATION  — service registry, routing, deployment
 *   E. VALIDATION            — syntax checks, tests, dry-run
 *   F. EVENT_OBSERVABILITY   — event emission, tracing, state publishing
 *
 * Each opcode has:
 *   - A stable machine-readable name (UPPER_SNAKE_CASE)
 *   - A human-readable label
 *   - A category
 *   - Parameter schema with required and optional fields
 *   - Pre/post condition templates
 *   - Idempotency semantics
 */

// ── Opcode category enum ─────────────────────────────────────────────────

export enum OpcodeCategory {
  FILESYSTEM = "FILESYSTEM",
  ENVIRONMENT = "ENVIRONMENT",
  CODE_CONSTRUCTION = "CODE_CONSTRUCTION",
  SERVICE_REGISTRATION = "SERVICE_REGISTRATION",
  VALIDATION = "VALIDATION",
  EVENT_OBSERVABILITY = "EVENT_OBSERVABILITY",
}

// ── Opcode enum (CLOSED SET — the ISA) ───────────────────────────────────
// DO NOT add opcodes here without a registry version bump.

export enum Opcode {
  // ── A. Filesystem Operations ────────────────────────────────────
  CREATE_DIR = "CREATE_DIR",
  DELETE_DIR = "DELETE_DIR",
  MOVE_PATH = "MOVE_PATH",
  COPY_PATH = "COPY_PATH",
  WRITE_FILE = "WRITE_FILE",
  APPEND_FILE = "APPEND_FILE",
  READ_FILE = "READ_FILE",
  RENAME_PATH = "RENAME_PATH",

  // ── B. Environment / Runtime Setup ──────────────────────────────
  INIT_VENV = "INIT_VENV",
  INSTALL_DEPENDENCIES = "INSTALL_DEPENDENCIES",
  SET_ENV_VAR = "SET_ENV_VAR",
  CONFIGURE_RUNTIME = "CONFIGURE_RUNTIME",
  SELECT_PYTHON_VERSION = "SELECT_PYTHON_VERSION",
  RUN_SHELL_COMMAND = "RUN_SHELL_COMMAND",

  // ── C. Code Construction ────────────────────────────────────────
  CREATE_MODULE = "CREATE_MODULE",
  WRITE_SOURCE_FILE = "WRITE_SOURCE_FILE",
  APPLY_TEMPLATE = "APPLY_TEMPLATE",
  GENERATE_CLASS = "GENERATE_CLASS",
  GENERATE_FUNCTION = "GENERATE_FUNCTION",
  PATCH_FILE = "PATCH_FILE",

  // ── D. Service / System Registration ────────────────────────────
  REGISTER_SERVICE = "REGISTER_SERVICE",
  UPDATE_SERVICE_REGISTRY = "UPDATE_SERVICE_REGISTRY",
  CONFIGURE_ROUTE = "CONFIGURE_ROUTE",
  DEFINE_ENDPOINT = "DEFINE_ENDPOINT",
  BIND_PORT = "BIND_PORT",
  DEPLOY_SERVICE = "DEPLOY_SERVICE",

  // ── E. Validation / Compilation ─────────────────────────────────
  VALIDATE_SYNTAX = "VALIDATE_SYNTAX",
  CHECK_DEPENDENCIES = "CHECK_DEPENDENCIES",
  RUN_TYPECHECK = "RUN_TYPECHECK",
  RUN_TEST_SUITE = "RUN_TEST_SUITE",
  VERIFY_SCHEMA = "VERIFY_SCHEMA",
  DRY_RUN_EXECUTION = "DRY_RUN_EXECUTION",

  // ── F. Event / Observability ────────────────────────────────────
  EMIT_EVENT = "EMIT_EVENT",
  LOG_ARTIFACT = "LOG_ARTIFACT",
  REGISTER_TRACEPOINT = "REGISTER_TRACEPOINT",
  PUBLISH_STATE = "PUBLISH_STATE",
}

// ── Opcode metadata registry (the ISA spec) ──────────────────────────────

export interface OpcodeInfo {
  opcode: Opcode;
  category: OpcodeCategory;
  label: string;
  description: string;
  /** Parameter names that are required for this opcode */
  requiredParams: string[];
  /** Allowed parameter names (will be validated) */
  allowedParams: string[];
  /** Whether this opcode is idempotent (safe to retry) */
  idempotent: boolean;
  /** Precondition template strings */
  preconditions: string[];
  /** Postcondition template strings */
  postconditions: string[];
  /** Whether this opcode is sandboxed / restricted */
  restricted: boolean;
}

export const OPCODE_CATALOG: Record<Opcode, OpcodeInfo> = {
  // ══════════════════════════════════════════════════════════════════
  // A. Filesystem
  // ══════════════════════════════════════════════════════════════════

  [Opcode.CREATE_DIR]: {
    opcode: Opcode.CREATE_DIR,
    category: OpcodeCategory.FILESYSTEM,
    label: "Create Directory",
    description: "Create a directory at the specified path. Creates parent directories if they do not exist (mkdir -p semantics).",
    requiredParams: ["target"],
    allowedParams: ["target", "mode"],
    idempotent: true,
    preconditions: ["target path does not already exist (idempotent if it does)"],
    postconditions: ["directory exists at target path"],
    restricted: false,
  },

  [Opcode.DELETE_DIR]: {
    opcode: Opcode.DELETE_DIR,
    category: OpcodeCategory.FILESYSTEM,
    label: "Delete Directory",
    description: "Remove a directory and all its contents recursively.",
    requiredParams: ["target"],
    allowedParams: ["target"],
    idempotent: true,
    preconditions: [],
    postconditions: ["target path no longer exists"],
    restricted: true,
  },

  [Opcode.WRITE_FILE]: {
    opcode: Opcode.WRITE_FILE,
    category: OpcodeCategory.FILESYSTEM,
    label: "Write File",
    description: "Write content to a file. Overwrites if the file already exists.",
    requiredParams: ["target", "content"],
    allowedParams: ["target", "content", "content_template"],
    idempotent: true,
    preconditions: ["parent directory exists"],
    postconditions: ["file exists at target with specified content"],
    restricted: false,
  },

  [Opcode.APPEND_FILE]: {
    opcode: Opcode.APPEND_FILE,
    category: OpcodeCategory.FILESYSTEM,
    label: "Append to File",
    description: "Append content to the end of an existing file.",
    requiredParams: ["target", "content"],
    allowedParams: ["target", "content"],
    idempotent: false,
    preconditions: ["file exists at target"],
    postconditions: ["content appended to target file"],
    restricted: false,
  },

  [Opcode.READ_FILE]: {
    opcode: Opcode.READ_FILE,
    category: OpcodeCategory.FILESYSTEM,
    label: "Read File",
    description: "Read the contents of a file. Pure read-only operation, no side effects.",
    requiredParams: ["target"],
    allowedParams: ["target", "encoding"],
    idempotent: true,
    preconditions: ["file exists at target"],
    postconditions: [],
    restricted: false,
  },

  [Opcode.MOVE_PATH]: {
    opcode: Opcode.MOVE_PATH,
    category: OpcodeCategory.FILESYSTEM,
    label: "Move / Rename Path",
    description: "Move or rename a file or directory from source to destination.",
    requiredParams: ["source", "target"],
    allowedParams: ["source", "target"],
    idempotent: true,
    preconditions: ["source exists", "target does not already exist"],
    postconditions: ["source no longer exists", "target exists with source's content"],
    restricted: false,
  },

  [Opcode.COPY_PATH]: {
    opcode: Opcode.COPY_PATH,
    category: OpcodeCategory.FILESYSTEM,
    label: "Copy Path",
    description: "Copy a file or directory from source to destination.",
    requiredParams: ["source", "target"],
    allowedParams: ["source", "target"],
    idempotent: true,
    preconditions: ["source exists"],
    postconditions: ["target exists with copy of source"],
    restricted: false,
  },

  [Opcode.RENAME_PATH]: {
    opcode: Opcode.RENAME_PATH,
    category: OpcodeCategory.FILESYSTEM,
    label: "Rename Path",
    description: "Rename a file or directory (shorthand for MOVE_PATH when source and target share the same parent).",
    requiredParams: ["target", "new_name"],
    allowedParams: ["target", "new_name"],
    idempotent: true,
    preconditions: ["target exists", "new_name does not exist at same parent"],
    postconditions: ["target now has new_name"],
    restricted: false,
  },

  // ══════════════════════════════════════════════════════════════════
  // B. Environment
  // ══════════════════════════════════════════════════════════════════

  [Opcode.INIT_VENV]: {
    opcode: Opcode.INIT_VENV,
    category: OpcodeCategory.ENVIRONMENT,
    label: "Initialize Virtual Environment",
    description: "Create a Python virtual environment at the specified location.",
    requiredParams: ["target"],
    allowedParams: ["target", "python_version"],
    idempotent: true,
    preconditions: ["python is available in PATH"],
    postconditions: ["virtual environment exists at target"],
    restricted: false,
  },

  [Opcode.INSTALL_DEPENDENCIES]: {
    opcode: Opcode.INSTALL_DEPENDENCIES,
    category: OpcodeCategory.ENVIRONMENT,
    label: "Install Dependencies",
    description: "Install package dependencies (via pip, npm, maven, etc.). Requires a dependency spec.",
    requiredParams: ["target", "package_manager", "dependencies"],
    allowedParams: ["target", "package_manager", "dependencies", "constraints"],
    idempotent: false,
    preconditions: ["package manager is available in PATH"],
    postconditions: ["dependencies installed and resolvable"],
    restricted: false,
  },

  [Opcode.SET_ENV_VAR]: {
    opcode: Opcode.SET_ENV_VAR,
    category: OpcodeCategory.ENVIRONMENT,
    label: "Set Environment Variable",
    description: "Set an environment variable for the execution context.",
    requiredParams: ["name", "value"],
    allowedParams: ["name", "value", "scope"],
    idempotent: true,
    preconditions: [],
    postconditions: ["environment variable is set"],
    restricted: false,
  },

  [Opcode.CONFIGURE_RUNTIME]: {
    opcode: Opcode.CONFIGURE_RUNTIME,
    category: OpcodeCategory.ENVIRONMENT,
    label: "Configure Runtime",
    description: "Configure runtime settings (e.g., application config, framework settings, ini files).",
    requiredParams: ["target", "config"],
    allowedParams: ["target", "config", "format"],
    idempotent: true,
    preconditions: [],
    postconditions: ["runtime configuration applied"],
    restricted: false,
  },

  [Opcode.SELECT_PYTHON_VERSION]: {
    opcode: Opcode.SELECT_PYTHON_VERSION,
    category: OpcodeCategory.ENVIRONMENT,
    label: "Select Python Version",
    description: "Select a specific Python version for the execution context (via pyenv, asdf, or system).",
    requiredParams: ["version"],
    allowedParams: ["version"],
    idempotent: true,
    preconditions: ["specified Python version is available"],
    postconditions: ["Python version selected for execution context"],
    restricted: false,
  },

  [Opcode.RUN_SHELL_COMMAND]: {
    opcode: Opcode.RUN_SHELL_COMMAND,
    category: OpcodeCategory.ENVIRONMENT,
    label: "Run Shell Command",
    description: "Execute a shell command. HEAVILY RESTRICTED — must be sandboxed. Prefer structured opcodes.",
    requiredParams: ["command"],
    allowedParams: ["command", "cwd", "timeout", "expected_exit_code"],
    idempotent: false,
    preconditions: [],
    postconditions: ["command executed"],
    restricted: true,
  },

  // ══════════════════════════════════════════════════════════════════
  // C. Code Construction
  // ══════════════════════════════════════════════════════════════════

  [Opcode.CREATE_MODULE]: {
    opcode: Opcode.CREATE_MODULE,
    category: OpcodeCategory.CODE_CONSTRUCTION,
    label: "Create Module",
    description: "Create a code module or package structure (e.g., Python package with __init__.py).",
    requiredParams: ["target", "language"],
    allowedParams: ["target", "language", "module_name"],
    idempotent: true,
    preconditions: ["parent directory exists"],
    postconditions: ["module structure exists at target"],
    restricted: false,
  },

  [Opcode.WRITE_SOURCE_FILE]: {
    opcode: Opcode.WRITE_SOURCE_FILE,
    category: OpcodeCategory.CODE_CONSTRUCTION,
    label: "Write Source File",
    description: "Write a source code file. Content must be derived from templates or patterns, never invented ad hoc.",
    requiredParams: ["target", "content"],
    allowedParams: ["target", "content", "language", "content_template"],
    idempotent: true,
    preconditions: ["parent directory exists", "content is template-derived"],
    postconditions: ["source file exists at target"],
    restricted: false,
  },

  [Opcode.APPLY_TEMPLATE]: {
    opcode: Opcode.APPLY_TEMPLATE,
    category: OpcodeCategory.CODE_CONSTRUCTION,
    label: "Apply Template",
    description: "Generate a file from a named template. The template must exist in the template registry.",
    requiredParams: ["target", "template_name"],
    allowedParams: ["target", "template_name", "parameters"],
    idempotent: true,
    preconditions: ["template exists in registry", "all required parameters provided"],
    postconditions: ["output file generated from template at target"],
    restricted: false,
  },

  [Opcode.GENERATE_CLASS]: {
    opcode: Opcode.GENERATE_CLASS,
    category: OpcodeCategory.CODE_CONSTRUCTION,
    label: "Generate Class",
    description: "Generate a class definition from a template pattern. Not free-form code generation.",
    requiredParams: ["target", "class_name", "language"],
    allowedParams: ["target", "class_name", "language", "extends", "implements", "properties", "methods"],
    idempotent: true,
    preconditions: ["parent directory exists"],
    postconditions: ["class definition exists at target"],
    restricted: false,
  },

  [Opcode.GENERATE_FUNCTION]: {
    opcode: Opcode.GENERATE_FUNCTION,
    category: OpcodeCategory.CODE_CONSTRUCTION,
    label: "Generate Function",
    description: "Generate a function definition from a template pattern.",
    requiredParams: ["target", "function_name", "language"],
    allowedParams: ["target", "function_name", "language", "parameters", "return_type"],
    idempotent: true,
    preconditions: ["parent directory exists"],
    postconditions: ["function definition exists at target"],
    restricted: false,
  },

  [Opcode.PATCH_FILE]: {
    opcode: Opcode.PATCH_FILE,
    category: OpcodeCategory.CODE_CONSTRUCTION,
    label: "Patch File",
    description: "Apply a structured patch to an existing file. Patch format must be explicit (not ad-hoc editing).",
    requiredParams: ["target", "patch"],
    allowedParams: ["target", "patch", "format"],
    idempotent: false,
    preconditions: ["file exists at target", "patch is syntactically valid"],
    postconditions: ["patch applied to target file"],
    restricted: false,
  },

  // ══════════════════════════════════════════════════════════════════
  // D. Service Registration
  // ══════════════════════════════════════════════════════════════════

  [Opcode.REGISTER_SERVICE]: {
    opcode: Opcode.REGISTER_SERVICE,
    category: OpcodeCategory.SERVICE_REGISTRATION,
    label: "Register Service",
    description: "Register a service in the service registry.",
    requiredParams: ["name", "type"],
    allowedParams: ["name", "type", "endpoint", "version", "tags"],
    idempotent: true,
    preconditions: [],
    postconditions: ["service is registered in the registry"],
    restricted: false,
  },

  [Opcode.UPDATE_SERVICE_REGISTRY]: {
    opcode: Opcode.UPDATE_SERVICE_REGISTRY,
    category: OpcodeCategory.SERVICE_REGISTRATION,
    label: "Update Service Registry",
    description: "Update an existing service entry in the registry.",
    requiredParams: ["name"],
    allowedParams: ["name", "endpoint", "status", "version", "tags"],
    idempotent: true,
    preconditions: ["service exists in registry"],
    postconditions: ["service entry updated"],
    restricted: false,
  },

  [Opcode.CONFIGURE_ROUTE]: {
    opcode: Opcode.CONFIGURE_ROUTE,
    category: OpcodeCategory.SERVICE_REGISTRATION,
    label: "Configure Route",
    description: "Configure a route for a service (e.g., API gateway, proxy, reverse proxy).",
    requiredParams: ["service", "route"],
    allowedParams: ["service", "route", "method", "target"],
    idempotent: true,
    preconditions: ["service exists"],
    postconditions: ["route configured"],
    restricted: false,
  },

  [Opcode.DEFINE_ENDPOINT]: {
    opcode: Opcode.DEFINE_ENDPOINT,
    category: OpcodeCategory.SERVICE_REGISTRATION,
    label: "Define Endpoint",
    description: "Define a service endpoint (URL, port, protocol).",
    requiredParams: ["service", "endpoint"],
    allowedParams: ["service", "endpoint", "port", "protocol"],
    idempotent: true,
    preconditions: [],
    postconditions: ["endpoint defined"],
    restricted: false,
  },

  [Opcode.BIND_PORT]: {
    opcode: Opcode.BIND_PORT,
    category: OpcodeCategory.SERVICE_REGISTRATION,
    label: "Bind Port",
    description: "Bind a service to a specific port.",
    requiredParams: ["service", "port"],
    allowedParams: ["service", "port", "protocol"],
    idempotent: true,
    preconditions: ["port is available"],
    postconditions: ["service bound to port"],
    restricted: false,
  },

  [Opcode.DEPLOY_SERVICE]: {
    opcode: Opcode.DEPLOY_SERVICE,
    category: OpcodeCategory.SERVICE_REGISTRATION,
    label: "Deploy Service",
    description: "Deploy a service to a target environment.",
    requiredParams: ["service", "environment"],
    allowedParams: ["service", "environment", "version", "strategy"],
    idempotent: false,
    preconditions: ["service artifacts exist", "environment is ready"],
    postconditions: ["service deployed and running"],
    restricted: true,
  },

  // ══════════════════════════════════════════════════════════════════
  // E. Validation
  // ══════════════════════════════════════════════════════════════════

  [Opcode.VALIDATE_SYNTAX]: {
    opcode: Opcode.VALIDATE_SYNTAX,
    category: OpcodeCategory.VALIDATION,
    label: "Validate Syntax",
    description: "Validate the syntax of a source file (compile check, lint).",
    requiredParams: ["target", "language"],
    allowedParams: ["target", "language"],
    idempotent: true,
    preconditions: ["target file exists"],
    postconditions: ["syntax validation result available"],
    restricted: false,
  },

  [Opcode.CHECK_DEPENDENCIES]: {
    opcode: Opcode.CHECK_DEPENDENCIES,
    category: OpcodeCategory.VALIDATION,
    label: "Check Dependencies",
    description: "Verify that all declared dependencies are resolvable and compatible.",
    requiredParams: ["target"],
    allowedParams: ["target", "package_manager"],
    idempotent: true,
    preconditions: [],
    postconditions: ["dependency resolution result available"],
    restricted: false,
  },

  [Opcode.RUN_TYPECHECK]: {
    opcode: Opcode.RUN_TYPECHECK,
    category: OpcodeCategory.VALIDATION,
    label: "Run Type Check",
    description: "Run a type checker (e.g., mypy, TypeScript compiler) on source files.",
    requiredParams: ["target"],
    allowedParams: ["target", "language", "strict"],
    idempotent: true,
    preconditions: [],
    postconditions: ["type check result available"],
    restricted: false,
  },

  [Opcode.RUN_TEST_SUITE]: {
    opcode: Opcode.RUN_TEST_SUITE,
    category: OpcodeCategory.VALIDATION,
    label: "Run Test Suite",
    description: "Execute a test suite and report results.",
    requiredParams: ["target"],
    allowedParams: ["target", "framework", "filter"],
    idempotent: true,
    preconditions: ["test dependencies are installed"],
    postconditions: ["test results available"],
    restricted: false,
  },

  [Opcode.VERIFY_SCHEMA]: {
    opcode: Opcode.VERIFY_SCHEMA,
    category: OpcodeCategory.VALIDATION,
    label: "Verify Schema",
    description: "Verify a data/schema definition against a known standard or reference.",
    requiredParams: ["target", "schema"],
    allowedParams: ["target", "schema", "strict"],
    idempotent: true,
    preconditions: [],
    postconditions: ["schema validation result available"],
    restricted: false,
  },

  [Opcode.DRY_RUN_EXECUTION]: {
    opcode: Opcode.DRY_RUN_EXECUTION,
    category: OpcodeCategory.VALIDATION,
    label: "Dry-Run Execution",
    description: "Simulate a WorkRequest or execution plan without side effects. Purely analytical.",
    requiredParams: ["work_request_id"],
    allowedParams: ["work_request_id", "implementation_plan_id"],
    idempotent: true,
    preconditions: ["work request exists"],
    postconditions: ["simulation result available without side effects"],
    restricted: false,
  },

  // ══════════════════════════════════════════════════════════════════
  // F. Event / Observability
  // ══════════════════════════════════════════════════════════════════

  [Opcode.EMIT_EVENT]: {
    opcode: Opcode.EMIT_EVENT,
    category: OpcodeCategory.EVENT_OBSERVABILITY,
    label: "Emit Event",
    description: "Emit a structured event to the event stream / KG.",
    requiredParams: ["type", "data"],
    allowedParams: ["type", "data", "source"],
    idempotent: false,
    preconditions: [],
    postconditions: ["event emitted to event stream"],
    restricted: false,
  },

  [Opcode.LOG_ARTIFACT]: {
    opcode: Opcode.LOG_ARTIFACT,
    category: OpcodeCategory.EVENT_OBSERVABILITY,
    label: "Log Artifact",
    description: "Log an execution artifact (file, metric, trace) to the audit trail.",
    requiredParams: ["artifact_type", "artifact_path"],
    allowedParams: ["artifact_type", "artifact_path", "metadata"],
    idempotent: true,
    preconditions: ["artifact exists at path"],
    postconditions: ["artifact logged in audit trail"],
    restricted: false,
  },

  [Opcode.REGISTER_TRACEPOINT]: {
    opcode: Opcode.REGISTER_TRACEPOINT,
    category: OpcodeCategory.EVENT_OBSERVABILITY,
    label: "Register Tracepoint",
    description: "Register a tracepoint for observability / debugging.",
    requiredParams: ["name", "target"],
    allowedParams: ["name", "target", "condition"],
    idempotent: true,
    preconditions: [],
    postconditions: ["tracepoint registered"],
    restricted: false,
  },

  [Opcode.PUBLISH_STATE]: {
    opcode: Opcode.PUBLISH_STATE,
    category: OpcodeCategory.EVENT_OBSERVABILITY,
    label: "Publish State",
    description: "Publish the current execution state to the state bus / KG.",
    requiredParams: ["state_type", "state"],
    allowedParams: ["state_type", "state", "target"],
    idempotent: true,
    preconditions: [],
    postconditions: ["state published to state bus"],
    restricted: false,
  },
};

// ── WorkRequest step and document types ──────────────────────────────────

/**
 * A single step in a WorkRequest execution trace.
 * Exactly matches the ISA spec: ordered steps with explicit opcodes.
 */
export interface WorkRequestStep {
  /** Step number (1-based, sequential) */
  step: number;
  /** Opcode from the closed ISA set */
  op: Opcode;
  /** Primary target path / name */
  target: string;
  /** Opcode-specific arguments */
  args: Record<string, unknown>;
  /** Precondition descriptions (informational, not enforced at runtime) */
  preconditions?: string[];
  /** Postcondition descriptions (informational, not enforced at runtime) */
  postconditions?: string[];
  /** Idempotency key for safe retry */
  idempotency_key?: string;
}

/**
 * A compiled WorkRequest document.
 * This is the "bytecode" output of the compiler pipeline.
 */
export interface WorkRequestDocument {
  work_request_id: string;
  implementation_plan_id: string;
  requirement_id?: string;

  /** Registry version used to compile this WorkRequest */
  registry_version?: string;
  /** Intent ID that generated this WorkRequest */
  intent_id?: string;
  /** Intent version that generated this WorkRequest */
  intent_version?: string;

  /** Fully ordered execution steps */
  ordered_steps: WorkRequestStep[];

  /** Global preconditions (all must be true before execution) */
  preconditions: string[];
  /** Global postconditions (all must be true after execution) */
  postconditions: string[];
  /** Known failure modes and their expected handling */
  failure_modes?: string[];
}

// ── Validation ───────────────────────────────────────────────────────────

export interface IsaValidationFinding {
  field: string;
  message: string;
}

export interface IsaValidationResult {
  valid: boolean;
  findings: IsaValidationFinding[];
}

/**
 * Validate that an opcode exists in the closed ISA set.
 * This is the "does this opcode exist?" check.
 */
export function validateOpcode(op: string): IsaValidationResult {
  if (!Object.values(Opcode).includes(op as Opcode)) {
    return {
      valid: false,
      findings: [{
        field: "op",
        message: `"${op}" is not a valid opcode in the closed ISA. Valid opcodes: ${Object.values(Opcode).join(", ")}`,
      }],
    };
  }
  return { valid: true, findings: [] };
}

/**
 * Validate that all required parameters for an opcode are present.
 */
export function validateOpcodeParams(
  op: Opcode,
  args: Record<string, unknown>,
): IsaValidationResult {
  const info = OPCODE_CATALOG[op];
  if (!info) {
    return {
      valid: false,
      findings: [{ field: "op", message: `Unknown opcode: ${op}` }],
    };
  }

  const findings: IsaValidationFinding[] = [];

  // Check required params
  for (const required of info.requiredParams) {
    if (args[required] === undefined || args[required] === null) {
      findings.push({
        field: `args.${required}`,
        message: `Required parameter "${required}" for opcode ${op} (${info.label}) is missing.`,
      });
    }
  }

  // Check that no disallowed params are present
  // (warn but don't fail — extra params might be forwarded)
  for (const key of Object.keys(args)) {
    if (!info.allowedParams.includes(key)) {
      findings.push({
        field: `args.${key}`,
        message: `Unknown parameter "${key}" for opcode ${op} (${info.label}). Allowed: ${info.allowedParams.join(", ")}.`,
      });
    }
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}

/**
 * Validate that a WorkRequest step is well-formed.
 */
export function validateWorkRequestStep(
  step: WorkRequestStep,
  index: number,
): IsaValidationResult {
  const findings: IsaValidationFinding[] = [];

  // Step number must be positive
  if (step.step < 1) {
    findings.push({
      field: `ordered_steps[${index}].step`,
      message: `Step number must be >= 1, got ${step.step}.`,
    });
  }

  // Opcode must be valid
  const opValid = validateOpcode(step.op);
  findings.push(...opValid.findings);

  if (opValid.valid) {
    // Only validate params if opcode is valid
    const paramsValid = validateOpcodeParams(step.op, step.args);
    findings.push(...paramsValid.findings);
  }

  // Target must be present
  if (!step.target || step.target.trim() === "") {
    findings.push({
      field: `ordered_steps[${index}].target`,
      message: `Step ${step.step} (${step.op}) has no target.`,
    });
  }

  // Idempotency key is recommended but not required (for now)
  if (!step.idempotency_key && step.step > 0) {
    findings.push({
      field: `ordered_steps[${index}].idempotency_key`,
      message: `Step ${step.step} (${step.op}) has no idempotency_key. Recommended for safe retry.`,
    });
  }

  return {
    valid: findings.filter((f) => f.message.includes("not a valid opcode") || f.message.includes("is missing")).length === 0,
    findings,
  };
}

/**
 * Validate a full WorkRequest document.
 */
export function validateWorkRequest(
  wr: WorkRequestDocument,
): IsaValidationResult {
  const findings: IsaValidationFinding[] = [];

  if (!wr.work_request_id) {
    findings.push({ field: "work_request_id", message: "WorkRequest ID is required." });
  }
  if (!wr.implementation_plan_id) {
    findings.push({ field: "implementation_plan_id", message: "Implementation Plan ID is required." });
  }
  if (!wr.ordered_steps || wr.ordered_steps.length === 0) {
    findings.push({ field: "ordered_steps", message: "WorkRequest must have at least one step." });
  }

  for (let i = 0; i < wr.ordered_steps.length; i++) {
    const stepResult = validateWorkRequestStep(wr.ordered_steps[i], i);
    findings.push(...stepResult.findings);
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}

/**
 * Check if a string represents a semantic goal that is collapsible to an opcode.
 * Used by the IP grammar validator to catch IP → WR boundary violations.
 */
export function findCollapsibleOpcodes(text: string): Opcode[] {
  const lower = text.toLowerCase();
  const found: Opcode[] = [];

  for (const opcode of Object.values(Opcode)) {
    const opcodeWords = opcode.toLowerCase().split("_");
    const allPresent = opcodeWords.every((w) => lower.includes(w));
    if (allPresent) {
      found.push(opcode);
    }
  }

  return found;
}
