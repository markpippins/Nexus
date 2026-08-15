/**
 * nexus-control-edge — TypeSpec Models
 */
namespace org.nexus.controledge {

  /** GET /health response. */
  model Health {
    /** Literal "ok" / "error". */
    status: string;
    /** "nexus-control-edge". */
    service: string;
    /** "up" / error message. */
    db: string;
    /** "up" / error message. */
    redis: string;
    /** ISO timestamp. */
    timestamp: string;
  }

  /** A navigation link / separator (throttler.links). */
  model Link {
    id: string;
    address: string;
    imagename: string;
    text: string | null;
    type: "link" | "separator";
    sortOrder: int32;
    createdAt: string;
    updatedAt: string;
  }

  /** POST /api/links body. */
  model LinkCreate {
    address?: string;
    imagename?: string;
    text?: string | null;
    type?: "link" | "separator";
    sortOrder?: int32;
  }

  /** PATCH /api/links/reorder body. */
  model LinkReorder {
    items: ReorderItem[];
  }

  /** One reorder instruction. */
  model ReorderItem {
    id: string;
    sortOrder: int32;
  }

  /** PATCH /api/links/{id} body (all optional — partial update). */
  model LinkUpdate {
    address?: string;
    imagename?: string;
    text?: string | null;
    type?: "link" | "separator";
    sortOrder?: int32;
  }

  /** DELETE /api/links/{id} response. */
  model Ok {
    ok: boolean;
  }

  // ── tackle-prompt-sync-srv (re-homed Wave 1.1) ───────────────────────

  /** A prompt index entry (cached per role, no body_md). */
  model PromptIndexEntry {
    slug: string;
    title: string;
    version: int32;
    tags: string[];
    updated_at: string;
  }

  /** Full prompt card (prompt:proc:{role}::{slug}). */
  model PromptCard {
    id: string;
    role: string;
    slug: string;
    version: int32;
    title: string;
    body_md: string;
    parameter_schema: Record<unknown>;
    tags: string[];
    created_at: string;
    updated_at: string;
  }

  /** A task index entry (cached per role). */
  model TaskIndexEntry {
    task_slug: string;
    scope: string;
    acceptance_criteria: string[];
    prompt_id: string;
    prompt_slug: string;
    updated_at: string;
  }

  /** Prompt-cache sync result. */
  model PromptSyncResult {
    prompts: int32;
    rolePromptIndices: int32;
    tasks: int32;
    roleTaskIndices: int32;
    timestamp: string;
  }

  /** Memory-cache sync result. */
  model MemorySyncResult {
    procedures: int32;
    roleIndices: int32;
    timestamp: string;
  }

  /** POST /refresh result — both caches. */
  model RefreshResult {
    prompts: PromptSyncResult;
    memory: MemorySyncResult;
  }

  // ── role-memory-srv (re-homed Wave 1.2) ───────────────────────────────

  /** A procedure index entry (cached per role). */
  model ProcedureIndexEntry {
    slug: string;
    summary: string;
    tags: string[];
  }

  /** Full procedure card (mem:proc:{slug}). */
  model ProcedureCard {
    slug: string;
    title: string;
    summary: string;
    body_md: string;
    tags: string[];
    triggers: string[];
    mcp_tools: string[];
    roles: string[];
    updated_at: string;
  }

  /** Generic error response. */
  model ErrorResponse {
    error: string;
  }
}
