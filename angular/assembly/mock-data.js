const now = new Date().toISOString();

const author = {
  id: 'mock-user-001',
  name: 'You (Mock)',
  avatar: 'Y',
};

const forums = [
  {
    id: 'mock-forum-issues',
    slug: 'issues-and-open-questions',
    name: 'Issues & Open Questions',
    description: 'Questions, blockers, and unresolved decisions for the Nexus team.',
    sortOrder: 1,
    threadCount: 3,
    postCount: 7,
  },
  {
    id: 'mock-forum-change-log',
    slug: 'change-log',
    name: 'Change Log',
    description: 'Implementation updates and operational notes from the engineering team.',
    sortOrder: 2,
    threadCount: 2,
    postCount: 4,
  },
  {
    id: 'mock-forum-architecture',
    slug: 'architecture',
    name: 'Architecture',
    description: 'Design decisions, trade-offs, and system direction.',
    sortOrder: 3,
    threadCount: 2,
    postCount: 5,
  },
];

const threadFor = (id, forum, title, body, replyCount = 0) => ({
  id,
  title,
  body,
  createdAt: now,
  author,
  forum: { id: forum.id, slug: forum.slug, name: forum.name },
  replyCount,
  viewCount: 12,
  lastReplyAt: replyCount ? now : null,
  lastReplyAuthor: replyCount ? 'Engineer' : null,
});

const threads = [
  threadFor('mock-thread-bootstrap', forums[0], 'How should the Assembly workspace handle offline refinement?', 'This mock workspace keeps the Assembly UI usable while backend services are unavailable.', 2),
  threadFor('mock-thread-schema', forums[0], 'Open question: canonical source for conversation blocks', 'The UI currently reads conversation blocks from the Nebula service boundary.', 1),
  threadFor('mock-thread-health', forums[0], 'Assembly UI health check is degraded in preview', 'Preview mode should report its local mock service as healthy.', 0),
  threadFor('mock-thread-release', forums[1], 'Assembly mock mode is ready for UI iteration', 'The UI can now be refined without starting the Nexus backend stack.', 1),
  threadFor('mock-thread-routing', forums[1], 'Keep live API routes unchanged', 'Live mode continues to proxy /api and /nebula to the existing services.', 0),
  threadFor('mock-thread-layout', forums[2], 'Compact layout direction for Assembly', 'Favor dense information hierarchy while keeping interaction states discoverable.', 3),
  threadFor('mock-thread-boundary', forums[2], 'Separate runtime mode from Angular components', 'The mode boundary belongs in the local server so UI code keeps its production contracts.', 0),
];

const comments = [
  { id: 'mock-comment-1', threadId: 'mock-thread-bootstrap', body: 'Use the mock server as the local contract, then refine the components against it.', createdAt: now, parentId: null, author: { id: 'mock-engineer', name: 'Engineer', avatar: 'E' } },
  { id: 'mock-comment-2', threadId: 'mock-thread-bootstrap', body: 'Agreed. The live proxy should remain untouched for terrain-backed development.', createdAt: now, parentId: null, author: { id: 'mock-architect', name: 'Architect', avatar: 'A' } },
];

const item = (id, title, description, extra = {}) => ({
  id,
  title,
  description,
  status: 'active',
  createdAt: now,
  updatedAt: now,
  ...extra,
});

const workRequests = [
  item('mock-wr-001', 'Create an offline Assembly refinement workspace', 'Provide a local mock mode for UI development without Nexus backend services.', { intent: 'offline UI refinement', sourceSpecificationId: null, sourceRequirementId: null, context: {}, constraints: {}, createdBy: 'Engineer' }),
  item('mock-wr-002', 'Audit Assembly API response contracts', 'Review list and detail response shapes against assembly-srv.', { intent: 'contract verification', sourceSpecificationId: null, sourceRequirementId: null, context: {}, constraints: {}, createdBy: 'Architect' }),
];

