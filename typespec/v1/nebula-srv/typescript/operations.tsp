/**
 * nebula-srv — TypeSpec Operations
 *
 * Representative operations for the 15+ entity groups. Query
 * parameters (limit/offset/status/search/systemId etc.) are
 * documented in prose; the complete API surfaces ~200 routes.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.nebulasrv {

  @route("/health")
  @get op health(): HealthResponse;

  // ── Systems ───────────────────────────────────────────────────
  @route("/systems")       @get  op listSystems(): PaginatedResult & { items: System[] };
  @route("/systems/{id}")  @get  op getSystem(@path id: string): System | ErrorDetail;
  @route("/systems")       @post op createSystem(@body body: System): System;
  @route("/systems/{id}")  @patch op updateSystem(@path id: string, @body body: System): System;
  @route("/systems/{id}")  @delete op deleteSystem(@path id: string): { deleted: string };

  // ── Subsystems ────────────────────────────────────────────────
  @route("/subsystems")      @get  op listSubsystems(): PaginatedResult & { items: Subsystem[] };
  @route("/subsystems/{id}") @get  op getSubsystem(@path id: string): Subsystem;
  @route("/subsystems")      @post op createSubsystem(@body body: Subsystem): Subsystem;

  // ── Features ──────────────────────────────────────────────────
  @route("/features")      @get  op listFeatures(): PaginatedResult & { items: Feature[] };
  @route("/features/{id}") @get  op getFeature(@path id: string): Feature;
  @route("/features")      @post op createFeature(@body body: Feature): Feature;

  // ── Requirements ──────────────────────────────────────────────
  @route("/requirements")              @get  op listRequirements(): PaginatedResult & { items: Requirement[] };
  @route("/requirements/{id}")         @get  op getRequirement(@path id: string): Requirement;
  @route("/requirements")              @post op createRequirement(@body body: Requirement): Requirement;
  @route("/requirements/{id}")         @patch op updateRequirement(@path id: string, @body body: Requirement): Requirement;
  @route("/requirements/{id}/children") @get  op requirementChildren(@path id: string): { items: Requirement[] };
  @route("/requirements/{id}/dependencies") @get op requirementDeps(@path id: string): { items: Requirement[] };
  @route("/requirements/{id}/compile") @post op compileRequirement(@path id: string, @body body: unknown): unknown;

  // ── Sessions ──────────────────────────────────────────────────
  @route("/sessions")      @get  op listSessions(): PaginatedResult & { items: Session[] };
  @route("/sessions")      @post op createSession(@body body: Session): Session;

  // ── Workspaces ─────────────────────────────────────────────────
  @route("/workspaces")      @get  op listWorkspaces(): { items: Workspace[] };
  @route("/workspaces")      @post op createWorkspace(@body body: Workspace): Workspace;

  // ── Implementation Plans ──────────────────────────────────────
  @route("/plans")     @get  op listPlans(): PaginatedResult & { items: ImplementationPlan[] };
  @route("/plans/{id}") @get  op getPlan(@path id: string): ImplementationPlan;
  @route("/plans")     @post op createPlan(@body body: ImplementationPlan): ImplementationPlan;
  @route("/plans/statuses") @get op planStatuses(): { statuses: PlanStatus[] };

  // ── Agent Records (audit trail) ───────────────────────────────
  @route("/agent-records")     @get op listAgentRecords(): PaginatedResult & { items: AgentRecord[] };
  @route("/agent-records/{id}") @get op getAgentRecord(@path id: string): AgentRecord;
  @route("/agent-records")     @post op createAgentRecord(@body body: AgentRecord): AgentRecord;

  // ── Harvest Candidates ────────────────────────────────────────
  @route("/harvest-candidates")       @get op listCandidates(): PaginatedResult & { items: HarvestCandidate[] };
  @route("/harvest-candidates/{id}")  @get op getCandidate(@path id: string): HarvestCandidate;
  @route("/harvest-candidates/{id}/spawn-requirement") @post op spawnRequirement(@path id: string, @body body: unknown): Requirement;

  // ── CPF (Candidate Promotion Flow) ────────────────────────────
  @route("/cpf")        @get  op listCpf(): { items: CpfItem[] };
  @route("/cpf/count")  @get  op cpfCount(): { count: int32 };
  @route("/cpf/promote") @post op promoteCpf(@body body: unknown): unknown;

  // ── Open Questions ────────────────────────────────────────────
  @route("/open-questions")            @get op listOpenQuestions(): PaginatedResult & { items: OpenQuestion[] };
  @route("/open-questions/{id}")       @get op getOpenQuestion(@path id: string): OpenQuestion;
  @route("/open-questions")            @post op createOpenQuestion(@body body: OpenQuestion): OpenQuestion;
  @route("/open-questions/{id}/answer") @put op answerQuestion(@path id: string, @body body: QuestionAnswer): QuestionAnswer;
  @route("/open-questions/{id}/timeline") @get op questionTimeline(@path id: string): { items: unknown[] };

  // ── Roles ─────────────────────────────────────────────────────
  @route("/roles")        @get  op listRoles(): { items: Role[] };
  @route("/roles/drift")  @get  op roleDrift(): { items: RoleDrift[] };
  @route("/roles/{id}")   @get  op getRole(@path id: string): Role;
  @route("/roles")        @post op createRole(@body body: Role): Role;

  // ── Architect Specs ───────────────────────────────────────────
  @route("/architect-specs")     @get  op listSpecs(): { items: ArchitectSpec[] };
  @route("/architect-specs/{id}") @get  op getSpec(@path id: string): ArchitectSpec;
  @route("/architect-specs")     @post op createSpec(@body body: ArchitectSpec): ArchitectSpec;

  // ── Assessments / Observations ────────────────────────────────
  @route("/assessments")    @get op listAssessments(): { items: Assessment[] };
  @route("/observations")   @get op listObservations(): { items: Observation[] };

  // ── Search ────────────────────────────────────────────────────
  @route("/search")          @get  op search(): { items: unknown[]; total: int32 };
  @route("/search/semantic") @post op semanticSearch(@body body: { query: string; limit?: int32 }): { hits: SemanticSearchHit[] };

  // ── Counts / Inventory / Provenance ───────────────────────────
  @route("/counts")  @get op counts(): Counts;
  @route("/inventory") @get op inventory(): { items: InventoryItem[] };
  @route("/artifact-provenance") @get  op listProvenance(): { items: ArtifactProvenance[] };
  @route("/artifact-provenance") @post op createProvenance(@body body: ArtifactProvenance): ArtifactProvenance;

  // ── External IDs ──────────────────────────────────────────────
  @route("/external-ids") @get op listExternalIds(): { items: ExternalId[] };
  @route("/systems/{id}/external-ids") @post op createExternalId(@path id: string, @body body: ExternalId): ExternalId;

  // ── Audit graph ───────────────────────────────────────────────
  @route("/audit")       @get op listAudit(): PaginatedResult & { items: AgentRecord[] };
  @route("/audit/graph") @get op auditGraph(): AuditGraph;
}