const ENTITY_ROUTE_MAP: Record<string, string> = {
  work_request: 'work-requests',
  requirement: 'requirements',
  agenda: 'agendas',
  candidate: 'candidates',
  harvest: 'harvests',
  conversation: 'conversations',
  intent_record: 'intents',
  assessment: 'assessments',
  observation: 'observations',
  report: 'reports',
  agent_record: 'agent-records',
  agent: 'agents',
  specification: 'specifications',
  open_question: 'open-questions',
  open_questions: 'open-questions',
  forum: 'forums',
  plan: 'plans',
};

export function entityRouteForType(type: string | null): string | null {
  if (!type) return null;
  return ENTITY_ROUTE_MAP[type] || type.replace(/_/g, '-');
}

export function formatEntityType(type: string | null): string {
  if (!type) return 'Unknown';
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
