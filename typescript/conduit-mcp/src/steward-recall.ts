/**
 * steward-recall.ts
 *
 * Steward Recall Orchestrator: Shared API, Internal Transformation
 * (Plan 1066)
 *
 * Build a single KnowledgeRecallService that all roles call, implemented
 * by StewardRecallOrchestrator which inserts transformation/federation
 * functions into the call path.
 *
 * Key principle: Shared recall with Steward-owned internal query
 * transformation — not search privilege. Every role calls the same
 * protocol; the Steward transforms the query internally based on the
 * requester's role.
 */

import { Pool } from "pg";
import { AgentRole } from "./types.js";

// ── Protocol Types ───────────────────────────────────────────────────────

/**
 * RequesterRole extends AgentRole with "inspector" — the recall service
 * is called by all agent roles plus the Inspector (which is a governance
 * role not in the standard AgentRole enum).
 */
export type RequesterRole = AgentRole | "inspector";

export type RecallScope =
  | "local"        // Only the immediate system/subsystem
  | "subtree"      // System + children
  | "global";      // Entire knowledge graph

export type RecallPurpose =
  | "implementation"  // Builder needs implementation context
  | "design"          // Architect needs design rationale
  | "planning"        // Planner needs scope/dependencies
  | "review"          // Reviewer needs spec compliance context
  | "audit"           // Inspector needs compliance lineage
  | "analysis";       // Analyst needs gap analysis context

export interface RecallQuery {
  /** Natural language query string */
  query: string;
  /** Optional embedding vector for semantic search */
  queryEmbedding?: number[];
  /** Maximum results to return */
  limit?: number;
  /** Minimum similarity threshold (0.0–1.0) */
  minConfidence?: number;
}

export interface RecallConstraints {
  /** Filter by document kind */
  documentKinds?: string[];
  /** Filter by origin system */
  originSystems?: string[];
  /** Filter by evidence link type */
  evidenceLinkTypes?: string[];
  /** Only include accepted evidence links */
  onlyAcceptedEvidence?: boolean;
  /** Minimum confidence threshold (0.0–1.0) */
  minConfidence?: number;
  /** Include contradictions (default: false for Builder, true for Inspector) */
  includeContradictions?: boolean;
  /** Expand provenance/source chains */
  expandProvenance?: boolean;
}

export interface RecallRequest {
  query: RecallQuery;
  requesterRole: RequesterRole;
  scope: RecallScope;
  purpose: RecallPurpose;
  constraints?: RecallConstraints;
}

// ── Result Types ─────────────────────────────────────────────────────────

export interface RecallResult {
  /** Retrieved items ranked by relevance */
  items: RecallItem[];
  /** The recall plan that was executed (for auditability) */
  recallPlan: RecallPlan;
  /** Evidence and provenance attached to items */
  evidence: RecallEvidence[];
  /** Total items found (before limit) */
  totalFound: number;
  /** Whether contradictions were found */
  hasContradictions: boolean;
  /** Transformation metadata: what role-based transforms were applied */
  transformations: string[];
}

