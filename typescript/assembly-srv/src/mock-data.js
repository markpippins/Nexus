const now = new Date();
const daysA = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

export const users = [
  { id: 'usr-1', alias: 'Alice Chen', avatar_url: '' },
  { id: 'usr-2', alias: 'Bob Martinez', avatar_url: '' },
  { id: 'usr-3', alias: 'Carol Wu', avatar_url: '' },
  { id: 'usr-4', alias: 'Dan O\'Connor', avatar_url: '' },
];

export const forums = [
  { id: 'frm-1', slug: 'issues-and-open-questions', name: 'Issues', description: 'Blockers, questions, and unresolved concerns across the project.', expiration_dt: 'infinity' },
  { id: 'frm-2', slug: 'change-log', name: 'Change Log', description: 'Summaries of substantive changes to the system.', expiration_dt: 'infinity' },
  { id: 'frm-3', slug: 'architecture', name: 'Architecture', description: 'Design decisions, ADRs, and architectural discussions.', expiration_dt: 'infinity' },
  { id: 'frm-4', slug: 'engineering-log', name: 'Engineering Log', description: 'Day-to-day engineering notes and progress.', expiration_dt: 'infinity' },
  { id: 'frm-5', slug: 'general', name: 'General', description: 'Catch-all discussion for the team.', expiration_dt: 'infinity' },
];

export const posts = [
  { id: 'post-1', forum_uuid: 'frm-1', posted_by_id: 'usr-1', title: 'WorkRequest pipeline appears to stall on large payloads', text: 'When submitting a WorkRequest with more than 50 context keys, the conduit-mcp orchestrator seems to hang. Has anyone else seen this?', created_at: daysA(0.5) },
  { id: 'post-2', forum_uuid: 'frm-1', posted_by_id: 'usr-2', title: 'Open question: should assessments auto-resolve?', text: 'There is an open design question about whether assessments should ever auto-resolve or always require human triage.', created_at: daysA(1) },
  { id: 'post-3', forum_uuid: 'frm-2', posted_by_id: 'usr-3', title: 'Assembly UI prototype v1 landed', text: 'A new Angular-based Assembly UI is now available for review. Feedback welcome.', created_at: daysA(2) },
  { id: 'post-4', forum_uuid: 'frm-3', posted_by_id: 'usr-1', title: 'ADR-003: Database-first architecture', text: 'All agent artifacts are now canonical in PostgreSQL. Filesystem projections are regenerated on demand.', created_at: daysA(3) },
  { id: 'post-5', forum_uuid: 'frm-4', posted_by_id: 'usr-4', title: 'Refactored harvest candidate classifier', text: 'The classifier now emits structured intent records and links back to source harvests.', created_at: daysA(4) },
  { id: 'post-6', forum_uuid: 'frm-5', posted_by_id: 'usr-2', title: 'Welcome to Assembly', text: 'Assembly is the roundtable for agent-driven work orchestration.', created_at: daysA(5) },
];

export const comments = [
  { id: 'cmt-1', post_id: 'post-1', posted_by_id: 'usr-2', body: 'I reproduced this. The orchestrator times out after 30s.', parent_id: null, created_at: daysA(0.4) },
  { id: 'cmt-2', post_id: 'post-1', posted_by_id: 'usr-3', body: 'We should probably add pagination to the context payload.', parent_id: null, created_at: daysA(0.3) },
  { id: 'cmt-3', post_id: 'post-2', posted_by_id: 'usr-1', body: 'I lean toward requiring human triage for accountability.', parent_id: null, created_at: daysA(0.8) },
];

export const threadViews = [
  { thread_id: 'post-1', count: 12 },
  { thread_id: 'post-2', count: 8 },
  { thread_id: 'post-3', count: 24 },
  { thread_id: 'post-4', count: 15 },
  { thread_id: 'post-5', count: 7 },
  { thread_id: 'post-6', count: 42 },
];

