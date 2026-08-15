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

  @route("/prompts/{role}")
  @get
  @doc("Return the role's cached prompt index (launch-time lookup).")
  op listRolePrompts(@path role: string): PromptIndexEntry[];

  @route("/prompt/{role}/{slug}")
  @get
  @doc("Return the full cached prompt card (latest version). 404 if missing.")
  op getPromptCard(@path role: string, @path slug: string): PromptCard | ErrorResponse;

  @route("/tasks/{role}")
  @get
  @doc("Return the role's cached active task index.")
  op listRoleTasks(@path role: string): TaskIndexEntry[];

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
}