export interface RecallItem {
  id: string;
  originSystem: string;
  originTable: string;
  originId: string;
  documentKind: string;
  title: string;
  body: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface RecallEvidence {
  itemId: string;
  evidenceLinkType: string;
  evidenceStatus: string;
  confidence: number;
  rationale: string;
  sourceCandidateId?: string;
  sourceHarvestId?: string;
}

export interface RecallPlan {
  /** Phases that will be executed */
  phases: RecallPhase[];
  /** Estimated cost (in DB queries) */
  estimatedCost: number;
}

export type RecallPhase =
  | "build_recall_plan"
  | "apply_role_transformations"
  | "execute_federated_search"
  | "attach_evidence_and_provenance"
  | "shape_for_requester";

// ── Protocol Interface ───────────────────────────────────────────────────

/**
 * KnowledgeRecallService — the single shared recall protocol.
 * Every role calls this. The implementation handles role-based
 * transformations internally.
 */
export interface KnowledgeRecallService {
  recall(request: RecallRequest): Promise<RecallResult>;
}

// ── Role-Based Transformation Functions ──────────────────────────────────

type RoleTransformation = (
  request: RecallRequest,
) => RecallRequest;

/**
 * Role-based transformations modify the query/constraints based on
 * the requester's role. This is NOT access control — it's internal
 * query shaping for relevance.
 *
 * Builder → suppress low-confidence chatter, focus on L1 operational docs
 * Architect → bias toward graph entities and L3 design rationale
 * Inspector → include contradictions, expand provenance
 * Analyst → broad scope, include all evidence types
 */
const ROLE_TRANSFORMATIONS: Record<RequesterRole, RoleTransformation> = {
  builder: (req) => ({
    ...req,
    constraints: {
      ...req.constraints,
      onlyAcceptedEvidence: true,
      includeContradictions: false,
      documentKinds: req.constraints?.documentKinds ?? ["knowledge_entity", "agent_record"],
      minConfidence: req.constraints?.minConfidence ?? 0.7,
    },
  }),

  architect: (req) => ({
    ...req,
    constraints: {
      ...req.constraints,
      documentKinds: req.constraints?.documentKinds ?? ["knowledge_entity"],
      includeContradictions: req.constraints?.includeContradictions ?? true,
      expandProvenance: true,
    },
  }),

  planner: (req) => ({
    ...req,
    scope: req.scope === "local" ? "subtree" : req.scope,
    constraints: {
      ...req.constraints,
      documentKinds: req.constraints?.documentKinds ?? ["knowledge_entity", "requirement", "plan"],
      onlyAcceptedEvidence: true,
    },
  }),

  reviewer: (req) => ({
    ...req,
    constraints: {
      ...req.constraints,
      documentKinds: req.constraints?.documentKinds ?? ["knowledge_entity", "agent_record"],
      includeContradictions: true,
      expandProvenance: true,
    },
  }),

  inspector: (req) => ({
    ...req,
    constraints: {
      ...req.constraints,
      includeContradictions: true,
      expandProvenance: true,
      onlyAcceptedEvidence: false,
    },
  }),

  critic: (req) => ({
    ...req,
    constraints: {
      ...req.constraints,
      includeContradictions: true,
      expandProvenance: true,
      onlyAcceptedEvidence: false,
    },
  }),

  analyst: (req) => ({
    ...req,
    scope: "global",
    constraints: {
      ...req.constraints,
      includeContradictions: true,
      expandProvenance: true,
      onlyAcceptedEvidence: false,
    },
  }),
};

// ── StewardRecallOrchestrator Implementation ─────────────────────────────

/**
 * StewardRecallOrchestrator implements KnowledgeRecallService.
 *
 * Orchestration phases:
 *   1. build_recall_plan — determine which sources to query
 *   2. apply_role_transformations — shape query based on requester role
 *   3. execute_federated_search — query graph entities, semantic docs, evidence
 *   4. attach_evidence_and_provenance — join evidence_links and source data
 *   5. shape_for_requester — format results for the requesting role
 */
export class StewardRecallOrchestrator implements KnowledgeRecallService {
  constructor(private pool: Pool) {}

