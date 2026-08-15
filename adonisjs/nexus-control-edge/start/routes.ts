/*
|--------------------------------------------------------------------------
| Control-plane edge — route table
|--------------------------------------------------------------------------
|
| One AdonisJS process hosting the control-plane REST surfaces:
| ui-tools, tools-aggregator, knowledge-srv, semantics-srv, terrain-srv,
| voyager-srv, tackle-srv, tackle-prompt-sync-srv, role-memory-srv
| (per binding ruling D-2026-08-14-002).
|
| Each domain registers its routes in a named group so the boot-time
| conformance validator can diff the route table against the emitted
| TypeSpec/OpenAPI contract (D-2026-08-14-004 Phase A).
|
*/

import router from '@adonisjs/core/services/router'

// ── Health ────────────────────────────────────────────────────────────
router.get('/health', [() => import('#controllers/health_controller'), 'index'])

// ── ui-tools: navigation links ────────────────────────────────────────
router.group(() => {
  router.get('/api/links', [() => import('#controllers/links_controller'), 'index'])
  router.post('/api/links', [() => import('#controllers/links_controller'), 'create'])
  router.patch('/api/links/reorder', [() => import('#controllers/links_controller'), 'reorder'])
  router.patch('/api/links/:id', [() => import('#controllers/links_controller'), 'update'])
  router.delete('/api/links/:id', [() => import('#controllers/links_controller'), 'destroy'])
})

// ── tackle-prompt-sync-srv (re-homed Wave 1.1) ────────────────────────
router.group(() => {
  router.get('/prompts/:role', [() => import('#controllers/prompt_sync_controller'), 'listRolePrompts'])
  router.get('/prompt/:role/:slug', [() => import('#controllers/prompt_sync_controller'), 'getPromptCard'])
  router.get('/tasks/:role', [() => import('#controllers/prompt_sync_controller'), 'listRoleTasks'])
})

// ── role-memory-srv (re-homed Wave 1.2) ────────────────────────────────
router.group(() => {
  router.get('/procedures/:role', [() => import('#controllers/memory_controller'), 'procedures'])
  router.get('/procedure/:slug', [() => import('#controllers/memory_controller'), 'procedure'])
})

// ── knowledge-srv (re-homed Wave 2.1) ─────────────────────────────────
router.group(() => {
  router.get('/knowledge/entities', [() => import('#controllers/knowledge_controller'), 'entities'])
  router.get('/knowledge/entities/:section/:entity_id', [() => import('#controllers/knowledge_controller'), 'entity'])
  router.get('/knowledge/entities/:section/:entity_id/relations', [() => import('#controllers/knowledge_controller'), 'relations'])
  router.get('/knowledge/edges', [() => import('#controllers/knowledge_controller'), 'edges'])
  router.get('/knowledge/cross-references', [() => import('#controllers/knowledge_controller'), 'crossReferences'])
  router.get('/knowledge/migrations', [() => import('#controllers/knowledge_controller'), 'migrations'])
  router.get('/knowledge/summary', [() => import('#controllers/knowledge_controller'), 'summary'])
})

// ── refresh: repopulate both caches (prompt:* + mem:*) from PG ────────
router.post('/refresh', [() => import('#controllers/prompt_sync_controller'), 'refresh'])

// ── tools-aggregator ──────────────────────────────────────────────────
// Landed in Wave 2 (stateless migration). Route table is frozen by the
// TypeSpec contract (typespec/v1/tools-aggregator/); uncomment the group
// and add tools_controller when the migration is executed.
// router
//   .group(() => {
//     router.get('/tools', [() => import('#controllers/tools_controller'), 'index'])
//     router.get('/tools/:name', [() => import('#controllers/tools_controller'), 'show'])
//     router.get('/tools/by-service/:service', [() => import('#controllers/tools_controller'), 'byService'])
//     router.post('/tools/call', [() => import('#controllers/tools_controller'), 'call'])
//     router.get('/registry', [() => import('#controllers/tools_controller'), 'registry'])
//     router.post('/init', [() => import('#controllers/tools_controller'), 'init'])
//   })

// ── semantics-srv: SOL IR surface ─────────────────────────────────────
// Landed in Wave 2. Contract: typespec/v1/semantics-srv/ (to be modeled).
// router
//   .group(() => {
//     router.get('/api/meta', [() => import('#controllers/semantics_controller'), 'meta'])
//     router.get('/api/evidence_item', [() => import('#controllers/semantics_controller'), 'evidence'])
//     router.get('/api/statement_evidence', [() => import('#controllers/semantics_controller'), 'statementEvidence'])//   })
// ── knowledge-srv, terrain-srv, voyager-srv, tackle-srv, role-memory-srv ──
// Re-homed in later steps; stub route groups land with each migration so the
// conformance validator only sees declared routes.
