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

// ── nebula-srv (re-homed Wave 3.1) — canonical data-plane surface ────────
// Registered BEFORE the semantics generic :table wildcards below so the
// literal /api/* routes win the match. SQL runs on the named `nebula`
// connection (searchPath nebula,public) with $n→? conversion in
// nebula_helpers. Knowledge entity/edge/summary/cross-reference paths are
// already served by knowledge_controller (Wave 2.1); only the nebula-unique
// /knowledge/view + /op-registry routes register here.
router.group(() => {
  router.get('/api/systems', [() => import('#controllers/nebula_hierarchy_controller'), 'listSystems'])
  router.post('/api/systems', [() => import('#controllers/nebula_hierarchy_controller'), 'createSystem'])
  router.patch('/api/systems/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'updateSystem'])
  router.delete('/api/systems/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'deleteSystem'])
  router.get('/api/systems/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'getSystem'])
  router.post('/api/subsystems', [() => import('#controllers/nebula_hierarchy_controller'), 'createSubsystem'])
  router.patch('/api/subsystems/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'updateSubsystem'])
  router.delete('/api/subsystems/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'deleteSubsystem'])
  router.get('/api/subsystems/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'getSubsystem'])
  router.post('/api/features', [() => import('#controllers/nebula_hierarchy_controller'), 'createFeature'])
  router.patch('/api/features/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'updateFeature'])
  router.delete('/api/features/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'deleteFeature'])
  router.get('/api/features/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'getFeature'])
  router.get('/api/requirements', [() => import('#controllers/nebula_hierarchy_controller'), 'listRequirements'])
  router.get('/api/requirements/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'getRequirement'])
  router.get('/api/requirements/:id/children', [() => import('#controllers/nebula_hierarchy_controller'), 'requirementChildren'])
  router.get('/api/requirements/:id/dependencies', [() => import('#controllers/nebula_hierarchy_controller'), 'requirementDependencies'])
  router.post('/api/requirements/:id/dependencies', [() => import('#controllers/nebula_hierarchy_controller'), 'createRequirementDependency'])
  router.delete('/api/requirements/:id/dependencies/:depId', [() => import('#controllers/nebula_hierarchy_controller'), 'deleteRequirementDependency'])
  router.post('/api/requirements', [() => import('#controllers/nebula_hierarchy_controller'), 'createRequirement'])
  router.patch('/api/requirements/batch', [() => import('#controllers/nebula_hierarchy_controller'), 'batchUpdateRequirements'])
  router.patch('/api/requirements/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'updateRequirement'])
  router.delete('/api/requirements/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'deleteRequirement'])
  router.post('/api/requirements/:id/move', [() => import('#controllers/nebula_hierarchy_controller'), 'moveRequirement'])
  router.post('/api/requirements/:id/compile', [() => import('#controllers/nebula_hierarchy_controller'), 'compileRequirement'])
  router.post('/api/systems/:id/folders', [() => import('#controllers/nebula_hierarchy_controller'), 'createSystemFolder'])
  router.delete('/api/systems/:systemId/folders/:folderId', [() => import('#controllers/nebula_hierarchy_controller'), 'deleteSystemFolder'])
  router.get('/api/sessions', [() => import('#controllers/nebula_hierarchy_controller'), 'listSessions'])
  router.post('/api/sessions', [() => import('#controllers/nebula_hierarchy_controller'), 'createSession'])
  router.patch('/api/sessions/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'updateSession'])
  router.post('/api/features/move', [() => import('#controllers/nebula_hierarchy_controller'), 'moveFeature'])
  router.post('/api/subsystems/move', [() => import('#controllers/nebula_hierarchy_controller'), 'moveSubsystem'])
  router.post('/api/systems/demote/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'demoteSystem'])
  router.delete('/api/sessions/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'deleteSession'])
  router.get('/api/workspaces', [() => import('#controllers/nebula_hierarchy_controller'), 'listWorkspaces'])
  router.post('/api/workspaces', [() => import('#controllers/nebula_hierarchy_controller'), 'createWorkspace'])
  router.delete('/api/workspaces/:id', [() => import('#controllers/nebula_hierarchy_controller'), 'deleteWorkspace'])
  router.get('/api/docs', [() => import('#controllers/nebula_docs_controller'), 'docs'])
  router.get('/api/subsystems/:id/docs', [() => import('#controllers/nebula_docs_controller'), 'subsystemDocs'])
  router.get('/api/systems/:id/docs', [() => import('#controllers/nebula_docs_controller'), 'systemDocs'])
  router.get('/api/plans', [() => import('#controllers/nebula_docs_controller'), 'listPlans'])
  router.get('/api/plans/:id', [() => import('#controllers/nebula_docs_controller'), 'getPlan'])
  router.post('/api/plans', [() => import('#controllers/nebula_docs_controller'), 'createPlan'])
  router.get('/api/implementation-plans/statuses', [() => import('#controllers/nebula_docs_controller'), 'planStatuses'])
  router.get('/api/systems/:id/implementation-plans', [() => import('#controllers/nebula_docs_controller'), 'systemPlans'])
  router.get('/api/subsystems/:id/implementation-plans', [() => import('#controllers/nebula_docs_controller'), 'subsystemPlans'])
  router.get('/api/features/:id/implementation-plans', [() => import('#controllers/nebula_docs_controller'), 'featurePlans'])
  router.get('/api/audit', [() => import('#controllers/nebula_docs_controller'), 'listAudit'])
  router.get('/api/audit/graph', [() => import('#controllers/nebula_docs_controller'), 'auditGraph'])
  router.get('/api/audit/:id', [() => import('#controllers/nebula_docs_controller'), 'getAuditFile'])
  router.post('/api/audit/sync', [() => import('#controllers/nebula_docs_controller'), 'syncAudit'])
  router.post('/api/audit/:id/regenerate', [() => import('#controllers/nebula_docs_controller'), 'regenerateAuditFile'])
  router.get('/api/preferences', [() => import('#controllers/nebula_docs_controller'), 'getPreferences'])
  router.put('/api/preferences/:key', [() => import('#controllers/nebula_docs_controller'), 'setPreference'])
  router.delete('/api/preferences/:key', [() => import('#controllers/nebula_docs_controller'), 'deletePreference'])
  router.get('/api/systems/:id/info', [() => import('#controllers/nebula_docs_controller'), 'listInfoTabs'])
  router.put('/api/systems/:id/info/:tabId', [() => import('#controllers/nebula_docs_controller'), 'saveInfoTab'])
  router.delete('/api/systems/:id/info/:tabId', [() => import('#controllers/nebula_docs_controller'), 'deleteInfoTab'])
  router.post('/api/import', [() => import('#controllers/nebula_docs_controller'), 'importData'])
  router.post('/api/seed', [() => import('#controllers/nebula_docs_controller'), 'seed'])
  router.get('/api/harvests', [() => import('#controllers/nebula_harvest_controller'), 'listHarvests'])
  router.get('/api/harvests/distribution', [() => import('#controllers/nebula_harvest_controller'), 'harvestDistribution'])
  router.get('/api/harvests/:id', [() => import('#controllers/nebula_harvest_controller'), 'getHarvest'])
  router.get('/api/harvests/:id/transcript', [() => import('#controllers/nebula_harvest_controller'), 'harvestTranscript'])
  router.post('/api/harvest-candidates/:id/promote', [() => import('#controllers/nebula_harvest_controller'), 'promoteCandidate'])
  router.post('/api/harvest-candidates/promote-to-plan', [() => import('#controllers/nebula_harvest_controller'), 'promoteToPlan'])
  router.post('/api/harvests', [() => import('#controllers/nebula_harvest_controller'), 'createHarvest'])
  router.delete('/api/harvests/:id', [() => import('#controllers/nebula_harvest_controller'), 'deleteHarvest'])
  router.get('/api/plans/:planRef/candidates', [() => import('#controllers/nebula_harvest_controller'), 'planCandidates'])
  router.get('/api/systems/:id/harvest-candidates', [() => import('#controllers/nebula_harvest_controller'), 'systemHarvestCandidates'])
  router.get('/api/subsystems/:id/harvest-candidates', [() => import('#controllers/nebula_harvest_controller'), 'subsystemHarvestCandidates'])
  router.get('/api/features/:id/harvest-candidates', [() => import('#controllers/nebula_harvest_controller'), 'featureHarvestCandidates'])
  router.get('/api/intent-records', [() => import('#controllers/nebula_harvest_controller'), 'listIntentRecords'])
  router.get('/api/systems/:id/intent-records', [() => import('#controllers/nebula_harvest_controller'), 'systemIntentRecords'])
  router.get('/api/subsystems/:id/intent-records', [() => import('#controllers/nebula_harvest_controller'), 'subsystemIntentRecords'])
  router.get('/api/features/:id/intent-records', [() => import('#controllers/nebula_harvest_controller'), 'featureIntentRecords'])
  router.get('/api/intent-records/:id', [() => import('#controllers/nebula_harvest_controller'), 'getIntentRecord'])
  router.get('/api/agendas', [() => import('#controllers/nebula_harvest_controller'), 'listAgendas'])
  router.get('/api/agendas/:id', [() => import('#controllers/nebula_harvest_controller'), 'getAgenda'])
  router.get('/api/systems/:id/agendas', [() => import('#controllers/nebula_harvest_controller'), 'systemAgendas'])
  router.get('/api/subsystems/:id/agendas', [() => import('#controllers/nebula_harvest_controller'), 'subsystemAgendas'])
  router.get('/api/features/:id/agendas', [() => import('#controllers/nebula_harvest_controller'), 'featureAgendas'])
  router.delete('/api/agendas/:id/items', [() => import('#controllers/nebula_harvest_controller'), 'deleteAgendaItem'])
  router.post('/api/agendas/:id/finalize', [() => import('#controllers/nebula_harvest_controller'), 'finalizeAgenda'])
  router.post('/api/agendas/:id/items', [() => import('#controllers/nebula_harvest_controller'), 'addAgendaItem'])
  router.get('/api/specifications', [() => import('#controllers/nebula_harvest_controller'), 'listSpecifications'])
  router.get('/api/specifications/:id', [() => import('#controllers/nebula_harvest_controller'), 'getSpecification'])
  router.get('/api/systems/:id/specifications', [() => import('#controllers/nebula_harvest_controller'), 'systemSpecifications'])
  router.get('/api/subsystems/:id/specifications', [() => import('#controllers/nebula_harvest_controller'), 'subsystemSpecifications'])
  router.get('/api/features/:id/specifications', [() => import('#controllers/nebula_harvest_controller'), 'featureSpecifications'])
  router.get('/api/work-requests', [() => import('#controllers/nebula_harvest_controller'), 'listWorkRequests'])
  router.get('/api/work-requests/:id', [() => import('#controllers/nebula_harvest_controller'), 'getWorkRequest'])
  router.get('/api/systems/:id/work-requests', [() => import('#controllers/nebula_harvest_controller'), 'systemWorkRequests'])
  router.get('/api/subsystems/:id/work-requests', [() => import('#controllers/nebula_harvest_controller'), 'subsystemWorkRequests'])
  router.get('/api/features/:id/work-requests', [() => import('#controllers/nebula_harvest_controller'), 'featureWorkRequests'])
  router.get('/api/harvest-candidates', [() => import('#controllers/nebula_harvest_controller'), 'listHarvestCandidates'])
  router.get('/api/harvest-candidates/:id', [() => import('#controllers/nebula_harvest_controller'), 'getHarvestCandidate'])
  router.get('/api/candidates', [() => import('#controllers/nebula_harvest_controller'), 'listCandidatesAlias'])
  router.get('/api/candidates/:id', [() => import('#controllers/nebula_harvest_controller'), 'getCandidateAlias'])
  router.patch('/api/harvest-candidates/:id', [() => import('#controllers/nebula_harvest_controller'), 'updateHarvestCandidate'])
  router.post('/api/harvest-candidates/:id/spawn-plan', [() => import('#controllers/nebula_harvest_controller'), 'spawnPlan'])
  router.post('/api/harvest-candidates', [() => import('#controllers/nebula_harvest_controller'), 'createHarvestCandidate'])
  router.post('/api/specifications/:id/link-requirements', [() => import('#controllers/nebula_harvest_controller'), 'linkSpecRequirements'])
  router.get('/api/specs', [() => import('#controllers/nebula_harvest_controller'), 'listSpecs'])
  router.get('/api/specs/:id', [() => import('#controllers/nebula_harvest_controller'), 'getSpec'])
  router.post('/api/harvest-candidates/discover', [() => import('#controllers/nebula_harvest_controller'), 'discoverCandidates'])
  router.get('/api/agent-records', [() => import('#controllers/nebula_records_controller'), 'listAgentRecords'])
  router.get('/api/agent-records/:id', [() => import('#controllers/nebula_records_controller'), 'getAgentRecord'])
  router.post('/api/agent-records/search', [() => import('#controllers/nebula_records_controller'), 'searchAgentRecords'])
  router.post('/api/agent-records', [() => import('#controllers/nebula_records_controller'), 'createAgentRecord'])
  router.patch('/api/agent-records/:id', [() => import('#controllers/nebula_records_controller'), 'updateAgentRecord'])
  router.delete('/api/agent-records/:id', [() => import('#controllers/nebula_records_controller'), 'deleteAgentRecord'])
  router.get('/api/inbox-pointer/:role', [() => import('#controllers/nebula_records_controller'), 'getInboxPointer'])
  router.put('/api/inbox-pointer/:role', [() => import('#controllers/nebula_records_controller'), 'setInboxPointer'])
  router.get('/api/inbox-pointers', [() => import('#controllers/nebula_records_controller'), 'listInboxPointers'])
  router.get('/api/projections', [() => import('#controllers/nebula_records_controller'), 'listProjections'])
  router.post('/api/projections', [() => import('#controllers/nebula_records_controller'), 'createProjection'])
  router.post('/api/projections/:id/render', [() => import('#controllers/nebula_records_controller'), 'renderProjection'])
  router.delete('/api/projections/:id', [() => import('#controllers/nebula_records_controller'), 'deleteProjection'])
  router.post('/api/cross-references', [() => import('#controllers/nebula_records_controller'), 'createCrossReference'])
  router.get('/api/cross-references', [() => import('#controllers/nebula_records_controller'), 'listCrossReferences'])
  router.get('/api/cross-references/:id', [() => import('#controllers/nebula_records_controller'), 'getCrossReference'])
  router.delete('/api/cross-references/:id', [() => import('#controllers/nebula_records_controller'), 'deleteCrossReference'])
  router.post('/api/evidence-links', [() => import('#controllers/nebula_records_controller'), 'createEvidenceLink'])
  router.get('/api/evidence-links', [() => import('#controllers/nebula_records_controller'), 'listEvidenceLinks'])
  router.get('/api/evidence-links/:id', [() => import('#controllers/nebula_records_controller'), 'getEvidenceLink'])
  router.delete('/api/evidence-links/:id', [() => import('#controllers/nebula_records_controller'), 'deleteEvidenceLink'])
  router.delete('/api/evidence-links', [() => import('#controllers/nebula_records_controller'), 'bulkDeleteEvidenceLinks'])
  router.get('/api/conversations/by-snapshot/:snapshotId', [() => import('#controllers/nebula_segmentation_controller'), 'conversationBySnapshot'])
  router.get('/api/conversations', [() => import('#controllers/nebula_segmentation_controller'), 'listConversations'])
  router.get('/api/conversations/:id/snapshots', [() => import('#controllers/nebula_segmentation_controller'), 'conversationSnapshots'])
  router.get('/api/snapshots/:id/blocks', [() => import('#controllers/nebula_segmentation_controller'), 'snapshotBlocks'])
  router.get('/api/conversations/:id/blocks', [() => import('#controllers/nebula_segmentation_controller'), 'conversationBlocks'])
  router.get('/api/conversations/by-snapshot/:snapshotId/blocks', [() => import('#controllers/nebula_segmentation_controller'), 'conversationBySnapshotBlocks'])
  router.post('/api/snapshots', [() => import('#controllers/nebula_segmentation_controller'), 'createSnapshot'])
  router.post('/api/segments', [() => import('#controllers/nebula_segmentation_controller'), 'createSegment'])
  router.patch('/api/segments/:id', [() => import('#controllers/nebula_segmentation_controller'), 'updateSegment'])
  router.delete('/api/segments/:id', [() => import('#controllers/nebula_segmentation_controller'), 'deleteSegment'])
  router.post('/api/projection-overrides', [() => import('#controllers/nebula_segmentation_controller'), 'createProjectionOverride'])
  router.delete('/api/projection-overrides/:id', [() => import('#controllers/nebula_segmentation_controller'), 'deleteProjectionOverride'])
  router.get('/api/snapshots/:id/projection', [() => import('#controllers/nebula_segmentation_controller'), 'snapshotProjection'])
  router.get('/api/snapshots/:id/references', [() => import('#controllers/nebula_segmentation_controller'), 'snapshotReferences'])
  router.get('/api/knowledge/view', [() => import('#controllers/nebula_knowledge_controller'), 'view'])
  router.post('/api/op-registry', [() => import('#controllers/nebula_knowledge_controller'), 'createOpRegistryEntry'])
  router.get('/api/op-registry', [() => import('#controllers/nebula_knowledge_controller'), 'listOpRegistry'])
  router.get('/api/op-registry/:id', [() => import('#controllers/nebula_knowledge_controller'), 'getOpRegistryEntry'])
  router.patch('/api/op-registry/:id/deprecate', [() => import('#controllers/nebula_knowledge_controller'), 'deprecateOpRegistryEntry'])
  router.patch('/api/op-registry/:id/supersede', [() => import('#controllers/nebula_knowledge_controller'), 'supersedeOpRegistryEntry'])
  router.delete('/api/op-registry/:id', [() => import('#controllers/nebula_knowledge_controller'), 'deleteOpRegistryEntry'])
  router.post('/api/op-registry/fork', [() => import('#controllers/nebula_knowledge_controller'), 'forkOpRegistryEntry'])
  router.get('/api/op-registry/:id/lineage', [() => import('#controllers/nebula_knowledge_controller'), 'opRegistryLineage'])
  router.get('/api/conduit/plans', [() => import('#controllers/nebula_conduit_controller'), 'listConduitPlans'])
  router.get('/api/conduit/plans/as-of', [() => import('#controllers/nebula_conduit_controller'), 'conduitPlansAsOf'])
  router.get('/api/conduit/plans/:id/history', [() => import('#controllers/nebula_conduit_controller'), 'conduitPlanHistory'])
  router.get('/api/conduit/plans/:id/receipts', [() => import('#controllers/nebula_conduit_controller'), 'conduitPlanReceipts'])
  router.get('/api/conduit/deleted-plans', [() => import('#controllers/nebula_conduit_controller'), 'conduitDeletedPlans'])
  router.post('/api/execution/requests', [() => import('#controllers/nebula_conduit_controller'), 'createExecutionRequest'])
  router.get('/api/execution/requests', [() => import('#controllers/nebula_conduit_controller'), 'listExecutionRequests'])
  router.get('/api/execution/requests/:id', [() => import('#controllers/nebula_conduit_controller'), 'getExecutionRequest'])
  router.patch('/api/execution/requests/:id/transition', [() => import('#controllers/nebula_conduit_controller'), 'transitionExecutionRequest'])
  router.post('/api/execution/leases/acquire', [() => import('#controllers/nebula_conduit_controller'), 'acquireExecutionLease'])
  router.post('/api/execution/leases/:id/renew', [() => import('#controllers/nebula_conduit_controller'), 'renewExecutionLease'])
  router.post('/api/execution/leases/:id/release', [() => import('#controllers/nebula_conduit_controller'), 'releaseExecutionLease'])
  router.post('/api/role-leases/issue', [() => import('#controllers/nebula_conduit_controller'), 'issueRoleLease'])
  router.post('/api/role-leases/:id/renew', [() => import('#controllers/nebula_conduit_controller'), 'renewRoleLease'])
  router.post('/api/role-leases/:id/revoke', [() => import('#controllers/nebula_conduit_controller'), 'revokeRoleLease'])
  router.get('/api/role-leases', [() => import('#controllers/nebula_conduit_controller'), 'listRoleLeases'])
  router.get('/api/cascade/subscriber-status', [() => import('#controllers/nebula_conduit_controller'), 'cascadeSubscriberStatus'])
  router.get('/api/role-leases/stale', [() => import('#controllers/nebula_conduit_controller'), 'staleRoleLeases'])
  router.post('/api/role-leases/consume', [() => import('#controllers/nebula_conduit_controller'), 'consumeRoleLease'])
  router.post('/api/execution/attempts', [() => import('#controllers/nebula_conduit_controller'), 'createExecutionAttempt'])
  router.post('/api/execution/receipts', [() => import('#controllers/nebula_conduit_controller'), 'issueExecutionReceipt'])
  router.get('/api/execution/receipts', [() => import('#controllers/nebula_conduit_controller'), 'listExecutionReceipts'])
  router.get('/api/execution/state', [() => import('#controllers/nebula_conduit_controller'), 'executionState'])
  router.get('/api/open-questions', [() => import('#controllers/nebula_meta_controller'), 'listOpenQuestions'])
  router.get('/api/open-questions/:id/answers', [() => import('#controllers/nebula_meta_controller'), 'listOpenQuestionAnswers'])
  router.post('/api/open-questions/:id/answers', [() => import('#controllers/nebula_meta_controller'), 'recordOpenQuestionAnswer'])
  router.post('/api/open-questions', [() => import('#controllers/nebula_meta_controller'), 'createOpenQuestion'])
  router.put('/api/open-questions/:id/answer', [() => import('#controllers/nebula_meta_controller'), 'answerOpenQuestionLegacy'])
  router.put('/api/open-questions/:id/resolve', [() => import('#controllers/nebula_meta_controller'), 'resolveOpenQuestion'])
  router.get('/api/roles', [() => import('#controllers/nebula_meta_controller'), 'listRoles'])
  router.get('/api/roles/:id', [() => import('#controllers/nebula_meta_controller'), 'showRole'])
  router.get('/api/intents', [() => import('#controllers/nebula_meta_controller'), 'listIntents'])
  router.get('/api/intents/:id', [() => import('#controllers/nebula_meta_controller'), 'showIntent'])
  router.get('/api/assessments', [() => import('#controllers/nebula_meta_controller'), 'listAssessments'])
  router.get('/api/assessments/:id', [() => import('#controllers/nebula_meta_controller'), 'showAssessment'])
  router.get('/api/observations', [() => import('#controllers/nebula_meta_controller'), 'listObservations'])
  router.get('/api/observations/:id', [() => import('#controllers/nebula_meta_controller'), 'showObservation'])
  router.get('/api/open-questions/:id', [() => import('#controllers/nebula_meta_controller'), 'showOpenQuestion'])
  router.get('/api/open-questions/:id/timeline', [() => import('#controllers/nebula_meta_controller'), 'openQuestionTimeline'])
  router.get('/api/open-questions/:id/participants', [() => import('#controllers/nebula_meta_controller'), 'listOpenQuestionParticipants'])
  router.post('/api/open-questions/:id/participants', [() => import('#controllers/nebula_meta_controller'), 'addOpenQuestionParticipant'])
  router.get('/api/harvest-candidates/:id/dependencies', [() => import('#controllers/nebula_meta_controller'), 'candidateDependencies'])
  router.get('/api/search', [() => import('#controllers/nebula_meta_controller'), 'search'])
  router.get('/api/counts', [() => import('#controllers/nebula_meta_controller'), 'counts'])
  router.get('/api/architect-specs', [() => import('#controllers/nebula_meta_controller'), 'listArchitectSpecs'])
  router.get('/api/architect-specs/:id', [() => import('#controllers/nebula_meta_controller'), 'showArchitectSpec'])
  router.post('/api/architect-specs', [() => import('#controllers/nebula_meta_controller'), 'createArchitectSpec'])
  router.delete('/api/architect-specs/:id', [() => import('#controllers/nebula_meta_controller'), 'deleteArchitectSpec'])
  router.get('/api/artifact-provenance', [() => import('#controllers/nebula_meta_controller'), 'listArtifactProvenance'])
  router.get('/api/artifact-provenance/:id', [() => import('#controllers/nebula_meta_controller'), 'showArtifactProvenance'])
  router.post('/api/artifact-provenance', [() => import('#controllers/nebula_meta_controller'), 'createArtifactProvenance'])
  router.delete('/api/artifact-provenance/:id', [() => import('#controllers/nebula_meta_controller'), 'deleteArtifactProvenance'])
  router.post('/api/search/semantic', [() => import('#controllers/nebula_meta_controller'), 'semanticSearch'])
  router.get('/api/cpf', [() => import('#controllers/nebula_meta_controller'), 'cpf'])
  router.get('/api/cpf/count', [() => import('#controllers/nebula_meta_controller'), 'cpfCount'])
  router.post('/api/cpf/promote', [() => import('#controllers/nebula_meta_controller'), 'cpfPromote'])
  router.post('/api/refresh-stats', [() => import('#controllers/nebula_meta_controller'), 'refreshStats'])
  router.get('/api/systems/:id/inventory', [() => import('#controllers/nebula_meta_controller'), 'systemInventory'])
  router.get('/api/inventory', [() => import('#controllers/nebula_meta_controller'), 'inventory'])
  router.get('/api/systems/:id/external-ids', [() => import('#controllers/nebula_meta_controller'), 'systemExternalIds'])
  router.post('/api/systems/:id/external-ids', [() => import('#controllers/nebula_meta_controller'), 'createSystemExternalId'])
  router.delete('/api/systems/:id/external-ids/:eid', [() => import('#controllers/nebula_meta_controller'), 'deleteSystemExternalId'])
  router.get('/api/external-ids', [() => import('#controllers/nebula_meta_controller'), 'externalIds'])
  router.patch('/api/external-ids/:id', [() => import('#controllers/nebula_meta_controller'), 'patchExternalId'])
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