  async recall(request: RecallRequest): Promise<RecallResult> {
    const transformations: string[] = [];

    // ── Phase 1: build_recall_plan ────────────────────────────────
    const phases: RecallPhase[] = [
      "build_recall_plan",
      "apply_role_transformations",
      "execute_federated_search",
      "attach_evidence_and_provenance",
      "shape_for_requester",
    ];
    const plan: RecallPlan = { phases, estimatedCost: phases.length };

    // ── Phase 2: apply_role_transformations ───────────────────────
    const transform = ROLE_TRANSFORMATIONS[request.requesterRole];
    const transformedRequest = transform(request);
    transformations.push(`role_transform:${request.requesterRole}`);

    // ── Phase 3: execute_federated_search ─────────────────────────
    let items: RecallItem[] = [];
    const { query, constraints } = transformedRequest;

    // 3a. Semantic search via steward.semantic_documents
    if (query.queryEmbedding && query.queryEmbedding.length > 0 && query.queryEmbedding.every(n => typeof n === 'number' && isFinite(n))) {
      const embeddingStr = `[${query.queryEmbedding.join(",")}]`;
      const semanticResults = await this.pool.query(
        `SELECT * FROM steward.semantic_search(
           $1::vector, $2, $3, $4
         )`,
        [
          embeddingStr,
          query.limit ?? 10,
          constraints?.documentKinds?.[0] ?? null,
          constraints?.originSystems?.[0] ?? null,
        ],
      );
      items = semanticResults.rows.map((r: any) => ({
        id: r.id,
        originSystem: r.origin_system,
        originTable: r.origin_table,
        originId: r.origin_id,
        documentKind: r.document_kind,
        title: r.title,
        body: r.body?.slice(0, 500) ?? "",
        similarity: r.similarity,
      }));
    }

    // 3b. Graph entity search via knowledge.graph_entities (text search)
    if (query.query && (!query.queryEmbedding || items.length < (query.limit ?? 10))) {
      const graphResults = await this.pool.query(
        `SELECT ge.id, ge.name AS title, ge.description AS body,
                'knowledge' AS origin_system,
                'graph_entities' AS origin_table,
                'knowledge_entity' AS document_kind
         FROM knowledge.graph_entities ge
         WHERE ge.name ILIKE '%' || $1 || '%'
            OR ge.description ILIKE '%' || $1 || '%'
         LIMIT $2`,
        [query.query, query.limit ?? 10],
      );
      const graphItems: RecallItem[] = graphResults.rows.map((r: any) => ({
        id: r.id,
        originSystem: r.origin_system,
        originTable: r.origin_table,
        originId: r.id,
        documentKind: r.document_kind,
        title: r.title,
        body: r.body?.slice(0, 500) ?? "",
        similarity: 0.1, // Text search — lower priority than semantic results
      }));
      // Merge, dedup by originId
      const seen = new Set(items.map(i => i.originId));
      for (const gi of graphItems) {
        if (!seen.has(gi.originId)) items.push(gi);
      }
    }

    // ── Phase 4: attach_evidence_and_provenance (batched) ────────
    const evidence: RecallEvidence[] = [];
    const c = constraints; // Narrow to non-optional for this block
    if (c?.expandProvenance !== false && items.length > 0) {
      // Batch query: fetch evidence for all knowledge_entity items at once
      const entityIds = items
        .filter(i => i.documentKind === "knowledge_entity")
        .slice(0, 20)
        .map(i => i.originId);
      if (entityIds.length > 0) {
        const evidenceResults = await this.pool.query(
          `SELECT el.knowledge_entity_id, el.id AS link_id, el.link_type,
                  el.status, el.confidence, el.rationale,
                  el.nebula_candidate_id, el.nebula_harvest_id
           FROM steward.evidence_links el
           WHERE el.knowledge_entity_id = ANY($1::uuid[])
             AND ($2::text IS NULL OR el.link_type = $2)
             AND ($3::boolean OR el.status = $4)`,
          [
            entityIds,
            c?.evidenceLinkTypes?.[0] ?? null,
            !c?.onlyAcceptedEvidence,
            "accepted",
          ],
        );
        for (const er of evidenceResults.rows) {
          // Find the matching item by originId
          const item = items.find(i => i.originId === er.knowledge_entity_id);
          if (item) {
            evidence.push({
              itemId: item.id,
              evidenceLinkType: er.link_type,
              evidenceStatus: er.status,
              confidence: parseFloat(er.confidence ?? "0"),
              rationale: er.rationale ?? "",
              sourceCandidateId: er.nebula_candidate_id,
              sourceHarvestId: er.nebula_harvest_id,
            });
          }
        }
      }
      transformations.push("evidence_attached");
    }

    // ── Phase 5: shape_for_requester ──────────────────────────────
    const hasContradictions = evidence.some(e => e.evidenceLinkType === "contradicts");
    // Filter contradiction evidence from results unless explicitly requested
    if (!constraints?.includeContradictions && hasContradictions) {
      const filtered = evidence.filter(e => e.evidenceLinkType !== "contradicts");
      evidence.length = 0;
      evidence.push(...filtered);
      transformations.push("contradictions_filtered");
    }

    // Apply minConfidence filter
    const minConf = query.minConfidence ?? 0;
    items = items.filter(i => i.similarity >= minConf);

    return {
      items,
      recallPlan: plan,
      evidence,
      totalFound: items.length,
      hasContradictions,
      transformations,
    };
  }
}
