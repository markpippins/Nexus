# Add PLANS Display endpoints + MCP tools

**Project:** Nebula RMS
**Plan Number:** v0134
**Status:** pending
**Prompt:** (this turn)

## Goal

Expose the implementation plans that live on disk in `nexus/graph/IMPLEMENTATION_PLANS/{pending,planning,proposed,completed}/*.md` to:

1. the backend via two read-only REST endpoints (`GET /api/plans`, `GET /api/plans/:id`)
2. AI-agent tooling via two new MCP tools (`nebula_list_plans`, `nebula_get_plan`)

The "display" name is satisfied by these read surfaces — earlier the plans were invisible to anything that wasn't shell-aware. A dedicated Angular UI route/component is **out of scope** (followup) to keep the slice tight and mirror the Kanban API precedent (Plan 0131/0132), which shipped backend + MCP + e2e test only.

## Files Affected

- `nexus/typescript/nebula-srv/src/routes.ts` — add `GET /api/plans` and `GET /api/plans/:id`
- `nexus/typescript/nebula-mcp/src/api/nebulaClient.ts` — add `listPlans(query?)` and `getPlan(id)` wrappers
- `nexus/typescript/nebula-mcp/src/tools/index.ts` — add `nebula_list_plans` + `nebula_get_plan` MCP tools
- `nexus/typescript/nebula-srv/e2e-tests.sh` — add test #18 covering both endpoints, renumber cleanup to #19

## Acceptance Criteria

