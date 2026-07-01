import type { ReviewState, ReviewStatus, ReviewPriority, AttentionReason } from "./review-service.js";

export interface ReviewFilterable {
  readonly reviewState?: ReviewState;
}

export type AgentRole = "builder" | "inspector" | "planner" | "reviewer" | "architect";

export interface QueryFilterResult<T> {
  readonly included: readonly T[];
  readonly excluded: readonly T[];
  readonly boosted: readonly T[];
}

const EXCLUDED_STATUSES_BY_ROLE: Record<AgentRole, readonly ReviewStatus[]> = {
  builder:    ["OUTDATED", "SUPERSEDED_CONFIRMED"],
  inspector:  [],
  planner:    ["SUPERSEDED_CONFIRMED"],
  reviewer:   ["SUPERSEDED_CONFIRMED"],
  architect:  [],
};

const BOOSTED_STATUSES_BY_ROLE: Record<AgentRole, readonly ReviewStatus[]> = {
  builder:    ["CURRENT_FOCUS"],
  inspector:  ["QUESTIONED", "NEEDS_REVIEW", "CURRENT_FOCUS"],
  planner:    ["NEEDS_REVIEW", "QUESTIONED"],
  reviewer:   ["NEEDS_REVIEW", "UNDER_REVIEW"],
  architect:  ["QUESTIONED", "OUTDATED"],
};

const PRIORITY_ORDER: Record<ReviewPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function shouldExcludeForRole(status: ReviewStatus, role: AgentRole): boolean {
  return EXCLUDED_STATUSES_BY_ROLE[role]?.includes(status) ?? false;
}

export function shouldBoostForRole(status: ReviewStatus, role: AgentRole): boolean {
  return BOOSTED_STATUSES_BY_ROLE[role]?.includes(status) ?? false;
}

export function filterByReviewState<T extends ReviewFilterable>(
  items: readonly T[],
  role: AgentRole,
): QueryFilterResult<T> {
  const included: T[] = [];
  const excluded: T[] = [];
  const boosted: T[] = [];

  for (const item of items) {
    const status = item.reviewState?.reviewStatus ?? "UNREVIEWED";
    if (shouldExcludeForRole(status, role)) {
      excluded.push(item);
    } else {
      included.push(item);
      if (shouldBoostForRole(status, role)) {
        boosted.push(item);
      }
    }
  }

  return { included, excluded, boosted };
}

export function sortByReviewPriority<T extends ReviewFilterable>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const pa = a.reviewState?.reviewPriority ?? "MEDIUM";
    const pb = b.reviewState?.reviewPriority ?? "MEDIUM";
    return PRIORITY_ORDER[pa] - PRIORITY_ORDER[pb];
  });
}

export function filterByAttentionReason<T extends ReviewFilterable>(
  items: readonly T[],
  reason: AttentionReason,
): T[] {
  return items.filter(
    (item) => item.reviewState?.attentionReasons?.includes(reason) ?? false
  );
}

export function filterByReviewStatus<T extends ReviewFilterable>(
  items: readonly T[],
  statuses: readonly ReviewStatus[],
): T[] {
  return items.filter(
    (item) => statuses.includes(item.reviewState?.reviewStatus ?? "UNREVIEWED")
  );
}

export function filterNeedsAttention<T extends ReviewFilterable>(
  items: readonly T[],
): T[] {
  return items.filter(
    (item) => item.reviewState?.needsAttention ?? false
  );
}

export function applyBuilderFilter<T extends ReviewFilterable>(
  items: readonly T[],
): QueryFilterResult<T> {
  const result = filterByReviewState(items, "builder");
  return {
    ...result,
    included: sortByReviewPriority(result.included),
  };
}

export function applyInspectorFilter<T extends ReviewFilterable>(
  items: readonly T[],
): QueryFilterResult<T> {
  const result = filterByReviewState(items, "inspector");
  return {
    ...result,
    included: sortByReviewPriority(result.included),
    boosted: sortByReviewPriority(result.boosted),
  };
}

export function applyRoleFilter<T extends ReviewFilterable>(
  items: readonly T[],
  role: AgentRole,
): QueryFilterResult<T> {
  const result = filterByReviewState(items, role);
  return {
    ...result,
    included: sortByReviewPriority(result.included),
    boosted: sortByReviewPriority(result.boosted),
  };
}
