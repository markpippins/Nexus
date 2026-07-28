# Architect Decision: tackle schema extension

Binding decision on all four open questions from the Engineer's proposal (record 17abc0d0) and user steer (record d614fe16).

**Decision date:** 2026-07-25
**Decision maker:** Architect
**Status:** BINDING — implementation may proceed

---

## Q1 + Q1b: Separate tables (Option B)

**Decision:** `tackle.prompts` and `tackle.tasks` are separate tables.

- **`tackle.prompts`** — reusable, versioned prompt templates. One row per (role, slug, version) with the prompt body. Templates can be parameterized (`{task_title}`, `{criteria}`, etc.) and shared across tasks. Different access pattern from procedure cards: prompts are assembled at launch; procedure cards are consulted on demand.
- **`tackle.tasks`** — concrete task assignments that reference a `prompt_id` via FK. Binds (role, task_slug, scope, acceptance_criteria, prompt_id). Launched agents pick up tasks by ID/slug; the prompt is assembled from the referenced template at launch time.

This confirms the user's steer and the Engineer's original recommendation. Prompts do NOT go into `tackle.memory` as a `record_type` discriminator.

## Q2: Per-tool-slug with mcp_id rollup

**Decision:** The ACL uses per-tool-slug granularity with an `mcp_id` convenience column.

`tackle.role_tool_access` schema:
- `role` VARCHAR NOT NULL FK to `tackle.roles(name)`
- `mcp_id` VARCHAR NOT NULL — parent MCP server identifier (e.g., "conduit-mcp")
- `tool_slug` VARCHAR NOT NULL — fully-qualified aggregator name (e.g., "conduit-mcp_query_conduit_state")
- UNIQUE(role, tool_slug) — a role cannot have duplicate grants for the same tool
- INDEX on (mcp_id) for bulk queries ("show me all tools from conduit-mcp")

Rejected alternatives:
- **Per-MCP** (too coarse): grants all tools in an MCP server when default-deny requires precision
- **Per-tool-slug-regex** (unnecessary attack surface): pattern matching adds complexity and risk of accidental over-granting; explicit rows are sufficient and auditable

## Q3: Default-deny + positive allowlist

**Decision:** A row grants access. No rows = zero tools. No denylist.

- `role_tool_access` is the sole authority for tool access
- A role with no rows in this table gets zero MCP tools at bootstrap
- The operator role's current implicit "212 tools indiscriminately" path must be re-expressed as explicit allowlist rows — no grandfathered implicit access
- No deny table, no deny column

## Implementation scope

The Engineer (or Builder) may now implement:

1. `tackle.prompts` table
2. `tackle.tasks` table (FK to prompts)
3. `tackle.role_tool_access` table (FK to roles)
4. Migration of existing prompt content from Python source / YAML to `tackle.prompts`
5. Allowlist population for each role (at minimum: operator, engineer, planner, architect, builder, reviewer, critic, analyst, inspector)
6. Bootstrap integration in the aggregator / harness to enforce the ACL at tool-listing time

R2 completion to be written after implementation lands.
