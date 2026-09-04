// Shared helpers for formatting SonarQube API payloads as tool output.

export function json(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function briefIssue(i: any): Record<string, unknown> {
  return {
    key: i.key,
    rule: i.rule,
    severity: i.severity,
    type: i.type,
    component: i.component,
    line: i.line,
    message: i.message,
    status: i.status,
    resolution: i.resolution ?? undefined,
    effort: i.effort ?? undefined,
    tags: i.tags,
    creationDate: i.creationDate,
    updateDate: i.updateDate,
  };
}

export function briefHotspot(h: any): Record<string, unknown> {
  return {
    key: h.key,
    ruleKey: h.ruleKey,
    vulnerabilityProbability: h.vulnerabilityProbability,
    component: h.component,
    line: h.line,
    message: h.message,
    status: h.status,
    resolution: h.resolution ?? undefined,
    creationDate: h.creationDate,
  };
}
