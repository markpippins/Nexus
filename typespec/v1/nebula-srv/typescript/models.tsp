/**
 * nebula-srv — TypeSpec Models
 *
 * Reverse-engineered from typescript/nebula-srv/src/routes.ts
 * and the `nebula` schema DDL. Covers the major entity groups;
 * individual route response shapes may carry additional fields
 * derived from JOINs (e.g. requirement responses include child
 * counts, question counts).
 */
namespace org.nexus.nebulasrv {

  // ── Core entity shapes ────────────────────────────────────────

  model System {
    id: string;
    name: string;
    description?: string;
    kind?: string;
    parentId?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  model Subsystem {
    id: string;
    name: string;
    description?: string;
    systemId: string;
    parentId?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  model Feature {
    id: string;
    name: string;
    description?: string;
    subsystemId?: string;
    systemId?: string;
    status?: string;
    priority?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  model Requirement {
    id: string;
    title: string;
    description?: string;
    systemId?: string;
    subsystemId?: string;
    featureId?: string;
    status?: string;
    priority?: string;
    candidateId?: string;
    planRef?: string;
    dependencies?: string[];
    childCount?: int32;
    questionCount?: int32;
    createdAt?: string;
    updatedAt?: string;
  }

  model Session {
    id: string;
    role: string;
    modelId?: string;
    channel?: string;
    status?: string;
    startedAt?: string;
    endedAt?: string;
    createdAt?: string;
  }

  model Workspace {
    id: string;
    name: string;
    description?: string;
    createdAt?: string;
  }

  // ── Planning ──────────────────────────────────────────────────

  model ImplementationPlan {
    id: string;
    number: string;
    title: string;
    goal?: string;
    status?: string;
    createdAt?: string;
  }

  model PlanStatus {
    status: string;
    count: int32;
  }

  // ── Agent records (audit trail) ───────────────────────────────

  model AgentRecord {
    id: string;
    recordType: string;
    role: string;
    title: string;
    content: string;
    sourcePath?: string;
    agentMetadata?: unknown;
    tags: string[];
    systemId?: string;
    subsystemId?: string;
    featureId?: string;
    planRef?: string;
    candidateId?: string;
    requirementId?: string;
    level: int32;
    visibilityScope: string;
    modelId?: string;
    createdAt: string;
  }

  // ── Harvest pipeline ──────────────────────────────────────────

  model HarvestCandidate {
    id: string;
    title: string;
    description?: string;
    compilationReadiness?: float64;
    systemName?: string;
    subsystemName?: string;
    status?: string;
    systemId?: string;
    subsystemId?: string;
    createdAt?: string;
  }

  model CpfItem {
    id: string;
    entityId: string;
    entityType: string;
    source?: string;
    createdAt?: string;
  }

  // ── Open Questions ────────────────────────────────────────────

  model OpenQuestion {
    id: string;
    title: string;
    body?: string;
    status?: string;
    askedBy?: string;
    createdAt?: string;
  }

  model QuestionAnswer {
    id: string;
    body: string;
    answeredBy?: string;
    createdAt?: string;
  }

  // ── Roles ─────────────────────────────────────────────────────

  model Role {
    id: string;
    name: string;
    description?: string;
    createdAt?: string;
  }

  model RoleDrift {
    id: string;
    name: string;
    expectedCount: int32;
    actualCount: int32;
    driftDirection?: string;
  }

  // ── Architect specs ───────────────────────────────────────────

  model ArchitectSpec {
    id: string;
    title: string;
    body?: string;
    systemId?: string;
    requirementId?: string;
    createdAt?: string;
  }

  // ── Assessments / Observations ────────────────────────────────

  model Assessment {
    id: string;
    title: string;
    body?: string;
    status?: string;
    createdAt?: string;
  }

  model Observation {
    id: string;
    entityId: string;
    entityType: string;
    value: unknown;
    createdAt?: string;
  }

  // ── Docs / Inventory ──────────────────────────────────────────

  model DocEntry {
    id: string;
    title: string;
    path?: string;
    systemId?: string;
    subsystemId?: string;
    createdAt?: string;
  }

  model InventoryItem {
    id: string;
    entityType: string;
    entityId: string;
    name: string;
    systemName?: string;
    subsystemName?: string;
  }

  // ── Semantic search ───────────────────────────────────────────

  model SemanticSearchHit {
    id: string;
    entityType: string;
    title: string;
    snippet: string;
    score: float64;
  }

  // ── Provenance / External IDs ─────────────────────────────────

  model ArtifactProvenance {
    id: string;
    source: string;
    artifactType: string;
    artifactId: string;
    metadata?: unknown;
    createdAt?: string;
  }

  model ExternalId {
    id: string;
    systemId: string;
    externalSystem: string;
    externalId: string;
    label?: string;
  }

  // ── Envelopes ─────────────────────────────────────────────────

  model PaginatedResult {
    total: int32;
    limit: int32;
    offset: int32;
  }

  model Counts {
    systems: int32;
    subsystems: int32;
    features: int32;
    requirements: int32;
    sessions: int32;
    openQuestions: int32;
    agentRecords: int32;
  }

  model GraphEdge {
    source: string;
    target: string;
    label: string;
    weight?: float64;
  }

  model AuditGraph {
    nodes: { id: string; label: string; type: string }[];
    edges: GraphEdge[];
  }

  model ErrorDetail {
    error: string;
  }

  model HealthResponse {
    status: string;
    timestamp: string;
    dbConnected: boolean;
  }
}