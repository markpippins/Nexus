import { NebulaClient } from "./api/nebulaClient.js";

export type ReviewStatus =
  | "UNREVIEWED"
  | "NEEDS_REVIEW"
  | "UNDER_REVIEW"
  | "REVIEWED"
  | "CURRENT_FOCUS"
  | "OUTDATED"
  | "QUESTIONED"
  | "SUPERSEDED_CONFIRMED";

export type ReviewPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type AttentionReason =
  | "BLOCKING_IMPLEMENTATION"
  | "OUT_OF_DATE_WITH_RUNTIME"
  | "OUT_OF_DATE_WITH_ARCHITECTURE"
  | "CONFLICTS_WITH_OTHER_SPEC"
  | "MISSING_ACCEPTANCE_CRITERIA"
  | "AMBIGUOUS_REQUIREMENTS"
  | "DEPENDENCY_CHANGED"
  | "SUPERSEDED_BY";

export interface ReviewState {
  readonly reviewStatus: ReviewStatus;
  readonly reviewPriority: ReviewPriority;
  readonly needsAttention: boolean;
  readonly lastReviewedAt: string | null;
  readonly reviewSummary: string | null;
  readonly attentionReasons: readonly AttentionReason[];
}

export interface ReviewAnnotation {
  readonly annotationId: string;
  readonly targetArtifactId: string;
  readonly targetArtifactType: string;
  readonly annotatorRole: string;
  readonly annotationNote: string | null;
  readonly previousStatus: ReviewStatus | null;
  readonly newStatus: ReviewStatus;
  readonly annotationTimestamp: string;
}

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  "UNREVIEWED",
  "NEEDS_REVIEW",
  "UNDER_REVIEW",
  "REVIEWED",
  "CURRENT_FOCUS",
  "OUTDATED",
  "QUESTIONED",
  "SUPERSEDED_CONFIRMED",
] as const;

export const REVIEW_PRIORITIES: readonly ReviewPriority[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;

export const ATTENTION_REASONS: readonly AttentionReason[] = [
  "BLOCKING_IMPLEMENTATION",
  "OUT_OF_DATE_WITH_RUNTIME",
  "OUT_OF_DATE_WITH_ARCHITECTURE",
  "CONFLICTS_WITH_OTHER_SPEC",
  "MISSING_ACCEPTANCE_CRITERIA",
  "AMBIGUOUS_REQUIREMENTS",
  "DEPENDENCY_CHANGED",
  "SUPERSEDED_BY",
] as const;

export const DEFAULT_REVIEW_STATE: ReviewState = {
  reviewStatus: "UNREVIEWED",
  reviewPriority: "MEDIUM",
  needsAttention: false,
  lastReviewedAt: null,
  reviewSummary: null,
  attentionReasons: [],
};

const VALID_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  UNREVIEWED:           ["NEEDS_REVIEW", "UNDER_REVIEW", "CURRENT_FOCUS"],
  NEEDS_REVIEW:         ["UNDER_REVIEW", "CURRENT_FOCUS", "OUTDATED", "QUESTIONED"],
  UNDER_REVIEW:         ["REVIEWED", "OUTDATED", "QUESTIONED", "NEEDS_REVIEW"],
  REVIEWED:             ["NEEDS_REVIEW", "CURRENT_FOCUS", "OUTDATED", "QUESTIONED"],
  CURRENT_FOCUS:        ["REVIEWED", "OUTDATED", "QUESTIONED", "NEEDS_REVIEW"],
  OUTDATED:             ["NEEDS_REVIEW", "UNDER_REVIEW", "SUPERSEDED_CONFIRMED"],
  QUESTIONED:           ["UNDER_REVIEW", "NEEDS_REVIEW", "OUTDATED", "SUPERSEDED_CONFIRMED", "REVIEWED"],
  SUPERSEDED_CONFIRMED: [],
};

export function isValidReviewTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function requiresAttention(status: ReviewStatus, reasons: readonly AttentionReason[]): boolean {
  if (reasons.length > 0) return true;
  return status === "NEEDS_REVIEW" || status === "QUESTIONED" || status === "OUTDATED";
}

export function buildReviewState(
  status: ReviewStatus,
  priority: ReviewPriority,
  reasons: readonly AttentionReason[],
  summary: string | null,
  lastReviewedAt: string | null,
): ReviewState {
  return {
    reviewStatus: status,
    reviewPriority: priority,
    needsAttention: requiresAttention(status, reasons),
    lastReviewedAt,
    reviewSummary: summary,
    attentionReasons: reasons,
  };
}

export async function getArtifactReviewState(artifactId: string): Promise<ReviewState> {
  const result = await NebulaClient.getReviewState(artifactId);
  if (!result || result.error) return DEFAULT_REVIEW_STATE;
  return {
    reviewStatus: result.reviewStatus ?? "UNREVIEWED",
    reviewPriority: result.reviewPriority ?? "MEDIUM",
    needsAttention: result.needsAttention ?? false,
    lastReviewedAt: result.lastReviewedAt ?? null,
    reviewSummary: result.reviewSummary ?? null,
    attentionReasons: result.attentionReasons ?? [],
  };
}

export async function setArtifactReviewState(
  artifactId: string,
  state: ReviewState,
  annotatorRole: string,
  annotationNote?: string,
): Promise<ReviewAnnotation> {
  const current = await getArtifactReviewState(artifactId);
  return NebulaClient.setReviewState(artifactId, {
    reviewStatus: state.reviewStatus,
    reviewPriority: state.reviewPriority,
    needsAttention: state.needsAttention,
    lastReviewedAt: state.lastReviewedAt,
    reviewSummary: state.reviewSummary,
    attentionReasons: [...state.attentionReasons],
    annotatorRole,
    annotationNote: annotationNote ?? null,
    previousStatus: current.reviewStatus,
  });
}

export async function transitionReviewState(
  artifactId: string,
  newStatus: ReviewStatus,
  annotatorRole: string,
  priority?: ReviewPriority,
  reasons?: readonly AttentionReason[],
  summary?: string,
  annotationNote?: string,
): Promise<{ state: ReviewState; annotation: ReviewAnnotation }> {
  const current = await getArtifactReviewState(artifactId);
  if (!isValidReviewTransition(current.reviewStatus, newStatus)) {
    throw new Error(
      `Invalid review transition: ${current.reviewStatus} → ${newStatus}`
    );
  }
  const resolvedReasons = reasons ?? current.attentionReasons;
  const resolvedPriority = priority ?? current.reviewPriority;
  const now = new Date().toISOString();
  const state = buildReviewState(
    newStatus,
    resolvedPriority,
    resolvedReasons,
    summary ?? current.reviewSummary,
    now,
  );
  const annotation = await setArtifactReviewState(artifactId, state, annotatorRole, annotationNote);
  return { state, annotation };
}

export async function listReviewAnnotations(
  artifactId: string,
  query?: { limit?: number; offset?: number },
): Promise<ReviewAnnotation[]> {
  return NebulaClient.listReviewAnnotations(artifactId, query);
}

export async function bulkSetReviewState(
  artifactIds: string[],
  state: ReviewState,
  annotatorRole: string,
): Promise<{ updated: number }> {
  return NebulaClient.bulkSetReviewState({
    artifactIds,
    reviewStatus: state.reviewStatus,
    reviewPriority: state.reviewPriority,
    needsAttention: state.needsAttention,
    lastReviewedAt: state.lastReviewedAt,
    reviewSummary: state.reviewSummary,
    attentionReasons: [...state.attentionReasons],
    annotatorRole,
  });
}
