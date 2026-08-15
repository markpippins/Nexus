/**
 * nexus-control-edge — TypeSpec Operations
 *
 * The consolidated control-plane edge (AdonisJS). Current live surface:
 * health + ui-tools navigation-link CRUD. Additional service groups land
 * with each migration wave (Wave 1/2).
 */

import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.controledge {

  // ========================================================================
  // Health
  // ========================================================================

  @route("/health")
  @get
  @doc("Edge health: status, service, db + redis connectivity.")
  op health(): Health;

  // ========================================================================
  // ui-tools — navigation links
  // ========================================================================

  @route("/api/links")
  @get
  @doc("List navigation links ordered by sort_order (throttler.links).")
  op listLinks(): Link[];

  @route("/api/links")
  @post
  @doc("Create a navigation link or separator.")
  op createLink(@body body: LinkCreate): Link;

  @route("/api/links/reorder")
  @patch
  @doc("Transactionally reorder links; returns the updated list.")
  op reorderLinks(@body body: LinkReorder): Link[];

  @route("/api/links/{id}")
  @patch
  @doc("Partially update a link.")
  op updateLink(@path id: string, @body body: LinkUpdate): Link;

  @route("/api/links/{id}")
  @delete
  @doc("Delete a link.")
  op deleteLink(@path id: string): Ok;

  // ========================================================================
  // tackle-prompt-sync-srv (re-homed Wave 1.1)
  // ========================================================================
  // Wave 3.5 collision resolution: /prompts/{role} moved to the tackle-srv
  // contract (get_prompts_role, PG-backed {count, prompts}); the prompt-sync
  // Redis index route was retired in favor of it. The singular
  // /prompt/{role}/{slug} card route remains on the prompt-sync port.

  @route("/prompt/{role}/{slug}")
  @get
  @doc("Return the full cached prompt card (latest version). 404 if missing.")
  op getPromptCard(@path role: string, @path slug: string): PromptCard | ErrorResponse;

  @route("/refresh")
  @post
  @doc("Trigger a full PG→Redis sync for both caches (idempotent; also runs on Redis ready).")
  op refreshCaches(): RefreshResult;

  // ========================================================================
  // role-memory-srv (re-homed Wave 1.2)
  // ========================================================================

  @route("/procedures/{role}")
  @get
  @doc("Return the role's cached procedure index.")
  op listRoleProcedures(@path role: string): ProcedureIndexEntry[];

  @route("/procedure/{slug}")
  @get
  @doc("Return the full cached procedure card. 404 if missing.")
  op getProcedureCard(@path slug: string): ProcedureCard | ErrorResponse;

  // ========================================================================
  // knowledge-srv (re-homed Wave 2.1)
  // ========================================================================

  @route("/knowledge/entities")
  @get
  @doc("List knowledge-graph entities (filters: section, entity_type, status, search; paging).")
  op listKnowledgeEntities(): Record<unknown>;

  @route("/knowledge/entities/{section}/{entity_id}")
  @get
  @doc("Get one knowledge-graph entity. 404 if missing.")
  op getKnowledgeEntity(@path section: string, @path entity_id: string): Record<unknown>;

  @route("/knowledge/entities/{section}/{entity_id}/relations")
  @get
  @doc("List inbound + outbound relations for an entity.")
  op getKnowledgeEntityRelations(@path section: string, @path entity_id: string): Record<unknown>;

  @route("/knowledge/edges")
  @get
  @doc("List knowledge-graph edges (filters; paging).")
  op listKnowledgeEdges(): Record<unknown>;

  @route("/knowledge/cross-references")
  @get
  @doc("List knowledge-graph cross-references (filters; paging).")
  op listKnowledgeCrossReferences(): Record<unknown>;

  @route("/knowledge/migrations")
  @get
  @doc("List graph migrations (most recent first).")
  op listKnowledgeMigrations(): Record<unknown>;

  @route("/knowledge/summary")
  @get
  @doc("Aggregate counts across the knowledge graph.")
  op getKnowledgeSummary(): Record<unknown>;

  // ========================================================================
  // semantics-srv (re-homed Wave 2.2)
  // ========================================================================

  @route("/api/meta")
  @get
  @doc("Semantics schema overview: tables, row counts, stored procs, writable params.")
  op semanticsMeta(): Record<unknown>;

  @route("/api/evidence_item")
  @get
  @doc("List evidence items (filters: evidenceType, origin, uri, sourceHash; paging).")
  op listEvidenceItems(): Record<unknown>;

  @route("/api/statement_evidence")
  @get
  @doc("List statement-evidence links (filters: statementType, statementId, role; paging).")
  op listStatementEvidence(): Record<unknown>;

  @route("/api/canonical_asset/{id}")
  @get
  @doc("Expanded canonical-asset envelope: revisions, identity claims, relations, external ids.")
  op getCanonicalAsset(@path id: string): Record<unknown>;

  @route("/api/asset_revision/{id}")
  @get
  @doc("Expanded asset-revision envelope with asset, observations, parent + children.")
  op getAssetRevision(@path id: string): Record<unknown>;

  @route("/api/concept_relationship/{id}/evidence")
  @get
  @doc("All evidence for a concept relationship.")
  op getConceptRelationshipEvidence(@path id: string): Record<unknown>;

  @route("/api/representation_relationship/{id}/evidence")
  @get
  @doc("All evidence for a representation relationship.")
  op getRepresentationRelationshipEvidence(@path id: string): Record<unknown>;

  @route("/api/canonical_asset/{id}/revisions")
  @get
  @doc("Paginated revisions of a canonical asset.")
  op listAssetRevisions(@path id: string): Record<unknown>;

  @route("/api/canonical_asset/{id}/revisions")
  @post
  @doc("Create a revision scoped to a canonical asset.")
  op createAssetRevision(@path id: string, @body body: Record<unknown>): Record<unknown>;

  @route("/api/canonical_asset/{id}/identity-claims")
  @get
  @doc("List identity claims for a canonical asset.")
  op listAssetClaims(@path id: string): Record<unknown>;

  @route("/api/canonical_asset/{id}/identity-claims")
  @post
  @doc("Create an identity claim scoped to a canonical asset.")
  op createAssetClaim(@path id: string, @body body: Record<unknown>): Record<unknown>;

  @route("/api/canonical_asset/{id}/relations")
  @get
  @doc("List relations (inbound + outbound) for a canonical asset.")
  op listAssetRelations(@path id: string): Record<unknown>;

  @route("/api/canonical_asset/{id}/relations")
  @post
  @doc("Create a directed relation with automatic direction resolution.")
  op createAssetRelation(@path id: string, @body body: Record<unknown>): Record<unknown>;

  @route("/api/asset_identity_claim/{id}/resolve")
  @post
  @doc("Transition an open identity claim to resolved | rejected.")
  op resolveIdentityClaim(@path id: string, @body body: Record<unknown>): Record<unknown>;

  @route("/api/canonical_asset/{id}/external-ids")
  @get
  @doc("List cross-schema external ids (nebula systems) for a canonical asset.")
  op listExternalIds(@path id: string): Record<unknown>;

  @route("/api/canonical_asset/{id}/external-ids")
  @post
  @doc("Create a cross-schema link to a nebula system.")
  op createExternalId(@path id: string, @body body: Record<unknown>): Record<unknown>;

  @route("/api/canonical_asset/{id}/external-ids/{eid}")
  @delete
  @doc("Soft-expire a cross-schema link.")
  op deleteExternalId(@path id: string, @path eid: string): Record<unknown>;

  @route("/api/drift_finding/{id}/resolve")
  @post
  @doc("Resolve a drift finding (detected → resolved).")
  op resolveDriftFinding(@path id: string, @body body: Record<unknown>): Record<unknown>;

  @route("/api/{table}")
  @get
  @doc("Generic list for a semantics.* table (active rows by default; includeExpired, limit, offset).")
  op listSemanticsTable(@path table: string): Record<unknown>;

  @route("/api/{table}/{id}")
  @get
  @doc("Generic get-by-id for a semantics.* table (matches id or natural key).")
  op getSemanticsRow(@path table: string, @path id: string): Record<unknown>;

  @route("/api/{table}")
  @post
  @doc("Generic add via add_<table> stored proc (p_* body params).")
  op addSemanticsRow(@path table: string, @body body: Record<unknown>): Record<unknown>;

  @route("/api/{table}/{id}")
  @patch
  @doc("Generic append-only replace via update_<table> stored proc.")
  op updateSemanticsRow(@path table: string, @path id: string, @body body: Record<unknown>): Record<unknown>;

  @route("/api/{table}/{id}")
  @delete
  @doc("Generic soft-delete (expire-not-delete) for a semantics.* table.")
  op deleteSemanticsRow(@path table: string, @path id: string): Record<unknown>;

  // ========================================================================
  // terrain-srv (re-homed Wave 2.3)
  // ========================================================================

  @route("/terrain/servers")
  @get
  @doc("List terrain servers (hosts).")
  op listTerrainServers(): Record<unknown>;

  @route("/terrain/mcp-servers")
  @get
  @doc("List MCP servers in the terrain topology.")
  op listMcpServers(): Record<unknown>;

  @route("/terrain/mcp-servers")
  @post
  @doc("Upsert an MCP server by name.")
  op registerMcpServer(@body body: Record<unknown>): Record<unknown>;

  @route("/terrain/runnable-services")
  @get
  @doc("List runnable services.")
  op listRunnableServices(): Record<unknown>;

  @route("/terrain/runnable-services")
  @post
  @doc("Upsert a runnable service by name.")
  op registerRunnableService(@body body: Record<unknown>): Record<unknown>;

  @route("/terrain/cli-tools")
  @get
  @doc("List CLI tools.")
  op listCliTools(): Record<unknown>;

  @route("/terrain/cli-tools")
  @post
  @doc("Upsert a CLI tool by name.")
  op registerCliTool(@body body: Record<unknown>): Record<unknown>;

  @route("/terrain/services/{name}")
  @get
  @doc("Look up a service by name across MCP servers, runnable services, and servers.")
  op getTerrainService(@path name: string): Record<unknown>;

  @route("/terrain/services/{name}/running")
  @get
  @doc("Check whether a named service is ONLINE.")
  op isTerrainServiceRunning(@path name: string): Record<unknown>;

  @route("/terrain/services/status")
  @patch
  @doc("Set a service status (body: {name, status}).")
  op setTerrainServiceStatus(@body body: Record<unknown>): Record<unknown>;

  @route("/terrain/dependencies")
  @get
  @doc("List service dependencies with resolved source/target names.")
  op listTerrainDependencies(): Record<unknown>;

  @route("/terrain/dependencies")
  @post
  @doc("Upsert a service dependency by resolved source/target.")
  op registerTerrainDependency(@body body: Record<unknown>): Record<unknown>;

  @route("/terrain/summary")
  @get
  @doc("Aggregate counts across the terrain topology.")
  op getTerrainSummary(): Record<unknown>;

  // ========================================================================
  // voyager-srv (re-homed Wave 2.4)
  // ========================================================================

  @route("/api/health")
  @get
  @doc("Voyager health probe.")
  op voyagerHealth(): Record<unknown>;

  @route("/api/scan-epochs")
  @get
  @doc("List scan epochs (most recent first; paging).")
  op listScanEpochs(): Record<unknown>;

  @route("/api/scan-epochs/{id}")
  @get
  @doc("Get a single scan epoch.")
  op getScanEpoch(@path id: string): Record<unknown>;

  @route("/api/observations/files")
  @get
  @doc("List file observations (filters: scanEpochId, path, deviceId, inode; paging).")
  op listFileObservations(): Record<unknown>;

  @route("/api/observations/files/by-id/{observationId}")
  @get
  @doc("Get a file observation by observation_id (UUID).")
  op getFileObservationByObsId(@path observationId: string): Record<unknown>;

  @route("/api/observations/files/{id}")
  @get
  @doc("Get a file observation by surrogate id.")
  op getFileObservation(@path id: string): Record<unknown>;

  @route("/api/observations/directories")
  @get
  @doc("List directory observations (filters: scanEpochId, path; paging).")
  op listDirectoryObservations(): Record<unknown>;

  @route("/api/topology/signals")
  @get
  @doc("List topology signals (filters: scanEpochId, structureType; paging).")
  op listTopologySignals(): Record<unknown>;

  @route("/api/topology/signals/{id}")
  @get
  @doc("Get a single topology signal.")
  op getTopologySignal(@path id: string): Record<unknown>;

  @route("/api/topology/edge-hints")
  @get
  @doc("List observation edge hints (filters: evidenceType, minConfidence; paging).")
  op listEdgeHints(): Record<unknown>;

  @route("/api/entities")
  @get
  @doc("List entities (filters: minStability, canonicalPath; paging).")
  op listVoyagerEntities(): Record<unknown>;

  @route("/api/entities/by-id/{entityId}")
  @get
  @doc("Get an entity by entity_id (UUID) with drift history.")
  op getEntityByEntityId(@path entityId: string): Record<unknown>;

  @route("/api/entities/{id}")
  @get
  @doc("Get an entity by surrogate id with drift history.")
  op getVoyagerEntity(@path id: string): Record<unknown>;

  @route("/api/spans")
  @get
  @doc("List metadata spans (filters: spanType, markdownRole, minConfidence, observationId; paging).")
  op listMetadataSpans(): Record<unknown>;

  @route("/api/spans/{id}")
  @get
  @doc("Get a single metadata span.")
  op getMetadataSpan(@path id: string): Record<unknown>;

  @route("/api/stats")
  @get
  @doc("Summary counts across all voyager tables.")
  op getVoyagerStats(): Record<unknown>;

  // ========================================================================
  // nebula-srv (re-homed Wave 3.1) — canonical data-plane surface
  // ========================================================================

  @route("/api/systems")
  @get
  @doc("List systems.")
  op get_api_systems(): Record<unknown>;

  @route("/api/systems")
  @post
  @doc("Create a system.")
  op post_api_systems(): Record<unknown>;

  @route("/api/systems/{id}")
  @patch
  @doc("Update a system.")
  op patch_api_systems(@path id: string): Record<unknown>;

  @route("/api/systems/{id}")
  @delete
  @doc("Delete a system.")
  op delete_api_systems(@path id: string): Record<unknown>;

  @route("/api/systems/{id}")
  @get
  @doc("Get a single system.")
  op get_api_systems_2(@path id: string): Record<unknown>;

  @route("/api/subsystems")
  @post
  @doc("Create a subsystem.")
  op post_api_subsystems(): Record<unknown>;

  @route("/api/subsystems/{id}")
  @patch
  @doc("Update a subsystem.")
  op patch_api_subsystems(@path id: string): Record<unknown>;

  @route("/api/subsystems/{id}")
  @delete
  @doc("Delete a subsystem.")
  op delete_api_subsystems(@path id: string): Record<unknown>;

  @route("/api/subsystems/{id}")
  @get
  @doc("Get a single subsystem.")
  op get_api_subsystems(@path id: string): Record<unknown>;

  @route("/api/features")
  @post
  @doc("Create a feature.")
  op post_api_features(): Record<unknown>;

  @route("/api/features/{id}")
  @patch
  @doc("Update a feature.")
  op patch_api_features(@path id: string): Record<unknown>;

  @route("/api/features/{id}")
  @delete
  @doc("Delete a feature.")
  op delete_api_features(@path id: string): Record<unknown>;

  @route("/api/features/{id}")
  @get
  @doc("Get a single feature.")
  op get_api_features(@path id: string): Record<unknown>;

  @route("/api/requirements")
  @get
  @doc("List requirements (filters: systemId, subsystemId, featureId).")
  op get_api_requirements(): Record<unknown>;

  @route("/api/requirements/{id}")
  @get
  @doc("Get a single requirement.")
  op get_api_requirements_2(@path id: string): Record<unknown>;

  @route("/api/requirements/{id}/children")
  @get
  @doc("List requirement children.")
  op get_api_requirements_children(@path id: string): Record<unknown>;

  @route("/api/requirements/{id}/dependencies")
  @get
  @doc("List requirement dependencies.")
  op get_api_requirements_dependencies(@path id: string): Record<unknown>;

  @route("/api/requirements/{id}/dependencies")
  @post
  @doc("Create a requirement dependency.")
  op post_api_requirements_dependencies(@path id: string): Record<unknown>;

  @route("/api/requirements/{id}/dependencies/{depId}")
  @delete
  @doc("Delete a requirement dependency.")
  op delete_api_requirements_dependencies(@path id: string, @path depId: string): Record<unknown>;

  @route("/api/requirements")
  @post
  @doc("Create a requirement.")
  op post_api_requirements(): Record<unknown>;

  @route("/api/requirements/batch")
  @patch
  @doc("Batch-update requirements.")
  op patch_api_requirements_batch(): Record<unknown>;

  @route("/api/requirements/{id}")
  @patch
  @doc("Update a requirement.")
  op patch_api_requirements(@path id: string): Record<unknown>;

  @route("/api/requirements/{id}")
  @delete
  @doc("Delete a requirement.")
  op delete_api_requirements(@path id: string): Record<unknown>;

  @route("/api/requirements/{id}/move")
  @post
  @doc("Move a requirement to a new status.")
  op post_api_requirements_move(@path id: string): Record<unknown>;

  @route("/api/requirements/{id}/compile")
  @post
  @doc("Compile a requirement into WorkRequest IR (two-stage compiler).")
  op post_api_requirements_compile(@path id: string): Record<unknown>;

  @route("/api/systems/{id}/folders")
  @post
  @doc("Create a system folder.")
  op post_api_systems_folders(@path id: string): Record<unknown>;

  @route("/api/systems/{systemId}/folders/{folderId}")
  @delete
  @doc("Delete a system folder.")
  op delete_api_systems_folders(@path systemId: string, @path folderId: string): Record<unknown>;

  @route("/api/sessions")
  @get
  @doc("List work sessions.")
  op get_api_sessions(): Record<unknown>;

  @route("/api/sessions")
  @post
  @doc("Create a work session.")
  op post_api_sessions(): Record<unknown>;

  @route("/api/sessions/{id}")
  @patch
  @doc("Update a work session.")
  op patch_api_sessions(@path id: string): Record<unknown>;

  @route("/api/features/move")
  @post
  @doc("Re-parent a feature to a different subsystem.")
  op post_api_features_move(): Record<unknown>;

  @route("/api/subsystems/move")
  @post
  @doc("Re-parent a subsystem to a different system.")
  op post_api_subsystems_move(): Record<unknown>;

  @route("/api/systems/demote/{id}")
  @post
  @doc("Demote a system into a subsystem of another system.")
  op post_api_systems_demote(@path id: string): Record<unknown>;

  @route("/api/sessions/{id}")
  @delete
  @doc("Delete a work session.")
  op delete_api_sessions(@path id: string): Record<unknown>;

  @route("/api/workspaces")
  @get
  @doc("List system workspaces.")
  op get_api_workspaces(): Record<unknown>;

  @route("/api/workspaces")
  @post
  @doc("Create a system workspace.")
  op post_api_workspaces(): Record<unknown>;

  @route("/api/workspaces/{id}")
  @delete
  @doc("Delete a system workspace.")
  op delete_api_workspaces(@path id: string): Record<unknown>;

  @route("/api/docs")
  @get
  @doc("Read known doc files from a workspace directory.")
  op get_api_docs(): Record<unknown>;

  @route("/api/subsystems/{id}/docs")
  @get
  @doc("Read docs for a subsystem workspace.")
  op get_api_subsystems_docs(@path id: string): Record<unknown>;

  @route("/api/systems/{id}/docs")
  @get
  @doc("Read docs for a system workspace.")
  op get_api_systems_docs(@path id: string): Record<unknown>;

  @route("/api/plans")
  @get
  @doc("List plans.")
  op get_api_plans(): Record<unknown>;

  @route("/api/plans/{id}")
  @get
  @doc("Get a single plan.")
  op get_api_plans_2(@path id: string): Record<unknown>;

  @route("/api/plans")
  @post
  @doc("Create a plan.")
  op post_api_plans(): Record<unknown>;

  @route("/api/implementation-plans/statuses")
  @get
  @doc("List implementation-plan statuses.")
  op get_api_implementation_plans_statuses(): Record<unknown>;

  @route("/api/systems/{id}/implementation-plans")
  @get
  @doc("List implementation plans for a system.")
  op get_api_systems_implementation_plans(@path id: string): Record<unknown>;

  @route("/api/subsystems/{id}/implementation-plans")
  @get
  @doc("List implementation plans for a subsystem.")
  op get_api_subsystems_implementation_plans(@path id: string): Record<unknown>;

  @route("/api/features/{id}/implementation-plans")
  @get
  @doc("List implementation plans for a feature.")
  op get_api_features_implementation_plans(@path id: string): Record<unknown>;

  @route("/api/audit")
  @get
  @doc("List audit files.")
  op get_api_audit(): Record<unknown>;

  @route("/api/audit/graph")
  @get
  @doc("Audit graph over agent_records + cross_references.")
  op get_api_audit_graph(): Record<unknown>;

  @route("/api/audit/{id}")
  @get
  @doc("Get a single audit file.")
  op get_api_audit_2(@path id: string): Record<unknown>;

  @route("/api/audit/sync")
  @post
  @doc("Sync audit files from disk to DB.")
  op post_api_audit_sync(): Record<unknown>;

  @route("/api/audit/{id}/regenerate")
  @post
  @doc("Regenerate an audit file from DB state.")
  op post_api_audit_regenerate(@path id: string): Record<unknown>;

  @route("/api/preferences")
  @get
  @doc("Get user preferences.")
  op get_api_preferences(): Record<unknown>;

  @route("/api/preferences/{key}")
  @put
  @doc("Set a user preference.")
  op put_api_preferences(@path key: string): Record<unknown>;

  @route("/api/preferences/{key}")
  @delete
  @doc("Delete a user preference.")
  op delete_api_preferences(@path key: string): Record<unknown>;

  @route("/api/systems/{id}/info")
  @get
  @doc("List info tabs for a system.")
  op get_api_systems_info(@path id: string): Record<unknown>;

  @route("/api/systems/{id}/info/{tabId}")
  @put
  @doc("Save an info tab.")
  op put_api_systems_info(@path id: string, @path tabId: string): Record<unknown>;

  @route("/api/systems/{id}/info/{tabId}")
  @delete
  @doc("Delete an info tab.")
  op delete_api_systems_info(@path id: string, @path tabId: string): Record<unknown>;

  @route("/api/import")
  @post
  @doc("Import data.")
  op post_api_import(): Record<unknown>;

  @route("/api/seed")
  @post
  @doc("Seed demo data.")
  op post_api_seed(): Record<unknown>;

  @route("/api/harvests")
  @get
  @doc("List harvests.")
  op get_api_harvests(): Record<unknown>;

  @route("/api/harvests/distribution")
  @get
  @doc("Harvest distribution.")
  op get_api_harvests_distribution(): Record<unknown>;

  @route("/api/harvests/{id}")
  @get
  @doc("Get a single harvest.")
  op get_api_harvests_2(@path id: string): Record<unknown>;

  @route("/api/harvests/{id}/transcript")
  @get
  @doc("Get a harvest transcript.")
  op get_api_harvests_transcript(@path id: string): Record<unknown>;

  @route("/api/harvest-candidates/{id}/promote")
  @post
  @doc("Promote a harvest candidate.")
  op post_api_harvest_candidates_promote(@path id: string): Record<unknown>;

  @route("/api/harvest-candidates/promote-to-plan")
  @post
  @doc("Promote a candidate to a plan.")
  op post_api_harvest_candidates_promote_to_plan(): Record<unknown>;

  @route("/api/harvests")
  @post
  @doc("Create a harvest.")
  op post_api_harvests(): Record<unknown>;

  @route("/api/harvests/{id}")
  @delete
  @doc("Delete a harvest.")
  op delete_api_harvests(@path id: string): Record<unknown>;

  @route("/api/plans/{planRef}/candidates")
  @get
  @doc("List candidates for a plan.")
  op get_api_plans_candidates(@path planRef: string): Record<unknown>;

  @route("/api/systems/{id}/harvest-candidates")
  @get
  @doc("List harvest candidates for a system.")
  op get_api_systems_harvest_candidates(@path id: string): Record<unknown>;

  @route("/api/subsystems/{id}/harvest-candidates")
  @get
  @doc("List harvest candidates for a subsystem.")
  op get_api_subsystems_harvest_candidates(@path id: string): Record<unknown>;

  @route("/api/features/{id}/harvest-candidates")
  @get
  @doc("List harvest candidates for a feature.")
  op get_api_features_harvest_candidates(@path id: string): Record<unknown>;

  @route("/api/intent-records")
  @get
  @doc("List intent records.")
  op get_api_intent_records(): Record<unknown>;

  @route("/api/systems/{id}/intent-records")
  @get
  @doc("List intent records for a system.")
  op get_api_systems_intent_records(@path id: string): Record<unknown>;

  @route("/api/subsystems/{id}/intent-records")
  @get
  @doc("List intent records for a subsystem.")
  op get_api_subsystems_intent_records(@path id: string): Record<unknown>;

  @route("/api/features/{id}/intent-records")
  @get
  @doc("List intent records for a feature.")
  op get_api_features_intent_records(@path id: string): Record<unknown>;

  @route("/api/intent-records/{id}")
  @get
  @doc("Get a single intent record.")
  op get_api_intent_records_2(@path id: string): Record<unknown>;

  @route("/api/agendas")
  @get
  @doc("List agendas.")
  op get_api_agendas(): Record<unknown>;

  @route("/api/agendas/{id}")
  @get
  @doc("Get a single agenda.")
  op get_api_agendas_2(@path id: string): Record<unknown>;

  @route("/api/systems/{id}/agendas")
  @get
  @doc("List agendas for a system.")
  op get_api_systems_agendas(@path id: string): Record<unknown>;

  @route("/api/subsystems/{id}/agendas")
  @get
  @doc("List agendas for a subsystem.")
  op get_api_subsystems_agendas(@path id: string): Record<unknown>;

  @route("/api/features/{id}/agendas")
  @get
  @doc("List agendas for a feature.")
  op get_api_features_agendas(@path id: string): Record<unknown>;

  @route("/api/agendas/{id}/items")
  @delete
  @doc("Delete agenda items.")
  op delete_api_agendas_items(@path id: string): Record<unknown>;

  @route("/api/agendas/{id}/finalize")
  @post
  @doc("Finalize an agenda.")
  op post_api_agendas_finalize(@path id: string): Record<unknown>;

  @route("/api/agendas/{id}/items")
  @post
  @doc("Add an agenda item.")
  op post_api_agendas_items(@path id: string): Record<unknown>;

  @route("/api/specifications")
  @get
  @doc("List specifications.")
  op get_api_specifications(): Record<unknown>;

  @route("/api/specifications/{id}")
  @get
  @doc("Get a single specification.")
  op get_api_specifications_2(@path id: string): Record<unknown>;

  @route("/api/systems/{id}/specifications")
  @get
  @doc("List specifications for a system.")
  op get_api_systems_specifications(@path id: string): Record<unknown>;

  @route("/api/subsystems/{id}/specifications")
  @get
  @doc("List specifications for a subsystem.")
  op get_api_subsystems_specifications(@path id: string): Record<unknown>;

  @route("/api/features/{id}/specifications")
  @get
  @doc("List specifications for a feature.")
  op get_api_features_specifications(@path id: string): Record<unknown>;

  @route("/api/work-requests")
  @get
  @doc("List work requests.")
  op get_api_work_requests(): Record<unknown>;

  @route("/api/work-requests/{id}")
  @get
  @doc("Get a single work request.")
  op get_api_work_requests_2(@path id: string): Record<unknown>;

  @route("/api/systems/{id}/work-requests")
  @get
  @doc("List work requests for a system.")
  op get_api_systems_work_requests(@path id: string): Record<unknown>;

  @route("/api/subsystems/{id}/work-requests")
  @get
  @doc("List work requests for a subsystem.")
  op get_api_subsystems_work_requests(@path id: string): Record<unknown>;

  @route("/api/features/{id}/work-requests")
  @get
  @doc("List work requests for a feature.")
  op get_api_features_work_requests(@path id: string): Record<unknown>;

  @route("/api/harvest-candidates")
  @get
  @doc("List harvest candidates.")
  op get_api_harvest_candidates(): Record<unknown>;

  @route("/api/harvest-candidates/{id}")
  @get
  @doc("Get a single harvest candidate.")
  op get_api_harvest_candidates_2(@path id: string): Record<unknown>;

  @route("/api/candidates")
  @get
  @doc("List candidates (alias).")
  op get_api_candidates(): Record<unknown>;

  @route("/api/candidates/{id}")
  @get
  @doc("Get a single candidate (alias).")
  op get_api_candidates_2(@path id: string): Record<unknown>;

  @route("/api/harvest-candidates/{id}")
  @patch
  @doc("Update a harvest candidate.")
  op patch_api_harvest_candidates(@path id: string): Record<unknown>;

  @route("/api/harvest-candidates/{id}/spawn-plan")
  @post
  @doc("Spawn a plan from a harvest candidate.")
  op post_api_harvest_candidates_spawn_plan(@path id: string): Record<unknown>;

  @route("/api/harvest-candidates")
  @post
  @doc("Create a harvest candidate.")
  op post_api_harvest_candidates(): Record<unknown>;

  @route("/api/specifications/{id}/link-requirements")
  @post
  @doc("Link requirements to a specification.")
  op post_api_specifications_link_requirements(@path id: string): Record<unknown>;

  @route("/api/specs")
  @get
  @doc("List specs.")
  op get_api_specs(): Record<unknown>;

  @route("/api/specs/{id}")
  @get
  @doc("Get a single spec.")
  op get_api_specs_2(@path id: string): Record<unknown>;

  @route("/api/harvest-candidates/discover")
  @post
  @doc("Discover harvest candidates.")
  op post_api_harvest_candidates_discover(): Record<unknown>;

  @route("/api/agent-records")
  @get
  @doc("List agent records.")
  op get_api_agent_records(): Record<unknown>;

  @route("/api/agent-records/{id}")
  @get
  @doc("Get a single agent record.")
  op get_api_agent_records_2(@path id: string): Record<unknown>;

  @route("/api/agent-records/search")
  @post
  @doc("Search agent records.")
  op post_api_agent_records_search(): Record<unknown>;

  @route("/api/agent-records")
  @post
  @doc("Create an agent record.")
  op post_api_agent_records(): Record<unknown>;

  @route("/api/agent-records/{id}")
  @patch
  @doc("Update an agent record.")
  op patch_api_agent_records(@path id: string): Record<unknown>;

  @route("/api/agent-records/{id}")
  @delete
  @doc("Delete an agent record.")
  op delete_api_agent_records(@path id: string): Record<unknown>;

  @route("/api/inbox-pointer/{role}")
  @get
  @doc("Get the inbox pointer for a role.")
  op get_api_inbox_pointer(@path role: string): Record<unknown>;

  @route("/api/inbox-pointer/{role}")
  @put
  @doc("Set the inbox pointer for a role.")
  op put_api_inbox_pointer(@path role: string): Record<unknown>;

  @route("/api/inbox-pointers")
  @get
  @doc("List all inbox pointers.")
  op get_api_inbox_pointers(): Record<unknown>;

  @route("/api/projections")
  @get
  @doc("List projections.")
  op get_api_projections(): Record<unknown>;

  @route("/api/projections")
  @post
  @doc("Create a projection.")
  op post_api_projections(): Record<unknown>;

  @route("/api/projections/{id}/render")
  @post
  @doc("Render a projection.")
  op post_api_projections_render(@path id: string): Record<unknown>;

  @route("/api/projections/{id}")
  @delete
  @doc("Delete a projection.")
  op delete_api_projections(@path id: string): Record<unknown>;

  @route("/api/cross-references")
  @post
  @doc("Create a cross-reference.")
  op post_api_cross_references(): Record<unknown>;

  @route("/api/cross-references")
  @get
  @doc("List cross-references.")
  op get_api_cross_references(): Record<unknown>;

  @route("/api/cross-references/{id}")
  @get
  @doc("Get a single cross-reference.")
  op get_api_cross_references_2(@path id: string): Record<unknown>;

  @route("/api/cross-references/{id}")
  @delete
  @doc("Delete a cross-reference.")
  op delete_api_cross_references(@path id: string): Record<unknown>;

  @route("/api/evidence-links")
  @post
  @doc("Create an evidence link.")
  op post_api_evidence_links(): Record<unknown>;

  @route("/api/evidence-links")
  @get
  @doc("List evidence links.")
  op get_api_evidence_links(): Record<unknown>;

  @route("/api/evidence-links/{id}")
  @get
  @doc("Get a single evidence link.")
  op get_api_evidence_links_2(@path id: string): Record<unknown>;

  @route("/api/evidence-links/{id}")
  @delete
  @doc("Delete an evidence link.")
  op delete_api_evidence_links(@path id: string): Record<unknown>;

  @route("/api/evidence-links")
  @delete
  @doc("Bulk-delete evidence links.")
  op delete_api_evidence_links_2(): Record<unknown>;

  @route("/api/conversations/by-snapshot/{snapshotId}")
  @get
  @doc("Get a conversation by snapshot id.")
  op get_api_conversations_by_snapshot(@path snapshotId: string): Record<unknown>;

  @route("/api/conversations")
  @get
  @doc("List conversations.")
  op get_api_conversations(): Record<unknown>;

  @route("/api/conversations/{id}/snapshots")
  @get
  @doc("List snapshots for a conversation.")
  op get_api_conversations_snapshots(@path id: string): Record<unknown>;

  @route("/api/snapshots/{id}/blocks")
  @get
  @doc("Get blocks for a snapshot.")
  op get_api_snapshots_blocks(@path id: string): Record<unknown>;

  @route("/api/conversations/{id}/blocks")
  @get
  @doc("Get blocks for a conversation.")
  op get_api_conversations_blocks(@path id: string): Record<unknown>;

  @route("/api/conversations/by-snapshot/{snapshotId}/blocks")
  @get
  @doc("Get blocks for a conversation by snapshot id.")
  op get_api_conversations_by_snapshot_blocks(@path snapshotId: string): Record<unknown>;

  @route("/api/snapshots")
  @post
  @doc("Create a snapshot.")
  op post_api_snapshots(): Record<unknown>;

  @route("/api/segments")
  @post
  @doc("Create a segment.")
  op post_api_segments(): Record<unknown>;

  @route("/api/segments/{id}")
  @patch
  @doc("Update a segment.")
  op patch_api_segments(@path id: string): Record<unknown>;

  @route("/api/segments/{id}")
  @delete
  @doc("Delete a segment.")
  op delete_api_segments(@path id: string): Record<unknown>;

  @route("/api/projection-overrides")
  @post
  @doc("Create a projection override.")
  op post_api_projection_overrides(): Record<unknown>;

  @route("/api/projection-overrides/{id}")
  @delete
  @doc("Delete a projection override.")
  op delete_api_projection_overrides(@path id: string): Record<unknown>;

  @route("/api/snapshots/{id}/projection")
  @get
  @doc("Get the projection for a snapshot.")
  op get_api_snapshots_projection(@path id: string): Record<unknown>;

  @route("/api/snapshots/{id}/references")
  @get
  @doc("Get references for a snapshot.")
  op get_api_snapshots_references(@path id: string): Record<unknown>;

  @route("/api/knowledge/view")
  @get
  @doc("Combined knowledge-graph payload for visualization.")
  op get_api_knowledge_view(): Record<unknown>;

  @route("/api/op-registry")
  @post
  @doc("Create an op-registry entry.")
  op post_api_op_registry(): Record<unknown>;

  @route("/api/op-registry")
  @get
  @doc("List op-registry entries.")
  op get_api_op_registry(): Record<unknown>;

  @route("/api/op-registry/{id}")
  @get
  @doc("Get a single op-registry entry.")
  op get_api_op_registry_2(@path id: string): Record<unknown>;

  @route("/api/op-registry/{id}/deprecate")
  @patch
  @doc("Deprecate an op-registry entry.")
  op patch_api_op_registry_deprecate(@path id: string): Record<unknown>;

  @route("/api/op-registry/{id}/supersede")
  @patch
  @doc("Supersede an op-registry entry.")
  op patch_api_op_registry_supersede(@path id: string): Record<unknown>;

  @route("/api/op-registry/{id}")
  @delete
  @doc("Delete an op-registry entry.")
  op delete_api_op_registry(@path id: string): Record<unknown>;

  @route("/api/op-registry/fork")
  @post
  @doc("Fork an op-registry entry.")
  op post_api_op_registry_fork(): Record<unknown>;

  @route("/api/op-registry/{id}/lineage")
  @get
  @doc("Get op-registry entry lineage.")
  op get_api_op_registry_lineage(@path id: string): Record<unknown>;

  @route("/api/conduit/plans")
  @get
  @doc("List conduit plans.")
  op get_api_conduit_plans(): Record<unknown>;

  @route("/api/conduit/plans/as-of")
  @get
  @doc("List conduit plans as of a timestamp.")
  op get_api_conduit_plans_as_of(): Record<unknown>;

  @route("/api/conduit/plans/{id}/history")
  @get
  @doc("Get conduit plan history.")
  op get_api_conduit_plans_history(@path id: string): Record<unknown>;

  @route("/api/conduit/plans/{id}/receipts")
  @get
  @doc("Get conduit plan receipts.")
  op get_api_conduit_plans_receipts(@path id: string): Record<unknown>;

  @route("/api/conduit/deleted-plans")
  @get
  @doc("List deleted conduit plans.")
  op get_api_conduit_deleted_plans(): Record<unknown>;

  @route("/api/execution/requests")
  @post
  @doc("Create an execution request.")
  op post_api_execution_requests(): Record<unknown>;

  @route("/api/execution/requests")
  @get
  @doc("List execution requests.")
  op get_api_execution_requests(): Record<unknown>;

  @route("/api/execution/requests/{id}")
  @get
  @doc("Get a single execution request.")
  op get_api_execution_requests_2(@path id: string): Record<unknown>;

  @route("/api/execution/requests/{id}/transition")
  @patch
  @doc("Transition an execution request.")
  op patch_api_execution_requests_transition(@path id: string): Record<unknown>;

  @route("/api/execution/leases/acquire")
  @post
  @doc("Acquire an execution lease.")
  op post_api_execution_leases_acquire(): Record<unknown>;

  @route("/api/execution/leases/{id}/renew")
  @post
  @doc("Renew an execution lease.")
  op post_api_execution_leases_renew(@path id: string): Record<unknown>;

  @route("/api/execution/leases/{id}/release")
  @post
  @doc("Release an execution lease.")
  op post_api_execution_leases_release(@path id: string): Record<unknown>;

  @route("/api/role-leases/issue")
  @post
  @doc("Issue a role lease.")
  op post_api_role_leases_issue(): Record<unknown>;

  @route("/api/role-leases/{id}/renew")
  @post
  @doc("Renew a role lease.")
  op post_api_role_leases_renew(@path id: string): Record<unknown>;

  @route("/api/role-leases/{id}/revoke")
  @post
  @doc("Revoke a role lease.")
  op post_api_role_leases_revoke(@path id: string): Record<unknown>;

  @route("/api/role-leases")
  @get
  @doc("List role leases.")
  op get_api_role_leases(): Record<unknown>;

  @route("/api/cascade/subscriber-status")
  @get
  @doc("Cascade interactive-turn subscriber status.")
  op get_api_cascade_subscriber_status(): Record<unknown>;

  @route("/api/role-leases/stale")
  @get
  @doc("List stale role leases.")
  op get_api_role_leases_stale(): Record<unknown>;

  @route("/api/role-leases/consume")
  @post
  @doc("Consume a role lease.")
  op post_api_role_leases_consume(): Record<unknown>;

  @route("/api/execution/attempts")
  @post
  @doc("Create an execution attempt.")
  op post_api_execution_attempts(): Record<unknown>;

  @route("/api/execution/receipts")
  @post
  @doc("Issue an execution receipt.")
  op post_api_execution_receipts(): Record<unknown>;

  @route("/api/execution/receipts")
  @get
  @doc("List execution receipts.")
  op get_api_execution_receipts(): Record<unknown>;

  @route("/api/execution/state")
  @get
  @doc("Get execution state.")
  op get_api_execution_state(): Record<unknown>;

  @route("/api/open-questions")
  @get
  @doc("List open questions.")
  op get_api_open_questions(): Record<unknown>;

  @route("/api/open-questions/{id}/answers")
  @get
  @doc("List answers for an open question.")
  op get_api_open_questions_answers(@path id: string): Record<unknown>;

  @route("/api/open-questions/{id}/answers")
  @post
  @doc("Record an answer for an open question.")
  op post_api_open_questions_answers(@path id: string): Record<unknown>;

  @route("/api/open-questions")
  @post
  @doc("Create an open question.")
  op post_api_open_questions(): Record<unknown>;

  @route("/api/open-questions/{id}/answer")
  @put
  @doc("Legacy single-answer endpoint.")
  op put_api_open_questions_answer(@path id: string): Record<unknown>;

  @route("/api/open-questions/{id}/resolve")
  @put
  @doc("Resolve an open question.")
  op put_api_open_questions_resolve(@path id: string): Record<unknown>;

  @route("/api/roles")
  @get
  @doc("List governance roles.")
  op get_api_roles(): Record<unknown>;

  @route("/api/roles/{id}")
  @get
  @doc("Get a single role.")
  op get_api_roles_2(@path id: string): Record<unknown>;

  @route("/api/intents")
  @get
  @doc("List intent records.")
  op get_api_intents(): Record<unknown>;

  @route("/api/intents/{id}")
  @get
  @doc("Get a single intent record.")
  op get_api_intents_2(@path id: string): Record<unknown>;

  @route("/api/assessments")
  @get
  @doc("List assessments.")
  op get_api_assessments(): Record<unknown>;

  @route("/api/assessments/{id}")
  @get
  @doc("Get a single assessment.")
  op get_api_assessments_2(@path id: string): Record<unknown>;

  @route("/api/observations")
  @get
  @doc("List observations.")
  op get_api_observations(): Record<unknown>;

  @route("/api/observations/{id}")
  @get
  @doc("Get a single observation.")
  op get_api_observations_2(@path id: string): Record<unknown>;

  @route("/api/open-questions/{id}")
  @get
  @doc("Get a single open question.")
  op get_api_open_questions_2(@path id: string): Record<unknown>;

  @route("/api/open-questions/{id}/timeline")
  @get
  @doc("Deliberation timeline for an open question.")
  op get_api_open_questions_timeline(@path id: string): Record<unknown>;

  @route("/api/open-questions/{id}/participants")
  @get
  @doc("List participants for an open question.")
  op get_api_open_questions_participants(@path id: string): Record<unknown>;

  @route("/api/open-questions/{id}/participants")
  @post
  @doc("Add a participant to an open question.")
  op post_api_open_questions_participants(@path id: string): Record<unknown>;

  @route("/api/harvest-candidates/{id}/dependencies")
  @get
  @doc("List dependencies for a harvest candidate.")
  op get_api_harvest_candidates_dependencies(@path id: string): Record<unknown>;

  @route("/api/search")
  @get
  @doc("Cross-entity full-text search.")
  op get_api_search(): Record<unknown>;

  @route("/api/counts")
  @get
  @doc("Aggregate row counts across the data plane.")
  op get_api_counts(): Record<unknown>;

  @route("/api/architect-specs")
  @get
  @doc("List architect specs.")
  op get_api_architect_specs(): Record<unknown>;

  @route("/api/architect-specs/{id}")
  @get
  @doc("Get a single architect spec.")
  op get_api_architect_specs_2(@path id: string): Record<unknown>;

  @route("/api/architect-specs")
  @post
  @doc("Create an architect spec.")
  op post_api_architect_specs(): Record<unknown>;

  @route("/api/architect-specs/{id}")
  @delete
  @doc("Delete an architect spec.")
  op delete_api_architect_specs(@path id: string): Record<unknown>;

  @route("/api/artifact-provenance")
  @get
  @doc("List artifact provenance records.")
  op get_api_artifact_provenance(): Record<unknown>;

  @route("/api/artifact-provenance/{id}")
  @get
  @doc("Get a single artifact provenance record.")
  op get_api_artifact_provenance_2(@path id: string): Record<unknown>;

  @route("/api/artifact-provenance")
  @post
  @doc("Create an artifact provenance record.")
  op post_api_artifact_provenance(): Record<unknown>;

  @route("/api/artifact-provenance/{id}")
  @delete
  @doc("Delete an artifact provenance record.")
  op delete_api_artifact_provenance(@path id: string): Record<unknown>;

  @route("/api/search/semantic")
  @post
  @doc("Vector similarity search against the knowledge graph.")
  op post_api_search_semantic(): Record<unknown>;

  @route("/api/cpf")
  @get
  @doc("Compilation-readiness funnel query.")
  op get_api_cpf(): Record<unknown>;

  @route("/api/cpf/count")
  @get
  @doc("Compilation-readiness band counts.")
  op get_api_cpf_count(): Record<unknown>;

  @route("/api/cpf/promote")
  @post
  @doc("Promote a candidate (CPF >= 0.7).")
  op post_api_cpf_promote(): Record<unknown>;

  @route("/api/refresh-stats")
  @post
  @doc("Refresh nebula materialized views.")
  op post_api_refresh_stats(): Record<unknown>;

  @route("/api/systems/{id}/inventory")
  @get
  @doc("Unified inventory for a system via asset_relation.")
  op get_api_systems_inventory(@path id: string): Record<unknown>;

  @route("/api/inventory")
  @get
  @doc("Rollup counts for the full hierarchy tree.")
  op get_api_inventory(): Record<unknown>;

  @route("/api/systems/{id}/external-ids")
  @get
  @doc("List owned services via asset_relation.")
  op get_api_systems_external_ids(@path id: string): Record<unknown>;

  @route("/api/systems/{id}/external-ids")
  @post
  @doc("Deprecated — returns 410.")
  op post_api_systems_external_ids(@path id: string): Record<unknown>;

  @route("/api/systems/{id}/external-ids/{eid}")
  @delete
  @doc("Deprecated — returns 410.")
  op delete_api_systems_external_ids(@path id: string, @path eid: string): Record<unknown>;

  @route("/api/external-ids")
  @get
  @doc("Reverse lookup via asset_relation.")
  op get_api_external_ids(): Record<unknown>;

  @route("/api/external-ids/{id}")
  @patch
  @doc("Deprecated — returns 410.")
  op patch_api_external_ids(@path id: string): Record<unknown>;
  @route("/api/forums")
  @get
  @doc("List forums.")
  op get_api_forums(): Record<unknown>;

  @route("/api/forums/{slug}/threads")
  @get
  @doc("List threads in a forum by slug.")
  op get_api_forums_slug_threads(@path slug: string): Record<unknown>;

  @route("/api/forums/{slug}/threads")
  @post
  @doc("Create a thread in a forum by slug.")
  op post_api_forums_slug_threads(@path slug: string): Record<unknown>;

  @route("/api/forums/by-id/{forumId}/threads")
  @post
  @doc("Create a thread in a forum by UUID.")
  op post_api_forums_by_id_threads(@path forumId: string): Record<unknown>;

  @route("/api/forums/by-id/{forumId}/threads")
  @get
  @doc("List threads in a forum by UUID.")
  op get_api_forums_by_id_threads(@path forumId: string): Record<unknown>;

  @route("/api/forums/threads/{threadId}")
  @get
  @doc("Get a thread with its comment tree.")
  op get_api_forums_threads(@path threadId: string): Record<unknown>;

  @route("/api/forums/threads/{threadId}/comments")
  @post
  @doc("Add a comment to a thread.")
  op post_api_forums_threads_comments(@path threadId: string): Record<unknown>;

  @route("/api/forums/by-slug/{slug}")
  @get
  @doc("Get a forum by slug.")
  op get_api_forums_by_slug(@path slug: string): Record<unknown>;

  @route("/api/forums/by-id/{id}")
  @get
  @doc("Get a forum by UUID.")
  op get_api_forums_by_id(@path id: string): Record<unknown>;

  @route("/api/forums")
  @post
  @doc("Create a forum.")
  op post_api_forums(): Record<unknown>;

  @route("/api/forums/{id}")
  @put
  @doc("Update a forum.")
  op put_api_forums(@path id: string): Record<unknown>;

  @route("/api/forums/{id}")
  @delete
  @doc("Soft-delete a forum.")
  op delete_api_forums(@path id: string): Record<unknown>;

  @route("/api/forums/reorder")
  @put
  @doc("Reorder forums.")
  op put_api_forums_reorder(): Record<unknown>;

  @route("/api/forums/move-thread")
  @post
  @doc("Move a thread between forums.")
  op post_api_forums_move_thread(): Record<unknown>;

  @route("/api/forums/threads/{threadId}")
  @delete
  @doc("Soft-delete a thread.")
  op delete_api_forums_threads(@path threadId: string): Record<unknown>;

  @route("/api/forums/search/by-name")
  @get
  @doc("Search forums by name.")
  op get_api_forums_search_by_name(): Record<unknown>;

  @route("/api/forums/search/by-thread-title")
  @get
  @doc("Search threads by title.")
  op get_api_forums_search_by_thread_title(): Record<unknown>;

  @route("/api/forums/comments/{id}")
  @get
  @doc("Get a single comment.")
  op get_api_forums_comments(@path id: string): Record<unknown>;

  @route("/api/forums/comments/{id}")
  @delete
  @doc("Soft-delete a comment.")
  op delete_api_forums_comments(@path id: string): Record<unknown>;

  @route("/api/feed")
  @get
  @doc("List feed posts.")
  op get_api_feed(): Record<unknown>;

  @route("/api/feed")
  @post
  @doc("Create a feed post.")
  op post_api_feed(): Record<unknown>;

  @route("/api/feed/{id}")
  @delete
  @doc("Soft-delete a feed post.")
  op delete_api_feed(@path id: string): Record<unknown>;

  @route("/api/users")
  @get
  @doc("List users.")
  op get_api_users(): Record<unknown>;

  @route("/api/users/{id}")
  @get
  @doc("Get a user.")
  op get_api_users_id(@path id: string): Record<unknown>;

  @route("/api/users/by-alias/{userAlias}")
  @get
  @doc("Get a user by alias.")
  op get_api_users_by_alias(@path userAlias: string): Record<unknown>;

  @route("/api/users")
  @post
  @doc("Create a user.")
  op post_api_users(): Record<unknown>;

  @route("/api/bridges/forum-agenda")
  @post
  @doc("Link a forum to an agenda.")
  op post_api_bridges_forum_agenda(): Record<unknown>;

  @route("/api/bridges/forum-agenda")
  @delete
  @doc("Unlink a forum from an agenda.")
  op delete_api_bridges_forum_agenda(): Record<unknown>;

  @route("/api/bridges/forums-by-agenda/{agendaId}")
  @get
  @doc("List forums linked to an agenda.")
  op get_api_bridges_forums_by_agenda(@path agendaId: string): Record<unknown>;

  @route("/api/bridges/agendas-by-forum/{forumId}")
  @get
  @doc("List agendas linked to a forum.")
  op get_api_bridges_agendas_by_forum(@path forumId: string): Record<unknown>;

  @route("/api/bridges/post-artifact")
  @post
  @doc("Link a post to an artifact.")
  op post_api_bridges_post_artifact(): Record<unknown>;

  @route("/api/bridges/post-artifact")
  @delete
  @doc("Unlink a post from an artifact.")
  op delete_api_bridges_post_artifact(): Record<unknown>;

  @route("/api/bridges/artifact-threads/{type}/{id}")
  @get
  @doc("List threads linked to an artifact.")
  op get_api_bridges_artifact_threads(@path type: string, @path id: string): Record<unknown>;

  @route("/api/bridges/artifact-refs/{postId}")
  @get
  @doc("List artifact refs for a post.")
  op get_api_bridges_artifact_refs(@path postId: string): Record<unknown>;

  @route("/api/bridges/supporting-refs")
  @post
  @doc("Add a supporting ref.")
  op post_api_bridges_supporting_refs(): Record<unknown>;

  @route("/api/bridges/supporting-refs/post/{postId}")
  @get
  @doc("List supporting refs for a post.")
  op get_api_bridges_supporting_refs_post(@path postId: string): Record<unknown>;

  @route("/api/bridges/supporting-refs/comment/{commentId}")
  @get
  @doc("List supporting refs for a comment.")
  op get_api_bridges_supporting_refs_comment(@path commentId: string): Record<unknown>;

  @route("/api/duality/watches")
  @post
  @doc("Create or reactivate a session watch.")
  op post_api_duality_watches(): Record<unknown>;

  @route("/api/duality/watches/active")
  @get
  @doc("Find the most recent active watch for a role/forum.")
  op get_api_duality_watches_active(): Record<unknown>;

  @route("/api/duality/watches/{threadId}")
  @get
  @doc("List active watches for a thread.")
  op get_api_duality_watches_thread(@path threadId: string): Record<unknown>;
  @route("/workflows")
  @get
  @doc("List active workflow sessions.")
  op get_workflows(): Record<unknown>;

  @route("/tickets/detect")
  @post
  @doc("Detect stale and expired tickets.")
  op post_tickets_detect(): Record<unknown>;

  @route("/tickets/lineage/{planId}")
  @get
  @doc("Ticket audit trail for a plan.")
  op get_tickets_lineage(@path planId: string): Record<unknown>;

  @route("/tokens/plan/{planId}")
  @get
  @doc("Token usage summary for a plan.")
  op get_tokens_plan(@path planId: string): Record<unknown>;

  @route("/tokens/role/{role}")
  @get
  @doc("Token usage summary for a role.")
  op get_tokens_role(@path role: string): Record<unknown>;

  @route("/tokens/ticket/{ticketId}")
  @get
  @doc("Token usage for a ticket.")
  op get_tokens_ticket(@path ticketId: string): Record<unknown>;

  @route("/config/cron")
  @get
  @doc("Pipeline cron interval.")
  op get_config_cron(): Record<unknown>;

  @route("/config/failure-recovery")
  @get
  @doc("Failure recovery config.")
  op get_config_failure_recovery(): Record<unknown>;

  @route("/config/failure-recovery")
  @post
  @doc("Save failure recovery config.")
  op post_config_failure_recovery(): Record<unknown>;

  @route("/log/{sessionId}")
  @get
  @doc("SSE stream of a session log.")
  op get_log_session(@path sessionId: string): Record<unknown>;

  @route("/governance/replay")
  @post
  @doc("Replay receipts into governance events.")
  op post_governance_replay(): Record<unknown>;

  @route("/governance/events")
  @get
  @doc("List governance events.")
  op get_governance_events(): Record<unknown>;

  @route("/vision/work-requests")
  @post
  @doc("Create or upsert a work request.")
  op post_vision_work_requests(): Record<unknown>;

  @route("/vision/work-requests")
  @get
  @doc("List work requests.")
  op get_vision_work_requests(): Record<unknown>;

  @route("/vision/work-requests/{id}")
  @get
  @doc("Get a single work request.")
  op get_vision_work_requests_id(@path id: string): Record<unknown>;

  @route("/vision/receipts")
  @get
  @doc("List receipts for a plan.")
  op get_vision_receipts(): Record<unknown>;

  @route("/wr/{id}/projection-drift")
  @get
  @doc("Check projection-vs-replay drift for a work request.")
  op get_wr_projection_drift(@path id: string): Record<unknown>;

  @route("/wr/drift-scan")
  @get
  @doc("Sweep active work requests for projection drift.")
  op get_wr_drift_scan(): Record<unknown>;

// ── wind-srv (Wave 3.4) ───────────────────────────────────────────
  @route("/api/offices")
  @get
  @doc("List all wind offices")
  op get_offices(): Record<unknown>;

  @route("/api/offices/{id}")
  @get
  @doc("Get a wind office by ID")
  op get_offices_id(@path id: string): Record<unknown>;

  @route("/api/offices")
  @post
  @doc("Create a wind office")
  op post_offices(): Record<unknown>;

  @route("/api/offices/{id}")
  @put
  @doc("Update a wind office")
  op put_offices_id(@path id: string): Record<unknown>;

  @route("/api/offices/{id}")
  @delete
  @doc("Delete a wind office")
  op delete_offices_id(@path id: string): Record<unknown>;

  @route("/api/titles")
  @get
  @doc("List wind titles (optionally by office)")
  op get_titles(): Record<unknown>;

  @route("/api/titles/{id}")
  @get
  @doc("Get a wind title by ID")
  op get_titles_id(@path id: string): Record<unknown>;

  @route("/api/titles")
  @post
  @doc("Create a wind title")
  op post_titles(): Record<unknown>;

  @route("/api/titles/{id}")
  @put
  @doc("Update a wind title")
  op put_titles_id(@path id: string): Record<unknown>;

  @route("/api/titles/{id}")
  @delete
  @doc("Delete a wind title")
  op delete_titles_id(@path id: string): Record<unknown>;

  @route("/api/v-roles")
  @get
  @doc("List wind v_roles (nebula.roles view)")
  op get_v_roles(): Record<unknown>;

  @route("/api/v-roles/{name}")
  @get
  @doc("Get a wind v_role by name")
  op get_v_roles_name(@path name: string): Record<unknown>;

  @route("/api/workflows")
  @get
  @doc("List wind workflows")
  op get_wind_workflows(): Record<unknown>;

  @route("/api/workflows/{id}")
  @get
  @doc("Get a wind workflow with versions")
  op get_workflows_id(@path id: string): Record<unknown>;

  @route("/api/workflows")
  @post
  @doc("Create a wind workflow")
  op post_workflows(): Record<unknown>;

  @route("/api/workflows/{id}")
  @put
  @doc("Update a wind workflow")
  op put_workflows_id(@path id: string): Record<unknown>;

  @route("/api/workflows/{id}")
  @delete
  @doc("Delete a wind workflow")
  op delete_workflows_id(@path id: string): Record<unknown>;

  @route("/api/versions")
  @get
  @doc("List wind workflow versions for a workflow")
  op get_versions(): Record<unknown>;

  @route("/api/versions/{id}")
  @get
  @doc("Get a wind workflow version with nodes and edges")
  op get_versions_id(@path id: string): Record<unknown>;

  @route("/api/versions")
  @post
  @doc("Create a wind workflow version (auto-increment)")
  op post_versions(): Record<unknown>;

  @route("/api/versions/{id}/activate")
  @post
  @doc("Activate a wind workflow version")
  op post_versions_id_activate(@path id: string): Record<unknown>;

  @route("/api/versions/{id}")
  @delete
  @doc("Delete a wind workflow version")
  op delete_versions_id(@path id: string): Record<unknown>;

  @route("/api/nodes")
  @get
  @doc("List wind workflow nodes for a version")
  op get_nodes(): Record<unknown>;

  @route("/api/nodes/{id}")
  @get
  @doc("Get a wind workflow node by ID")
  op get_nodes_id(@path id: string): Record<unknown>;

  @route("/api/nodes")
  @post
  @doc("Create a wind workflow node")
  op post_nodes(): Record<unknown>;

  @route("/api/nodes/{id}")
  @put
  @doc("Update a wind workflow node")
  op put_nodes_id(@path id: string): Record<unknown>;

  @route("/api/nodes/{id}")
  @delete
  @doc("Delete a wind workflow node")
  op delete_nodes_id(@path id: string): Record<unknown>;

  @route("/api/edges")
  @get
  @doc("List wind workflow edges for a version")
  op get_edges(): Record<unknown>;

  @route("/api/edges")
  @post
  @doc("Create a wind workflow edge")
  op post_edges(): Record<unknown>;

  @route("/api/edges/{id}")
  @delete
  @doc("Delete a wind workflow edge")
  op delete_edges_id(@path id: string): Record<unknown>;

  @route("/api/tasks")
  @get
  @doc("List wind tasks (optionally by office)")
  op get_tasks(): Record<unknown>;

  @route("/api/tasks/{id}")
  @get
  @doc("Get a wind task with outcomes")
  op get_tasks_id(@path id: string): Record<unknown>;

  @route("/api/tasks")
  @post
  @doc("Create a wind task")
  op post_tasks(): Record<unknown>;

  @route("/api/tasks/{id}")
  @put
  @doc("Update a wind task")
  op put_tasks_id(@path id: string): Record<unknown>;

  @route("/api/tasks/{id}")
  @delete
  @doc("Delete a wind task")
  op delete_tasks_id(@path id: string): Record<unknown>;

  @route("/api/outcomes")
  @get
  @doc("List wind task outcomes for a task")
  op get_outcomes(): Record<unknown>;

  @route("/api/outcomes/{id}")
  @get
  @doc("Get a wind task outcome by ID")
  op get_outcomes_id(@path id: string): Record<unknown>;

  @route("/api/outcomes")
  @post
  @doc("Create a wind task outcome")
  op post_outcomes(): Record<unknown>;

  @route("/api/outcomes/{id}")
  @delete
  @doc("Delete a wind task outcome")
  op delete_outcomes_id(@path id: string): Record<unknown>;

  @route("/api/instances")
  @get
  @doc("List wind workflow instances")
  op get_instances(): Record<unknown>;

  @route("/api/instances/{id}")
  @get
  @doc("Get a wind workflow instance with tickets")
  op get_instances_id(@path id: string): Record<unknown>;

  @route("/api/instances")
  @post
  @doc("Start a wind workflow instance")
  op post_instances(): Record<unknown>;

  @route("/api/instances/{id}/pause")
  @post
  @doc("Pause a wind workflow instance")
  op post_instances_id_pause(@path id: string): Record<unknown>;

  @route("/api/instances/{id}/resume")
  @post
  @doc("Resume a paused wind workflow instance")
  op post_instances_id_resume(@path id: string): Record<unknown>;

  @route("/api/instances/{id}/stop")
  @post
  @doc("Stop (fail) a wind workflow instance")
  op post_instances_id_stop(@path id: string): Record<unknown>;

  @route("/api/instances/{id}/execute")
  @post
  @doc("Execute a ticket's task via harness")
  op post_instances_id_execute(@path id: string): Record<unknown>;

  @route("/api/instances/{id}/advance")
  @post
  @doc("Advance a ticket with an outcome")
  op post_instances_id_advance(@path id: string): Record<unknown>;

  @route("/api/instances/{id}/run")
  @post
  @doc("Auto-run an instance to completion")
  op post_instances_id_run(@path id: string): Record<unknown>;

  @route("/api/tickets")
  @get
  @doc("List wind tickets")
  op get_tickets(): Record<unknown>;

  @route("/api/tickets/{id}")
  @get
  @doc("Get a wind ticket by ID")
  op get_tickets_id(@path id: string): Record<unknown>;

  @route("/api/tickets/{id}/status")
  @put
  @doc("Update a wind ticket status")
  op put_tickets_id_status(@path id: string): Record<unknown>;

  @route("/api/tickets/{id}/cancel")
  @post
  @doc("Cancel a wind ticket")
  op post_tickets_id_cancel(@path id: string): Record<unknown>;

  @route("/api/receipts")
  @get
  @doc("List wind receipts (optionally by ticket)")
  op get_receipts(): Record<unknown>;

  @route("/api/receipts/{id}")
  @get
  @doc("Get a wind receipt by ID")
  op get_receipts_id(@path id: string): Record<unknown>;

  @route("/api/validate/{version_id}")
  @get
  @doc("Validate a wind workflow version graph")
  op get_validate_version_id(@path version_id: string): Record<unknown>;

  @route("/api/validate/{version_id}/structure")
  @post
  @doc("Validate wind workflow version structure")
  op post_validate_version_id_structure(@path version_id: string): Record<unknown>;

  @route("/api/events")
  @get
  @doc("List wind events")
  op get_events(): Record<unknown>;

  @route("/api/events/poll")
  @post
  @doc("Poll unconsumed wind events")
  op post_events_poll(): Record<unknown>;

  @route("/api/events/{id}")
  @get
  @doc("Get a wind event by ID")
  op get_events_id(@path id: string): Record<unknown>;

  @route("/api/events")
  @post
  @doc("Create a wind event (broadcast to NATS)")
  op post_events(): Record<unknown>;

  @route("/api/event-types")
  @get
  @doc("List wind event types")
  op get_event_types(): Record<unknown>;

  @route("/api/event-types/{eventType}")
  @get
  @doc("Get a wind event type by key")
  op get_event_types_eventType(@path eventType: string): Record<unknown>;

  @route("/api/event-types")
  @post
  @doc("Register a wind event type")
  op post_event_types(): Record<unknown>;

  @route("/api/event-types/{eventType}")
  @delete
  @doc("Delete a wind event type")
  op delete_event_types_eventType(@path eventType: string): Record<unknown>;

// ── tackle-srv (Wave 3.5) ───────────────────────────────────────────
  @route("/config/ai")
  @get
  @doc("Get the full AI config snapshot (providers, harnesses, models, roles, bundles)")
  op get_config_ai(): Record<unknown>;

  @route("/config/ai/validate")
  @get
  @doc("Validate the AI config for missing references")
  op get_config_ai_validate(): Record<unknown>;

  @route("/config/ai/seed-defaults")
  @post
  @doc("Seed default AI config (providers, harnesses)")
  op post_config_ai_seed_defaults(): Record<unknown>;

  @route("/config/ai/import")
  @post
  @doc("Import a full AI config snapshot")
  op post_config_ai_import(): Record<unknown>;

  @route("/config/ai/providers")
  @get
  @doc("List AI providers")
  op get_config_ai_providers(): Record<unknown>;

  @route("/config/ai/provider/{id}")
  @get
  @doc("Get an AI provider by id")
  op get_config_ai_provider_id(@path id: string): Record<unknown>;

  @route("/config/ai/provider")
  @post
  @doc("Upsert an AI provider")
  op post_config_ai_provider(): Record<unknown>;

  @route("/config/ai/provider/{id}")
  @delete
  @doc("Delete an AI provider")
  op delete_config_ai_provider_id(@path id: string): Record<unknown>;

  @route("/config/ai/harnesses")
  @get
  @doc("List AI harnesses")
  op get_config_ai_harnesses(): Record<unknown>;

  @route("/config/ai/harness/{id}")
  @get
  @doc("Get an AI harness by id")
  op get_config_ai_harness_id(@path id: string): Record<unknown>;

  @route("/config/ai/harness")
  @post
  @doc("Upsert an AI harness")
  op post_config_ai_harness(): Record<unknown>;

  @route("/config/ai/harness/{id}")
  @delete
  @doc("Delete an AI harness")
  op delete_config_ai_harness_id(@path id: string): Record<unknown>;

  @route("/config/ai/models")
  @get
  @doc("List AI models")
  op get_config_ai_models(): Record<unknown>;

  @route("/config/ai/model/{id}")
  @get
  @doc("Get an AI model by id")
  op get_config_ai_model_id(@path id: string): Record<unknown>;

  @route("/config/ai/model")
  @post
  @doc("Upsert an AI model")
  op post_config_ai_model(): Record<unknown>;

  @route("/config/ai/model/{id}")
  @delete
  @doc("Delete an AI model")
  op delete_config_ai_model_id(@path id: string): Record<unknown>;

  @route("/config/ai/roles")
  @get
  @doc("List AI role configs")
  op get_config_ai_roles(): Record<unknown>;

  @route("/config/ai/role/{role}")
  @get
  @doc("Get an AI role config by role name")
  op get_config_ai_role_role(@path role: string): Record<unknown>;

  @route("/config/ai/role")
  @post
  @doc("Upsert an AI role config (with optional bundles)")
  op post_config_ai_role(): Record<unknown>;

  @route("/config/ai/role/{role}")
  @delete
  @doc("Delete an AI role config")
  op delete_config_ai_role_role(@path role: string): Record<unknown>;

  @route("/config/ai/bundles")
  @get
  @doc("List all config bundles")
  op get_config_ai_bundles(): Record<unknown>;

  @route("/config/ai/bundles/{role}")
  @get
  @doc("List config bundles for a role")
  op get_config_ai_bundles_role(@path role: string): Record<unknown>;

  @route("/config/ai/bundle/{id}")
  @get
  @doc("Get a config bundle by id")
  op get_config_ai_bundle_id(@path id: string): Record<unknown>;

  @route("/config/ai/bundle")
  @post
  @doc("Upsert a config bundle")
  op post_config_ai_bundle(): Record<unknown>;

  @route("/config/ai/bundle/{id}")
  @delete
  @doc("Delete a config bundle")
  op delete_config_ai_bundle_id(@path id: string): Record<unknown>;

  @route("/config/ai/bundles/{role}")
  @post
  @doc("Bulk upsert config bundles for a role")
  op post_config_ai_bundles_role(@path role: string): Record<unknown>;

  @route("/config/ai/resolve/{role}")
  @get
  @doc("Resolve the effective AI config for a role")
  op get_config_ai_resolve_role(@path role: string): Record<unknown>;

  @route("/config/ai/test")
  @post
  @doc("Test-invoke a verified model via its harness")
  op post_config_ai_test(): Record<unknown>;

  @route("/config/ai/verify")
  @post
  @doc("Verify a model via a harness run")
  op post_config_ai_verify(): Record<unknown>;

  @route("/config/ai/verify/{sessionId}")
  @get
  @doc("Poll a model verification session")
  op get_config_ai_verify_sessionId(@path sessionId: string): Record<unknown>;

  @route("/config/ai/tool-access")
  @get
  @doc("List role tool-access rules")
  op get_config_ai_tool_access(): Record<unknown>;

  @route("/config/ai/tool-access/{role}")
  @get
  @doc("List tool-access rules for a role")
  op get_config_ai_tool_access_role(@path role: string): Record<unknown>;

  @route("/config/ai/tool-access/{id}")
  @patch
  @doc("Update (allow/deny) a tool-access rule")
  op patch_config_ai_tool_access_id(@path id: string): Record<unknown>;

  @route("/sessions")
  @get
  @doc("List agent sessions")
  op get_sessions(): Record<unknown>;

  @route("/sessions/{sessionId}/kill")
  @post
  @doc("Kill a running agent session")
  op post_sessions_sessionId_kill(@path sessionId: string): Record<unknown>;

  @route("/roles")
  @get
  @doc("List tackle roles")
  op get_roles(): Record<unknown>;

  @route("/roles/{id}")
  @get
  @doc("Get a tackle role by id or name")
  op get_roles_id(@path id: string): Record<unknown>;

  @route("/roles")
  @post
  @doc("Upsert a tackle role")
  op post_roles(): Record<unknown>;

  @route("/roles/{id}")
  @delete
  @doc("Delete a tackle role")
  op delete_roles_id(@path id: string): Record<unknown>;

  @route("/scheduler")
  @get
  @doc("List agent scheduler entries")
  op get_scheduler(): Record<unknown>;

  @route("/scheduler/due")
  @get
  @doc("List due scheduler entries with prompt bodies")
  op get_scheduler_due(): Record<unknown>;

  @route("/scheduler/{id}")
  @get
  @doc("Get a scheduler entry by id")
  op get_scheduler_id(@path id: string): Record<unknown>;

  @route("/scheduler")
  @post
  @doc("Create a scheduler entry")
  op post_scheduler(): Record<unknown>;

  @route("/scheduler/{id}")
  @patch
  @doc("Update a scheduler entry")
  op patch_scheduler_id(@path id: string): Record<unknown>;

  @route("/scheduler/{id}")
  @delete
  @doc("Delete a scheduler entry")
  op delete_scheduler_id(@path id: string): Record<unknown>;

  @route("/logs")
  @get
  @doc("Query system logs with filters")
  op get_logs(): Record<unknown>;

  @route("/logs/emit")
  @post
  @doc("Emit a system log entry")
  op post_logs_emit(): Record<unknown>;

  @route("/logs")
  @delete
  @doc("Clear all system logs")
  op delete_logs(): Record<unknown>;

  @route("/health/history")
  @get
  @doc("Get health metric history")
  op get_health_history(): Record<unknown>;

  @route("/health/metrics")
  @get
  @doc("Get current system health metrics")
  op get_health_metrics(): Record<unknown>;

  @route("/health/simulate-load")
  @post
  @doc("Simulate load (no-op stub)")
  op post_health_simulate_load(): Record<unknown>;

  @route("/tasks/inspector/dispatch")
  @get
  @doc("Get inspector task dispatch with prompt bodies")
  op get_tasks_inspector_dispatch(): Record<unknown>;

  @route("/tasks")
  @get
  @doc("List tackle tasks")
  op get_tackle_tasks(): Record<unknown>;

  @route("/tasks/{task_slug}")
  @get
  @doc("Get a tackle task by slug")
  op get_tasks_task_slug(@path task_slug: string): Record<unknown>;

  @route("/tasks")
  @post
  @doc("Upsert a tackle task")
  op post_tackle_tasks(): Record<unknown>;

  @route("/tasks/{task_slug}")
  @delete
  @doc("Delete a tackle task by slug")
  op delete_tasks_task_slug(@path task_slug: string): Record<unknown>;

  @route("/prompts")
  @get
  @doc("List all prompt templates")
  op get_prompts(): Record<unknown>;

  @route("/prompts")
  @post
  @doc("Upsert a prompt template")
  op post_prompts(): Record<unknown>;

  @route("/prompts/{role}")
  @get
  @doc("List prompt templates for a role")
  op get_prompts_role(@path role: string): Record<unknown>;

  @route("/prompts/{role}/{slug}")
  @get
  @doc("Get a prompt template by role and slug")
  op get_prompts_role_slug(@path role: string, @path slug: string): Record<unknown>;

  @route("/memory/procedures/{role}")
  @get
  @doc("List procedure cards linked to a role")
  op get_memory_procedures_role(@path role: string): Record<unknown>;

  @route("/memory/procedure/{slug}")
  @get
  @doc("Get a procedure card by slug")
  op get_memory_procedure_slug(@path slug: string): Record<unknown>;

  @route("/memory/check-since")
  @post
  @doc("Check whether a role's memory changed since a timestamp")
  op post_memory_check_since(): Record<unknown>;

  @route("/memory/refresh")
  @post
  @doc("Refresh memory counts")
  op post_memory_refresh(): Record<unknown>;

  @route("/memory/role-updates")
  @get
  @doc("Get role memory checkpoints")
  op get_memory_role_updates(): Record<unknown>;

  @route("/projections")
  @get
  @doc("List projection configs")
  op get_projections(): Record<unknown>;

  @route("/projections/drift")
  @get
  @doc("Compare on-disk projection shas against stored")
  op get_projections_drift(): Record<unknown>;

  @route("/projections/{id}")
  @get
  @doc("Get a projection config by id")
  op get_projections_id(@path id: string): Record<unknown>;

  @route("/projections")
  @post
  @doc("Create a projection config")
  op post_projections(): Record<unknown>;

  @route("/projections/{id}")
  @put
  @doc("Update a projection config")
  op put_projections_id(@path id: string): Record<unknown>;

  @route("/projections/{id}/render")
  @post
  @doc("Render a single projection")
  op post_projections_id_render(@path id: string): Record<unknown>;

  @route("/projections/render-all")
  @post
  @doc("Render all enabled projections")
  op post_projections_render_all(): Record<unknown>;
// ── kernel-srv (/api/kernel) ──
@route("/api/kernel/transitions")
@post
op post_kernel_transitions(): Record<unknown>;

@route("/api/kernel/transitions/{event_id}")
@get
op get_kernel_transition(event_id: string): Record<unknown>;

@route("/api/kernel/transitions/{event_id}/causality")
@get
op get_kernel_transition_causality(event_id: string): Record<unknown>;

@route("/api/kernel/receipts")
@post
op post_kernel_receipts(): Record<unknown>;

@route("/api/kernel/receipts/{id}/chain")
@get
op get_kernel_receipt_chain(id: string): Record<unknown>;

@route("/api/kernel/plans/{plan_number}/receipts")
@get
op get_kernel_plan_receipts(plan_number: string): Record<unknown>;

@route("/api/kernel/aggregates/{aggregate_type}/{aggregate_id}/events")
@get
op get_kernel_aggregate_events(aggregate_type: string, aggregate_id: string): Record<unknown>;

@route("/api/kernel/policy/active")
@get
op get_kernel_policy_active(): Record<unknown>;

@route("/api/kernel/policy/maturity")
@get
op get_kernel_policy_maturity(): Record<unknown>;

@route("/api/kernel/health/recent-events")
@get
op get_kernel_health_recent_events(): Record<unknown>;

@route("/api/kernel/health/receipt-integrity")
@get
op get_kernel_health_receipt_integrity(): Record<unknown>;

@route("/api/kernel/events/stream")
@get
op get_kernel_events_stream(): Record<unknown>;


// ── peb-srv (/api/peb) ──
@route("/api/peb/health")
@get
op get_peb_health(): Record<unknown>;

@route("/api/peb/health/circuit-breakers")
@get
op get_peb_health_circuit_breakers(): Record<unknown>;

@route("/api/peb/health/violations/summary")
@get
op get_peb_health_violations_summary(): Record<unknown>;

@route("/api/peb/health/entropy")
@get
op get_peb_health_entropy(): Record<unknown>;

@route("/api/peb/events/stream")
@get
op get_peb_events_stream(): Record<unknown>;

@route("/api/peb/events")
@get
op get_peb_events(): Record<unknown>;

@route("/api/peb/events/{receipt_id}")
@get
op get_peb_event(receipt_id: string): Record<unknown>;

@route("/api/peb/events/{receipt_id}/replay")
@post
op post_peb_event_replay(receipt_id: string): Record<unknown>;

@route("/api/peb/transactions")
@get
op get_peb_transactions(): Record<unknown>;

@route("/api/peb/transactions/{id}")
@get
op get_peb_transaction(id: string): Record<unknown>;

@route("/api/peb/transactions/{id}/lineage")
@get
op get_peb_transaction_lineage(id: string): Record<unknown>;

@route("/api/peb/traces/{id}/tree")
@get
op get_peb_trace_tree(id: string): Record<unknown>;

@route("/api/peb/decisions")
@get
op get_peb_decisions(): Record<unknown>;

@route("/api/peb/decisions/next-number")
@get
op get_peb_decisions_next_number(): Record<unknown>;

@route("/api/peb/decisions/{id}")
@get
op get_peb_decision(id: string): Record<unknown>;

@route("/api/peb/decisions")
@post
op post_peb_decisions(): Record<unknown>;

@route("/api/peb/decisions/{id}")
@patch
op patch_peb_decision(id: string): Record<unknown>;

@route("/api/peb/decisions/{id}/supersede")
@post
op post_peb_decision_supersede(id: string): Record<unknown>;

@route("/api/peb/decisions/{id}/chain")
@get
op get_peb_decision_chain(id: string): Record<unknown>;

@route("/api/peb/entities/{entity_id}/capability-gap")
@get
op get_peb_entity_capability_gap(entity_id: string): Record<unknown>;

@route("/api/peb/entities/{entity_id}/capabilities")
@get
op get_peb_entity_capabilities(entity_id: string): Record<unknown>;

@route("/api/peb/state/{key}/versions")
@get
op get_peb_state_versions(key: string): Record<unknown>;

@route("/api/peb/state/{key}/diff")
@get
op get_peb_state_diff(key: string): Record<unknown>;


// ── cascade-srv (/cascade) ──
@route("/cascade/events")
@get
op get_cascade_events(): Record<unknown>;

@route("/cascade/events/{id}")
@get
op get_cascade_event(id: string): Record<unknown>;

@route("/cascade/events/{id}/lineage")
@get
op get_cascade_event_lineage(id: string): Record<unknown>;

@route("/cascade/events/{id}/children")
@get
op get_cascade_event_children(id: string): Record<unknown>;

@route("/cascade/lineage")
@get
op get_cascade_lineage(): Record<unknown>;

@route("/cascade/analytics")
@get
op get_cascade_analytics(): Record<unknown>;

@route("/cascade/subscribers")
@get
op get_cascade_subscribers(): Record<unknown>;

@route("/cascade/subscribers/{pattern}")
@get
op get_cascade_subscriber(pattern: string): Record<unknown>;

@route("/cascade/subscribers/{pattern}")
@patch
op patch_cascade_subscriber(pattern: string): Record<unknown>;

@route("/cascade/assessments")
@get
op get_cascade_assessments(): Record<unknown>;

@route("/cascade/health")
@get
op get_cascade_health(): Record<unknown>;


}
