now, is there a reason to keep plan_status and plans_by_status in conduit?
+ Thought: 596ms
Good question. Let me check who actually queries these views and whether the schema matters.
# Check conduit-mcp view references
$ grep -rn "plan_status\|plans_by_status" /home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts 2>/dev/null | grep -v "\.bak\|\.phase3\|\.v30fix" | grep -v "node_modules"
568:    DROP VIEW IF EXISTS ${PG_SCHEMA}.plans_by_status CASCADE;
569:    DROP VIEW IF EXISTS ${PG_SCHEMA}.plan_status CASCADE;
570:    CREATE VIEW ${PG_SCHEMA}.plan_status AS
626:    CREATE VIEW ${PG_SCHEMA}.plans_by_status AS
644:    FROM ${PG_SCHEMA}.plan_status ps;
1755:      // Recreate conduit.plans_by_status to avoid duplicate column name.
1760:        DROP VIEW IF EXISTS nebula.plans_by_status CASCADE;
1761:        DROP VIEW IF EXISTS conduit.plans_by_status CASCADE;
1762:        CREATE VIEW conduit.plans_by_status AS
1780:        FROM conduit.plan_status ps
1785:        CREATE OR REPLACE VIEW nebula.plans_by_status AS SELECT * FROM conduit.plans_by_status
1793:            CREATE OR REPLACE VIEW temporal.plan_status AS SELECT * FROM conduit.plan_status;
2190:      // conduit.plan_status VIEW depends on vision.receipts.created_at —
2192:      await exec(`DROP VIEW IF EXISTS conduit.plan_status CASCADE`);
2219:      // Recreate the plan_status and plans_by_status views
2221:        CREATE VIEW conduit.plan_status AS
2274:        CREATE VIEW conduit.plans_by_status AS
2280:        FROM conduit.plan_status ps
2825:// All reads go through the compat view nebula.plans or conduit.plan_status.
2831:    "SELECT * FROM plan_status WHERE id = @id",
2838:    "SELECT * FROM plan_status WHERE derived_status = @status",
2844:  return qAll("SELECT * FROM plan_status");
3003:  const all = await qAll("SELECT * FROM plan_status") as PlanRow[];
Click to collapse
# Check db_adapter view references
$ grep -rn "plan_status\|plans_by_status" /home/codex/dev/nexus/python/conduit/db_adapter.py 2>/dev/null
557:                SELECT ps.* FROM plan_status ps
566:                SELECT ps.* FROM plan_status ps
584:        query = "SELECT * FROM plan_status WHERE derived_status = 'BLOCK'"
1115:                "SELECT derived_status FROM plan_status WHERE id = %s",
1119:                _log.warning("close_orphaned_tickets: plan %s not found in plan_status", plan_id)
1258:        2. Inserts a REQUEUED receipt so plan_status → PLAN_CREATE.
# Check who references views with schema prefix
$ grep -rn "conduit\.plan_status\|conduit\.plans_by_status" /home/codex/dev/nexus/ --include="*.ts" --include="*.py" --include="*.sql" 2>/dev/null | grep -v node_modules | grep -v __pycache__ | grep -v ".bak" | grep -v ".phase3" | grep -v ".v30fix"
/home/codex/dev/nexus/bin/batch_mark_completed.py:86:        FROM conduit.plan_status ps
/home/codex/dev/nexus/bin/batch_mark_completed.py:108:        LEFT JOIN conduit.plan_status ps ON ps.id = cr.target_id
/home/codex/dev/nexus/bin/reconcile_completed.py:58:        FROM conduit.plan_status ps
/home/codex/dev/nexus/bin/reconcile_completed.py:80:        LEFT JOIN conduit.plan_status ps ON ps.id = cr.target_id
/home/codex/dev/nexus/bin/reconcile_embeddings.py:71:        FROM conduit.plan_status ps
/home/codex/dev/nexus/bin/reconcile_embeddings.py:93:        LEFT JOIN conduit.plan_status ps ON ps.id = cr.target_id
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:1755:      // Recreate conduit.plans_by_status to avoid duplicate column name.
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:1761:        DROP VIEW IF EXISTS conduit.plans_by_status CASCADE;
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:1762:        CREATE VIEW conduit.plans_by_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:1780:        FROM conduit.plan_status ps
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:1785:        CREATE OR REPLACE VIEW nebula.plans_by_status AS SELECT * FROM conduit.plans_by_status
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:1793:            CREATE OR REPLACE VIEW temporal.plan_status AS SELECT * FROM conduit.plan_status;
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:2190:      // conduit.plan_status VIEW depends on vision.receipts.created_at —
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:2192:      await exec(`DROP VIEW IF EXISTS conduit.plan_status CASCADE`);
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:2221:        CREATE VIEW conduit.plan_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:2274:        CREATE VIEW conduit.plans_by_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:2280:        FROM conduit.plan_status ps
/home/codex/dev/nexus/typescript/conduit-mcp/src/db.ts:2825:// All reads go through the compat view nebula.plans or conduit.plan_status.
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/015-add-hold-state.sql:6:--    2. Rebuilds conduit.plan_status view to handle HOLD and drop PROPOSED
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/015-add-hold-state.sql:39:DROP VIEW IF EXISTS conduit.plans_by_status;
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/015-add-hold-state.sql:40:DROP VIEW IF EXISTS conduit.plan_status CASCADE;
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/015-add-hold-state.sql:42:CREATE VIEW conduit.plan_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/015-add-hold-state.sql:97:CREATE VIEW conduit.plans_by_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/015-add-hold-state.sql:101:FROM conduit.plan_status ps;
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/015-add-hold-state.sql:134:  RAISE NOTICE '   view conduit.plan_status rebuilt';
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/030-convert-to-timestamptz.sql:10:-- IMPORTANT: conduit.plan_status VIEW depends on vision.receipts.created_at.
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/030-convert-to-timestamptz.sql:18:DROP VIEW IF EXISTS conduit.plan_status CASCADE;
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/030-convert-to-timestamptz.sql:112:CREATE VIEW conduit.plan_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/030-convert-to-timestamptz.sql:163:CREATE VIEW conduit.plans_by_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/030-convert-to-timestamptz.sql:169:FROM conduit.plan_status ps;
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/000_baseline.sql:407:--  20. conduit.plan_status view
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/000_baseline.sql:410:DROP VIEW IF EXISTS conduit.plans_by_status CASCADE;
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/000_baseline.sql:411:DROP VIEW IF EXISTS conduit.plan_status CASCADE;
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/000_baseline.sql:413:CREATE VIEW conduit.plan_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/000_baseline.sql:468:CREATE VIEW conduit.plans_by_status AS
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/000_baseline.sql:472:FROM conduit.plan_status ps;
/home/codex/dev/nexus/typescript/conduit-mcp/migrations/000_baseline.sql:499:    RAISE NOTICE '   views:   conduit.plan_status, conduit.plans_by_status';
/home/codex/dev/nexus/typescript/nebula-srv/src/routes.ts:7125:          `SELECT id, title, goal AS description, COALESCE(derived_status, 'PLAN_CREATE') AS status, 'plan' AS result_type FROM conduit.plan_status
/home/codex/dev/nexus/typescript/nebula-srv/src/routes.ts:7200:        pool.query('SELECT COUNT(*)::int AS total FROM conduit.plan_status WHERE id IS NOT NULL AND id != \'\''),
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:11:--    2. Rebuild conduit.plan_status to reference nebula.plans
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:12:--    3. Rebuild conduit.plans_by_status on top of plan_status
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:15:--  Backward compatibility: conduit.plan_status and conduit.plans_by_status
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:21:--    - Derived views at:   conduit.plan_status (references nebula.plans)
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:22:--                          conduit.plans_by_status
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:51:--  2. Rebuild conduit.plan_status view to reference nebula.plans
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:54:DROP VIEW IF EXISTS conduit.plans_by_status CASCADE;
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:55:DROP VIEW IF EXISTS conduit.plan_status CASCADE;
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:57:CREATE VIEW conduit.plan_status AS
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:112:CREATE VIEW conduit.plans_by_status AS
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:116:FROM conduit.plan_status ps;
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:135:    CREATE OR REPLACE VIEW temporal.plan_status AS SELECT * FROM conduit.plan_status;
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:153:    CREATE VIEW nebula.plan_status AS SELECT * FROM conduit.plan_status;
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:159:    CREATE VIEW nebula.plans_by_status AS SELECT * FROM conduit.plans_by_status;
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:181:  -- Check conduit.plan_status view exists and is valid
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:183:    PERFORM * FROM conduit.plan_status LIMIT 0;
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:190:    RAISE EXCEPTION '❌ conduit.plan_status view is invalid after migration';
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:203:  RAISE NOTICE '   conduit.plan_status → references nebula.plans';
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:204:  RAISE NOTICE '   conduit.plans_by_status → references conduit.plan_status';
/home/codex/dev/nexus/typescript/nebula-srv/migrations/016-move-plans-to-nebula-schema.sql:205:  RAISE NOTICE '   nebula.plan_status → mirror of conduit.plan_status';
/home/codex/dev/nexus/scripts/sql/nebula-pre-scd4-backup.sql:1372:7fbb38a0-ffab-4256-809c-42c835beffcc	architecture_note	architect	Implementation Plan: Conduit UI Modernization	# Implementation Plan: Conduit UI Modernization\n\n## Executive Summary\n\nConduit UI has fallen out of sync with the other Nexus applications being pulled into nexus-console via iframe (nebula-ui, duality, plurality). It has three categories of issues: (1) visual design mismatch, (2) plans display broken from DB-only plans, (3) tool call errors flooding the UI. This plan addresses all three.\n\n---\n\n## Issue 1: Visual Design Mismatch\n\n### Current State\n- Conduit UI uses pure CSS custom properties for theming (no Tailwind)\n- Emoji icons for navigation (house, clipboard, construction, magnifying glass, etc.)\n- Horizontal tab bar at top\n- Dark/light theme via CSS vars in styles.scss (500+ lines)\n- Inline templates and inline styles (angular.json config)\n- Angular 19 with standalone components\n\n### Reference Apps\n- **Nebula UI** (Angular 21): Tailwind CSS, vertical sidebar with SVG icon buttons, dark mode via Tailwind dark: variants, separate template files\n- **Plurality UI** (React + Vite): Tailwind CSS, modern React patterns\n- **Nexus Console**: Angular with separate CSS files, tree-view and service-graph components\n- **Duality**: Angular with SCSS component files, header/footer pattern\n\n### Required Changes\n\n1. **Add Tailwind CSS** to conduit-ui package.json\n   - Add tailwindcss dependency\n   - Configure tailwind.config.js\n   - Update src/styles.scss to use @tailwind directives\n   - Enables theme-class consistency with nebula-ui\n\n2. **Replace emoji icons with SVG icons**\n   - Use Heroicons or inline SVG paths (matching nebula-ui approach)\n   - Update all components currently using emoji icons\n\n3. **Replace horizontal nav tabs with vertical sidebar**\n   - Current: div.nav-tabs with inline a tags\n   - Target: vertical sidebar matching nebula-ui w-14 view-switcher pattern\n   - Add active state styling with SVG highlight\n   - Reposition theme toggle, chat, config buttons into sidebar\n\n4. **Update color palette and theme system**\n   - Either adopt Tailwind theme fully\n   - Or align CSS vars with nebula-ui palette (blue-600, gray-900, etc.)\n\n---\n\n## Issue 2: Plans Display Not Showing DB-Only Plans\n\n### Current State\n- conduit-mcp watcher loads plans from DB via getPlansGroupedByStatus()\n- plan-watcher.ts calls loadFromDb() during initialize()\n- getState() queries DB fresh each time via getPlansGroupedByStatus()\n- Plans stored in conduit.plans table with derived status from receipts\n- conduit-ui connects via SSE to /events for initial + incremental state\n\n### Root Causes\n\n1. **SSE event plan_state_changed triggers refetch but plan-watcher cache may be stale**\n   - plan-watcher.loadFromDb() only runs once during initialize()\n   - The in-memory cache in planWatcher.plans is not refreshed\n   - However, getState() calls getPlansGroupedByStatus() fresh from DB, bypassing the cache\n\n2. **Potential empty state if conduit-mcp was restarted**\n   - Conduit schema tables (plans, receipts, tickets) are separate from nebula schema\n   - SCD Type 4 migration only touched nebula schema -- conduit plans unaffected\n   - If conduit-mcp server is running and connected, plans should be accessible\n\n3. **Need to verify DB state**\n   - Check if conduit.plans table has rows\n   - Check if conduit.receipts table has rows\n   - Run SELECT COUNT(*) FROM conduit.plan_status to verify view returns data\n\n### Required Changes\n\n1. **Add periodic DB plan refresh to plan-watcher**\n   - loadFromDb() only runs during initialize()\n   - Add a periodic refresh (every 30s) so new plans appear without SSE\n\n2. **Add DB health diagnostics to /health endpoint**\n   - Report plan count, receipt count, ticket count\n   - Report DB connection status\n\n---\n\n## Issue 3: Tool Call Errors Flooding the UI\n\n### Current State\n- error.interceptor.ts catches ALL HTTP errors and displays via GlobalErrorService\n- Many tool calls are best-effort but still trigger error banners\n- Interceptor has timeout(15000) + retry({ count: 1, delay: 1000 })\n\n### Root Causes\n\n1. **Interceptor fires BEFORE component catch block**\n   - RxJS error flow: request -> retry(1) -> catchError(interceptor) -> throwError -> component\n   - globalError.show() runs before re-throwing\n   - Even component-level error handling can't suppress the global banner\n\n2. **Some endpoints consistently fail**\n   - /chat/config returns errors when agent chat server is not running\n   - /tools/call with query_prompts fails if PROMPTS directory doesn't exist\n   - /config/cron may fail on older servers\n\n### Required Changes\n\n1. **Add error categorization to the interceptor**\n   - Distinguish between operational errors (expected) and actionable errors (show banner)\n   - Use URL pattern matching to suppress non-critical endpoints\n\n2. **Increase timeouts**\n   - From 15s to 30s for tool calls\n   - Reduce retry count from 1 to 0 for non-idempotent operations\n\n---\n\n## Issue 4: Additional Out-of-Date Features\n\n- conduit.service.ts returns empty arrays for prompts, inspections, change reports (filesystem artifacts not read back)\n- Archive browser, inspection dashboard, prompt catalog, changes view may show no data\n- Session log SSE streaming still works (filesystem fallback)\n\n---\n\n## Implementation Order\n\n### Phase 1: Fix Functional Issues (Week 1)\n1. Debug and fix plans display -- verify DB state, fix plan-watcher refresh\n2. Fix error interceptor to suppress non-critical errors\n3. Add DB health diagnostics to /health endpoint\n\n### Phase 2: Visual Redesign (Week 2)\n4. Add Tailwind CSS to conduit-ui\n5. Redesign navigation: horizontal tabs to vertical sidebar with SVG icons\n6. Update color palette and theme system to match nebula-ui\n\n### Phase 3: Polish (Week 3)\n7. Replace remaining emoji icons across all components\n8. Clean up inline styles to consistent Tailwind classes\n9. Test all views and fix empty-state displays\n10. Run conduit-ui alongside other apps in nexus-console iframe\n\n---\n\n## Success Criteria\n- Plans display correctly in the Planner view (loaded from DB)\n- No spurious error banners on page load\n- Visual appearance matches other apps (sidebar, SVG icons, Tailwind)\n- All tool calls work without flooding UI with errors\n- Conduit UI looks cohesive alongside nebula-ui and plurality UI in nexus-console	\N	{"author": "architect", "status": "proposed", "priority": "high", "estimatedEffort": "2-3 weeks", "affectedServices": ["conduit-ui", "conduit-mcp"]}	{implementation-plan,conduit-ui,phase-2,visual-redesign,database-first}	\N	\N	\N	\N	2026-06-21 22:27:04.610748+00	2026-06-21 22:27:04.610748+00	2026-06-21 22:27:04.610748+00	9999-12-31 23:59:59+00
Click to collapse
+ Thought: 2.9s
No good reason. Here's what I found:
The views are in conduit for historical backward compatibility only. Migration 016 explicitly says:
Backward compatibility: conduit.plan_status and conduit.plans_by_status are retained as aliases. New code should use nebula equivalents.
But nebula.plan_status doesn't actually exist as a standalone view — only nebula.plans_by_status does (and it's just SELECT * FROM conduit.plans_by_status).
Who uses them with explicit conduit. prefix:
File
bin/batch_mark_completed.py
bin/reconcile_completed.py
bin/reconcile_embeddings.py
typescript/nebula-srv/src/routes.ts
Who uses them without schema prefix (search_path):
File	Query
conduit-mcp/src/db.ts	SELECT * FROM plan_status WHERE id = @id
python/conduit/db_adapter.py	SELECT * FROM plan_status
The view chain today:
nebula.implementation_plans (real table)
    ↓
nebula.plans (view: maps implementation_plans → old plans schema)
    ↓
conduit.plan_status (view: adds derived_status from receipts)
    ↓
conduit.plans_by_status (view: select from plan_status)
Recommendation: Move both views to nebula schema. They read from nebula.plans and vision.receipts — they belong in nebula. Update the 4 explicit conduit. references, and the search_path queries will find them automatically.
Want me to plan this move?
▣  Build · Big Pickle · 1m 36s
that makes, let's proceed.
+ Thought: 584ms
# Todos
[•] Get current view definitions from conduit schema
[ ] Create views in nebula schema
[ ] Drop conduit views
[ ] Update 4 explicit conduit. references in bin/ and nebula-srv
[ ] Verify views work