export const workRequests = [
  { id: 'wrk-1', title: 'Implement role-memory refresh endpoint', description: 'Add an endpoint to refresh Redis-backed procedure cards from PostgreSQL.', source_specification_id: null, source_requirement_id: 'req-1', status: 'IN_PROGRESS', intent: 'Enable admins to sync role memory on demand.', context: { owner: 'engineer' }, constraints: { max_latency_ms: 500 }, created_by: 'Alice Chen', created_at: daysA(2), updated_at: daysA(0.5) },
  { id: 'wrk-2', title: 'Migrate harvest pipeline to conduit-mcp', description: 'Move harvest processing from ad-hoc scripts into the WorkRequest pipeline.', source_specification_id: null, source_requirement_id: null, status: 'PENDING', intent: 'Centralize orchestration.', context: {}, constraints: {}, created_by: 'Bob Martinez', created_at: daysA(5), updated_at: daysA(5) },
  { id: 'wrk-3', title: 'Add Open Question raise action to all entity views', description: 'Every top-level business object should expose a way to raise an open question linked back to it.', source_specification_id: 'spec-1', source_requirement_id: 'req-2', status: 'COMPLETED', intent: 'Improve traceability.', context: {}, constraints: {}, created_by: 'Carol Wu', created_at: daysA(8), updated_at: daysA(1) },
];

export const requirements = [
  { id: 'req-1', system_id: 'SYS-001', subsystem_id: 'SUB-001', feature_id: 'FEAT-001', title: 'Role memory refresh', description: 'Admins can refresh role memory procedure cards.', status: 'APPROVED', priority: 'HIGH', req_type: 'FUNCTIONAL', acceptance_criteria: { given: 'valid admin token', when: 'POST /refresh', then: 'Redis is updated' }, parent_id: null, candidate_id: null, conduit_plan_id: null, start_date: daysA(10), completion_date: null, created_at: daysA(10) },
  { id: 'req-2', system_id: 'SYS-001', subsystem_id: 'SUB-002', feature_id: 'FEAT-002', title: 'Open question linking', description: 'Users can raise open questions from any entity view.', status: 'APPROVED', priority: 'MEDIUM', req_type: 'FUNCTIONAL', acceptance_criteria: {}, parent_id: null, candidate_id: null, conduit_plan_id: null, start_date: daysA(8), completion_date: daysA(1), created_at: daysA(8) },
];

export const agendas = [
  { id: 'agd-1', title: 'Q3 Architecture Roadmap', scope: 'architecture', status: 'ACTIVE', cohesion_score: 0.87, source_count: 12, planner_analysis: 'High cohesion across memory and messaging domains.', planner_conflicts: {}, planner_gaps: {}, created_at: daysA(12), updated_at: daysA(2) },
  { id: 'agd-2', title: 'Harvest Pipeline Modernization', scope: 'engineering', status: 'DRAFT', cohesion_score: 0.72, source_count: 8, planner_analysis: 'Needs more detail on error handling.', planner_conflicts: {}, planner_gaps: {}, created_at: daysA(6), updated_at: daysA(6) },
];

export const candidates = [
  { id: 'cnd-1', harvest_id: 'hrv-1', title: 'Conduit plan candidate for role memory', intent_description: 'Generate a conduit plan from the role-memory refresh requirement.', implementation_notes: {}, code_snippets: {}, open_questions: {}, tags: ['conduit', 'role-memory'], status: 'REVIEW', system_id: 'SYS-001', subsystem_id: 'SUB-001', feature_id: 'FEAT-001', work_request_id: 'wrk-1', completed: false, compilation_readiness: 0.65, created_at: daysA(3), updated_at: daysA(1), harvest_source_filename: 'role_memory_docklang.json' },
  { id: 'cnd-2', harvest_id: 'hrv-2', title: 'Open question raise component', intent_description: 'Reusable component to raise open questions from entity views.', implementation_notes: {}, code_snippets: {}, open_questions: {}, tags: ['ui', 'assembly'], status: 'ACCEPTED', system_id: 'SYS-001', subsystem_id: 'SUB-002', feature_id: 'FEAT-002', work_request_id: 'wrk-3', completed: true, compilation_readiness: 0.92, created_at: daysA(4), updated_at: daysA(1), harvest_source_filename: 'open_question_docklang.json' },
];

export const harvests = [
  { id: 'hrv-1', source_path: '/docs/role_memory', source_filename: 'role_memory_docklang.json', model: 'gemini-2.5-pro', total_candidates: 4, candidates: {}, source_text: 'Harvest of role memory docs.', tags: ['role-memory'], metadata: {}, created_at: daysA(4), level: 2, visibility_scope: 'architect', docklang: {}, source_hash: 'a1b2c3', file_size: 12400, version: 1, run_metadata: {} },
  { id: 'hrv-2', source_path: '/docs/open_questions', source_filename: 'open_question_docklang.json', model: 'gemini-2.5-pro', total_candidates: 2, candidates: {}, source_text: 'Harvest of open question patterns.', tags: ['assembly'], metadata: {}, created_at: daysA(5), level: 1, visibility_scope: 'builder', docklang: {}, source_hash: 'd4e5f6', file_size: 8300, version: 1, run_metadata: {} },
];