const requirements = [
  item('mock-req-001', 'Assembly must run without backend services', 'Mock mode serves representative data and supports local UI interactions.', { systemId: null, subsystemId: null, featureId: null, priority: 'high', reqType: 'functional', acceptanceCriteria: { offline: true }, parentId: null, candidateId: null, conduitPlanId: null, startDate: now, completionDate: null, questionCounts: { total: 1, openCount: 1, blockingCount: 0 } }),
  item('mock-req-002', 'Live mode must preserve terrain integration', 'Live mode stays on the terrain-designated port and proxies the current API paths.', { systemId: null, subsystemId: null, featureId: null, priority: 'high', reqType: 'functional', acceptanceCriteria: { live: true }, parentId: null, candidateId: null, conduitPlanId: null, startDate: now, completionDate: null, questionCounts: { total: 0, openCount: 0, blockingCount: 0 } }),
];

const agendas = [
  item('mock-agenda-001', 'Assembly offline workspace', 'Decide how the UI can evolve independently of backend availability.', { scope: 'Assembly UI', cohesionScore: 0.94, sourceCount: 3, plannerAnalysis: 'Use a local Express mock server and preserve the live service boundary.', plannerConflicts: {}, plannerGaps: {} }),
];

const candidates = [
  item('mock-candidate-001', 'Add environment-controlled Assembly mock mode', 'Mirror the proven Tackle UI runtime mode pattern.', { harvestId: 'mock-harvest-001', intentDescription: 'Make Assembly portable to a backend-free UI workspace.', implementationNotes: {}, codeSnippets: {}, openQuestions: {}, tags: ['ui', 'mock-mode'], status: 'ready', systemId: null, subsystemId: null, featureId: null, workRequestId: 'mock-wr-001', completed: false, compilationReadiness: 0.9, harvestSourceFilename: 'assembly-bootstrap.md' }),
];

const harvests = [
  item('mock-harvest-001', 'Assembly bootstrap findings', 'Captured requirements for making Assembly portable.', { sourcePath: 'mock://assembly-bootstrap', sourceFilename: 'assembly-bootstrap.md', model: 'mock', totalCandidates: 1, candidates: {}, sourceText: 'Assembly needs a backend-free refinement mode.', tags: ['assembly', 'mock'], metadata: {}, level: 1, visibilityScope: 'all', docklang: {}, sourceHash: 'mock-hash', fileSize: 48, version: 1, runMetadata: {} }),
];

const conversations = [
  item('mock-conversation-001', 'Assembly mock-mode design conversation', 'A representative conversation snapshot for detail-view refinement.', { conversationId: 'mock-conversation-001', snapshotIndex: 1, sourceHash: 'mock-conversation-hash', captureMode: 'mock', blockCount: 3, createdBy: 'Engineer', sourceFilename: 'assembly-bootstrap.md' }),
];

const openQuestions = [
  item('mock-question-001', 'Should mock writes persist across refresh?', 'Mock writes currently live for the duration of the local server process.', { requirementId: 'mock-req-001', candidateId: 'mock-candidate-001', category: 'DESIGN', blocking: false, createdBy: 'Engineer', entityType: 'requirement', entityId: 'mock-req-001', entityTitle: requirements[0].title, answerCount: 1, roleCount: 1, answeredBy: 'Architect', answeredAt: now }),
  item('mock-question-002', 'Which backend owns conversation blocks?', 'The live UI reads these from the Nebula service boundary.', { requirementId: null, candidateId: null, category: 'MISSING_INFO', blocking: false, createdBy: 'Architect', entityType: 'conversation', entityId: 'mock-conversation-001', entityTitle: conversations[0].title, answerCount: 0, roleCount: 0, answeredBy: null, answeredAt: null }),
];

