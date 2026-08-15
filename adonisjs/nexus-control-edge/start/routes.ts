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

// ── semantics-srv (re-homed Wave 2.2) ─────────────────────────────────
// SOL IR backbone. Generic per-table CRUD is registry-driven; the special
// routes below are registered FIRST so they win over the `:table` wildcard
// (Adonis matches in registration order).
router.group(() => {
  // Meta + filter-list overrides (2-segment, registered before generic).
  router.get('/api/meta', [() => import('#controllers/semantics_controller'), 'meta'])
  router.get('/api/evidence_item', [() => import('#controllers/semantics_controller'), 'evidenceItems'])
  router.get('/api/statement_evidence', [() => import('#controllers/semantics_controller'), 'statementEvidence'])

  // Envelope routes (override generic GET /api/:table/:id).
  router.get('/api/canonical_asset/:id', [() => import('#controllers/semantics_controller'), 'assetEnvelope'])
  router.get('/api/asset_revision/:id', [() => import('#controllers/semantics_controller'), 'revisionEnvelope'])

  // Evidence join endpoints.
  router.get('/api/concept_relationship/:id/evidence', [() => import('#controllers/semantics_controller'), 'conceptRelationshipEvidence'])
  router.get('/api/representation_relationship/:id/evidence', [() => import('#controllers/semantics_controller'), 'representationRelationshipEvidence'])

  // T02 asset sub-resources.
  router.get('/api/canonical_asset/:id/revisions', [() => import('#controllers/semantics_controller'), 'assetRevisions'])
  router.post('/api/canonical_asset/:id/revisions', [() => import('#controllers/semantics_controller'), 'createAssetRevision'])
  router.get('/api/canonical_asset/:id/identity-claims', [() => import('#controllers/semantics_controller'), 'assetClaims'])
  router.post('/api/canonical_asset/:id/identity-claims', [() => import('#controllers/semantics_controller'), 'createAssetClaim'])
  router.get('/api/canonical_asset/:id/relations', [() => import('#controllers/semantics_controller'), 'assetRelations'])
  router.post('/api/canonical_asset/:id/relations', [() => import('#controllers/semantics_controller'), 'createAssetRelation'])
  router.get('/api/canonical_asset/:id/external-ids', [() => import('#controllers/semantics_controller'), 'assetExternalIds'])
  router.post('/api/canonical_asset/:id/external-ids', [() => import('#controllers/semantics_controller'), 'createExternalId'])
  router.delete('/api/canonical_asset/:id/external-ids/:eid', [() => import('#controllers/semantics_controller'), 'deleteExternalId'])

  // Lifecycle transitions.
  router.post('/api/asset_identity_claim/:id/resolve', [() => import('#controllers/semantics_controller'), 'resolveClaim'])
  router.post('/api/drift_finding/:id/resolve', [() => import('#controllers/semantics_controller'), 'resolveDriftFinding'])
})

// ── voyager-srv (re-homed Wave 2.4) ───────────────────────────────────
// Registered BEFORE the semantics generic :table wildcards so the literal
// /api/entities, /api/spans, /api/scan-epochs routes win the match.
router.group(() => {
  router.get('/api/health', [() => import('#controllers/voyager_controller'), 'health'])
  router.get('/api/scan-epochs', [() => import('#controllers/voyager_controller'), 'scanEpochs'])
  router.get('/api/scan-epochs/:id', [() => import('#controllers/voyager_controller'), 'scanEpoch'])
  router.get('/api/observations/files', [() => import('#controllers/voyager_controller'), 'fileObservations'])
  router.get('/api/observations/files/by-id/:observationId', [() => import('#controllers/voyager_controller'), 'fileObservationByObsId'])
  router.get('/api/observations/files/:id', [() => import('#controllers/voyager_controller'), 'fileObservation'])
  router.get('/api/observations/directories', [() => import('#controllers/voyager_controller'), 'directoryObservations'])
  router.get('/api/topology/signals', [() => import('#controllers/voyager_controller'), 'topologySignals'])
  router.get('/api/topology/signals/:id', [() => import('#controllers/voyager_controller'), 'topologySignal'])
  router.get('/api/topology/edge-hints', [() => import('#controllers/voyager_controller'), 'edgeHints'])
  router.get('/api/entities', [() => import('#controllers/voyager_controller'), 'entities'])
  router.get('/api/entities/by-id/:entityId', [() => import('#controllers/voyager_controller'), 'entityByEntityId'])
  router.get('/api/entities/:id', [() => import('#controllers/voyager_controller'), 'entity'])
  router.get('/api/spans', [() => import('#controllers/voyager_controller'), 'spans'])
  router.get('/api/spans/:id', [() => import('#controllers/voyager_controller'), 'span'])
  router.get('/api/stats', [() => import('#controllers/voyager_controller'), 'stats'])
})

// ── semantics-srv generic per-table CRUD (registered last so the literal
//    special + voyager /api/* routes win the match). ──────────────────
router.group(() => {
  router.get('/api/:table', [() => import('#controllers/semantics_controller'), 'listTable'])
  router.get('/api/:table/:id', [() => import('#controllers/semantics_controller'), 'getTableRow'])
  router.post('/api/:table', [() => import('#controllers/semantics_controller'), 'addTableRow'])
  router.patch('/api/:table/:id', [() => import('#controllers/semantics_controller'), 'updateTableRow'])
  router.delete('/api/:table/:id', [() => import('#controllers/semantics_controller'), 'softDeleteTableRow'])
})

// ── terrain-srv (re-homed Wave 2.3) ───────────────────────────────────
router.group(() => {
  router.get('/terrain/servers', [() => import('#controllers/terrain_controller'), 'servers'])
  router.get('/terrain/mcp-servers', [() => import('#controllers/terrain_controller'), 'mcpServers'])
  router.post('/terrain/mcp-servers', [() => import('#controllers/terrain_controller'), 'registerMcpServer'])
  router.get('/terrain/runnable-services', [() => import('#controllers/terrain_controller'), 'runnableServices'])
  router.post('/terrain/runnable-services', [() => import('#controllers/terrain_controller'), 'registerRunnableService'])
  router.get('/terrain/cli-tools', [() => import('#controllers/terrain_controller'), 'cliTools'])
  router.post('/terrain/cli-tools', [() => import('#controllers/terrain_controller'), 'registerCliTool'])
  router.get('/terrain/services/:name', [() => import('#controllers/terrain_controller'), 'serviceLookup'])
  router.get('/terrain/services/:name/running', [() => import('#controllers/terrain_controller'), 'serviceRunning'])
  router.patch('/terrain/services/status', [() => import('#controllers/terrain_controller'), 'setServiceStatus'])
  router.get('/terrain/dependencies', [() => import('#controllers/terrain_controller'), 'dependencies'])
  router.post('/terrain/dependencies', [() => import('#controllers/terrain_controller'), 'registerDependency'])
  router.get('/terrain/summary', [() => import('#controllers/terrain_controller'), 'summary'])
})

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
