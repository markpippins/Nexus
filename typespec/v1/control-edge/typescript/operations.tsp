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
}