1. `GET /api/plans` returns `{ plans: [...], count }` with one entry per `.md` file under `graph/IMPLEMENTATION_PLANS/{pending,planning,proposed,completed}/`. Each entry has at minimum: `id` (basename without `.md`), `status` (the directory name), `path` (status-qualified path), `sizeBytes`, `modifiedAt` (ISO string), and `title` (first `# ` heading if present, otherwise the id).
2. `GET /api/plans?status=pending` filters to one directory. `?status=invalid` returns 400 listing the four canonical statuses.
3. `GET /api/plans?status=all` (or omitted) returns all four directories.
4. `GET /api/plans/:id` returns `{ id, status, path, title, content, sizeBytes, modifiedAt }` where `content` is the full markdown body. 404 if not found in any status dir.
5. `GET /api/plans/:id` is collision-resilient: when the same basename exists in multiple status dirs, return the **first match in directory order: pending → planning → proposed → completed** (so the most-recent work-in-progress wins). Document this in the endpoint comment.
6. Both endpoints are path-traversal safe — the resolver rejects any `id` that resolves outside `nexus/graph/IMPLEMENTATION_PLANS/`.
7. `nebula_list_plans(status?: "pending" | "planning" | "proposed" | "completed" | "all")` MCP tool returns the same shape as `GET /api/plans`.
8. `nebula_get_plan(id: string)` MCP tool returns the same shape as `GET /api/plans/:id`.
9. Both projects typecheck clean (`tsc --noEmit` on nebula-srv and nebula-mcp).
10. e2e test #18 (`bash e2e-tests.sh`) passes and covers: GET /api/plans (all + filtered), GET /api/plans/:id (real + 404), collision-resilient id resolution, status filter rejection.
11. Existing e2e tests (#1–#17, #19 cleanup) still pass.

## Implementation Notes

### backend route insertion point

Append inside `createRoutes(pool)` after the existing `// DOCS FILES` block — same logical "filesystem-backed read endpoints" neighborhood. Keep imports minimal: `fs` and `path` are already imported.

```ts
// PLANS DISPLAY (Plan 0134)
const PLANS_ROOT = path.resolve('/home/codex/dev/nexus/graph/IMPLEMENTATION_PLANS');
const PLAN_STATUS_DIRS = ['pending', 'planning', 'proposed', 'completed'] as const;
type PlanStatus = typeof PLAN_STATUS_DIRS[number];

function parsePlanTitle(md: string): string {
  const m = md.match(/^\s*#\s+(.+?)\s*$/m);
  return m ? m[1] : '';
}

function readPlanEntries(): { id: string; status: PlanStatus; absPath: string; sizeBytes: number; modifiedAt: string }[] {
  const out: ReturnType<typeof readPlanEntries> = [];
  for (const status of PLAN_STATUS_DIRS) {
    const dir = path.join(PLANS_ROOT, status);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const abs = path.join(dir, name);
      if (!fs.statSync(abs).isFile()) continue;
      const st = fs.statSync(abs);
      out.push({
        id: name.replace(/\.md$/, ''),
        status,
        absPath: abs,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    }
  }
  return out;
}

// GET /api/plans?status=pending|planning|proposed|completed|all
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const raw = (req.query.status as string | undefined) ?? 'all';
    const normalized = (raw || 'all').toLowerCase();
    if (normalized !== 'all' && !(PLAN_STATUS_DIRS as readonly string[]).includes(normalized)) {
      return res.status(400).json({ error: `status, if provided, must be one of: ${PLAN_STATUS_DIRS.join(', ')}, all` });
    }
    const all = readPlanEntries();
    const filtered = normalized === 'all' ? all : all.filter(e => e.status === normalized);
    res.json({
      plans: filtered.map(e => {
        const content = fs.readFileSync(e.absPath, 'utf-8');
        return {
          id: e.id,
          status: e.status,
          path: `${e.status}/${e.id}.md`,
          title: parsePlanTitle(content) || e.id,
          sizeBytes: e.sizeBytes,
          modifiedAt: e.modifiedAt,
        };
      }),
      count: filtered.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/plans/:id — collision-resilient (returns first match pending→planning→proposed→completed)
router.get('/plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ error: 'id must be a plan basename, with no path separators' });
    }
    for (const status of PLAN_STATUS_DIRS) {
      const candidate = path.join(PLANS_ROOT, status, `${id}.md`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const content = fs.readFileSync(candidate, 'utf-8');
        const st = fs.statSync(candidate);
        return res.json({
          id,
          status,
          path: `${status}/${id}.md`,
          title: parsePlanTitle(content) || id,
          content,
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString(),
        });
      }
    }
    return res.status(404).json({ error: `Plan ${id} not found in ${PLAN_STATUS_DIRS.join(', ')}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

### NebulaClient wrapper (plans section near end, before Import/Seed)

```ts
// ── Plans (Plan 0134) ──────────────────────────────────────
/** GET /api/plans?status= */
listPlans: (query?: { status?: 'pending' | 'planning' | 'proposed' | 'completed' | 'all' }) => {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  const qs = params.toString();
  return httpGet(`/api/plans${qs ? `?${qs}` : ''}`);
},
/** GET /api/plans/:id */
getPlan: (id: string) => httpGet(`/api/plans/${encodeURIComponent(id)}`),
```

### MCP tools

Add a `// PLANS` section after `// DOCS` and before `// USER PREFERENCES`:

```ts
server.tool(
  'nebula_list_plans',
  'List implementation plans from nexus/graph/IMPLEMENTATION_PLANS/{pending,planning,proposed,completed}/. Returns metadata + markdown body size; for full markdown use nebula_get_plan.',
  {
    status: z.enum(['pending', 'planning', 'proposed', 'completed', 'all']).optional()
      .describe('Filter by status directory. Defaults to "all" (all four directories)'),
  },
  async (args) => {
    const result = await NebulaClient.listPlans({ status: args.status });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'nebula_get_plan',
  'Fetch one implementation plan by id (basename without .md). Collisions across status dirs resolve to the first match in order: pending → planning → proposed → completed.',
  {
    id: z.string().describe('Plan id — the .md filename without the extension (e.g. "add-plans-display-endpoint-v0134")'),
  },
  async (args) => {
    const result = await NebulaClient.getPlan(args.id);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);
```

### e2e test #18

Insert before the existing cleanup test (currently #18) and renumber cleanup to #19. Coverage:

- 18a `GET /api/plans` returns count > 0 and each entry has id+status+path+sizeBytes+modifiedAt+title.
- 18b `GET /api/plans?status=pending` returns only pending entries; non-empty for this repo.
- 18c `GET /api/plans?status=garbage` returns 400 listing the four canonical statuses.
- 18d `GET /api/plans/add-plans-display-endpoint-v0134` returns this plan's markdown body (truncated assert on substring "Plan Number: v0134" or "Status: pending").
- 18e `GET /api/plans/this-plan-does-not-exist` returns 404.

## Risks / Out of Scope

- **Collision choice** (criterion 5) returns the first match by status dir. If two `.md` files share a basename in different dirs, callers must use `?status=` to disambiguate. Documented; not a 409 because plans tend to be uniquely numbered.
- **Markdown body size**: a single plan is typically under 50 KB, well within the JSON envelope. Not capped.
- **No write endpoints** — this is a read-only display surface. Plan writes go through the existing planner MCP tools (out of scope for v0134).
- **No Angular UI** — out of scope to keep the slice tight and mirror Kanban API shipping discipline. The endpoints are immediately consumable from `curl` and MCP clients.