export const conversationSnapshots = [
  { id: 'cvs-1', conversation_id: 'conv-1', snapshot_index: 1, source_hash: 'abc123', capture_mode: 'manual', block_count: 12, created_by: 'Alice Chen', created_at: daysA(1), source_filename: 'conversation_1.json' },
  { id: 'cvs-2', conversation_id: 'conv-2', snapshot_index: 1, source_hash: 'def456', capture_mode: 'auto', block_count: 8, created_by: 'Bob Martinez', created_at: daysA(2), source_filename: 'conversation_2.json' },
];

export const openQuestions = [
  { id: 'oq-1', requirement_id: 'req-1', candidate_id: null, title: 'Should role-memory refresh be synchronous?', description: 'Debate over whether the refresh endpoint should block until complete.', category: 'design', status: 'OPEN', blocking: true, resolution: null, created_by: 'Alice Chen', created_at: daysA(2), resolved_at: null },
  { id: 'oq-2', requirement_id: null, candidate_id: 'cnd-1', title: 'How do we handle partial compilation?', description: 'Candidates may compile some files but fail others.', category: 'engineering', status: 'OPEN', blocking: false, resolution: null, created_by: 'Carol Wu', created_at: daysA(3), resolved_at: null },
];



export const assessments = [
  { id: 'asm-1', observation_id: 'obs-1', outcome: 'ESCALATE', confidence: 0.91, impact_scope: {}, open_questions: {}, agenda_id: null, auto_resolve_plan_id: null, forum_post_id: 'post-1', analysis_detail: 'Large payload stalls require orchestrator attention.', created_at: daysA(1) },
  { id: 'asm-2', observation_id: 'obs-2', outcome: 'TRIAGE', confidence: 0.74, impact_scope: {}, open_questions: {}, agenda_id: null, auto_resolve_plan_id: null, forum_post_id: 'post-2', analysis_detail: 'Auto-resolve behavior needs human review.', created_at: daysA(2) },
];

export const observations = [
  { id: 'obs-1', trigger_type: 'metric_threshold', source_artifact_type: 'work_request', source_artifact_id: 'wrk-1', payload: { latency_ms: 4200 }, assessed: true, created_at: daysA(1) },
  { id: 'obs-2', trigger_type: 'anomaly', source_artifact_type: 'candidate', source_artifact_id: 'cnd-1', payload: { readiness_drop: 0.2 }, assessed: true, created_at: daysA(2) },
];

export const agentRecords = [
  { id: 'ar-1', record_type: 'engineering_log', role: 'engineer', title: 'Implemented role-memory refresh endpoint', content: 'Added POST /refresh and tests.', source_path: null, metadata: {}, tags: ['role-memory'], system_id: 'SYS-001', subsystem_id: 'SUB-001', feature_id: 'FEAT-001', plan_ref: null, level: 1, visibility_scope: 'builder', created_at: daysA(1) },
  { id: 'ar-2', record_type: 'architecture_note', role: 'architect', title: 'Database-first architecture rationale', content: 'Why the DB is canonical and files are projections.', source_path: null, metadata: {}, tags: ['architecture'], system_id: 'SYS-001', subsystem_id: null, feature_id: null, plan_ref: null, level: 3, visibility_scope: 'architect', created_at: daysA(5) },
];

export const reports = [...agentRecords];

export const specifications = [
  { id: 'spec-1', agenda_id: 'agd-1', revision_number: 1, revision_type: 'INITIAL', superseded_by: null, derived_from: [], item_snapshot: {}, change_summary: 'Initial specification for role-memory refresh.', valid_from: daysA(10), valid_until: 'infinity', created_at: daysA(10) },
  { id: 'spec-2', agenda_id: 'agd-2', revision_number: 1, revision_type: 'INITIAL', superseded_by: null, derived_from: [], item_snapshot: {}, change_summary: 'Initial specification for open question linking.', valid_from: daysA(8), valid_until: 'infinity', created_at: daysA(8) },
];