const intents = [item('mock-intent-001', 'Portable Assembly UI', 'The interface should be refinable with no backend dependency.', { candidateId: 'mock-candidate-001', parentId: null, sourceType: 'mock', sourceRef: 'assembly-bootstrap', tags: ['offline', 'ui'], metadata: {} })];
const assessments = [item('mock-assessment-001', 'Mock boundary is viable', 'A local API-compatible server minimizes component changes.', { observationId: 'mock-observation-001', outcome: 'accepted', confidence: 0.95, impactScope: { ui: 'high' }, openQuestions: {}, agendaId: 'mock-agenda-001', autoResolvePlanId: null, forumPostId: 'mock-thread-release', analysisDetail: 'Use server-side fixtures and preserve live proxy behavior.' })];
const observations = [item('mock-observation-001', 'Assembly backend unavailable', 'The UI workspace intentionally runs without Nexus services.', { triggerType: 'workspace', sourceArtifactType: 'environment', sourceArtifactId: 'mock', payload: { mode: 'mock' }, assessed: true })];
const records = [item('mock-record-001', 'Assembly mock mode implementation', 'The UI can now be served locally with representative Assembly data.', { recordType: 'engineering_log', role: 'engineer', content: 'Mock mode is available for offline UI refinement.', sourcePath: null, metadata: {}, tags: ['assembly', 'mock-mode'], systemId: null, subsystemId: null, featureId: null, planRef: null, level: 1, visibilityScope: 'all' })];
const specifications = [item('mock-spec-001', 'Assembly workspace specification', 'A small local workspace that keeps Assembly interactions available offline.', { agendaId: 'mock-agenda-001', revisionNumber: 1, revisionType: 'initial', supersededBy: null, derivedFrom: [], itemSnapshot: {}, changeSummary: 'Initial mock workspace contract.', validFrom: now, validUntil: '9999-12-31T23:59:59.999Z' })];
const specs = [item('mock-spec-item-001', 'Mode selection', 'The .env file selects mock or live mode.', { agendaId: 'mock-agenda-001', sourceType: 'requirement', sourceId: 'mock-req-001', body: 'ASSEMBLY_MODE=mock binds port 3000.', decisions: {}, openQuestions: {}, supportingRefs: {}, included: true, plannerNote: null, agendaTitle: agendas[0].title, agendaStatus: 'active' })];
const plans = [item('mock-plan-001', 'Assembly mock mode', 'Add a local API-compatible mock server.', { fileName: 'mock-assembly.md', project: 'assembly', goal: 'Enable backend-free UI refinement.', content: 'Run mock mode on port 3000.', filesAffected: 'server.js, mock-data.js', acceptanceCriteria: 'UI loads without backend.', dependencies: 'Node.js', promptRef: 'mock', status: 'active' })];
const users = [
  { ...author, id: '9abe1316-312e-4a2f-96ad-88c4b86c7b1e', name: 'You (Mock)' },
  { id: 'mock-engineer', name: 'Engineer', email: 'engineer@mock.local', avatar: 'E', createdAt: now },
  { id: 'mock-architect', name: 'Architect', email: 'architect@mock.local', avatar: 'A', createdAt: now },
];
const feed = threads.slice(0, 4).map((thread, index) => ({ id: `mock-feed-${index + 1}`, title: thread.title, content: thread.body, createdAt: thread.createdAt, comments: thread.replyCount, author: thread.author, forum: thread.forum }));

export const state = {
  forums,
  threads,
  comments,
  feed,
  workRequests,
  requirements,
  agendas,
  candidates,
  harvests,
  conversations,
  openQuestions,
  intents,
  assessments,
  observations,
  records,
  specifications,
  specs,
  plans,
  users,
};

export const nowIso = () => new Date().toISOString();
export const newId = (prefix) => `mock-${prefix}-${Date.now().toString(36)}`;

export function allEntityCollections() {
  return {
    'work-requests': state.workRequests,
    requirements: state.requirements,
    agendas: state.agendas,
    candidates: state.candidates,
    harvests: state.harvests,
    conversations: state.conversations,
    'open-questions': state.openQuestions,
    intents: state.intents,
    assessments: state.assessments,
    observations: state.observations,
    reports: state.records,
    'agent-records': state.records,
    specifications: state.specifications,
    specs: state.specs,
    plans: state.plans,
  };
}
