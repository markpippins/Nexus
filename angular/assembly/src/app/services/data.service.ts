import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

/** Default page size used by all paginated list views and the DataService methods. */
export const DEFAULT_PAGE_SIZE = 25;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Counts {
  forums: number;
  posts: number;
  threads: number;
  comments: number;
  workRequests: number;
  requirements: number;
  agendas: number;
  candidates: number;
  harvests: number;
  openQuestions: number;
  intents: number;
  assessments: number;
  observations: number;
  agentRecords: number;
  specifications: number;
  plans: number;
}

export interface Forum {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  threadCount: number;
  postCount: number;
}

export interface Thread {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatar: string };
  forum: { id: string; slug: string; name: string };
  replyCount: number;
  viewCount: number;
  lastReplyAt: string | null;
  lastReplyAuthor: string | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  author: { id: string; name: string; avatar: string };
}

export interface FeedPost {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  comments: number;
  author: { id: string; name: string; avatar: string };
  forum: { id: string; slug: string; name: string } | null;
}

export interface WorkRequest {
  id: string;
  title: string;
  description: string | null;
  sourceSpecificationId: string | null;
  sourceRequirementId: string | null;
  status: string;
  intent: string | null;
  context: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementQuestionCounts {
  total: number;
  openCount: number;
  blockingCount: number;
}

export interface Requirement {
  id: string;
  systemId: string | null;
  subsystemId: string | null;
  featureId: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  reqType: string | null;
  acceptanceCriteria: Record<string, unknown> | null;
  parentId: string | null;
  candidateId: string | null;
  conduitPlanId: string | null;
  startDate: string | null;
  completionDate: string | null;
  createdAt: string;
  questionCounts: RequirementQuestionCounts;
}

export interface Agenda {
  id: string;
  title: string;
  scope: string | null;
  status: string;
  cohesionScore: number | null;
  sourceCount: number | null;
  plannerAnalysis: string | null;
  plannerConflicts: Record<string, unknown> | null;
  plannerGaps: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  id: string;
  harvestId: string;
  title: string;
  intentDescription: string | null;
  implementationNotes: Record<string, unknown>;
  codeSnippets: Record<string, unknown>;
  openQuestions: Record<string, unknown>;
  tags: string[];
  status: string | null;
  systemId: string | null;
  subsystemId: string | null;
  featureId: string | null;
  workRequestId: string | null;
  completed: boolean;
  compilationReadiness: number | null;
  createdAt: string;
  updatedAt: string;
  harvestSourceFilename: string | null;
}

export interface Harvest {
  id: string;
  sourcePath: string | null;
  sourceFilename: string | null;
  model: string | null;
  totalCandidates: number | null;
  candidates: Record<string, unknown> | null;
  sourceText: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  level: number | null;
  visibilityScope: string | null;
  docklang: Record<string, unknown> | null;
  sourceHash: string | null;
  fileSize: number | null;
  version: number | null;
  runMetadata: Record<string, unknown> | null;
}

export interface ConversationSnapshot {
  id: string;
  conversationId: string;
  snapshotIndex: number;
  sourceHash: string | null;
  captureMode: string | null;
  blockCount: number | null;
  createdBy: string | null;
  createdAt: string;
  sourceFilename: string | null;
}

export interface OpenQuestionAnswer {
  id: string;
  questionId: string;
  role: string;
  answer: string;
  confidence: string;
  reasoning: string | null;
  answeredAt: string;
}

export interface OpenQuestionAnswersResponse {
  answers: OpenQuestionAnswer[];
  count: number;
}

export interface OpenQuestion {
  id: string;
  requirementId: string | null;
  candidateId: string | null;
  title: string;
  description: string | null;
  category: string;
  status: string;
  blocking: boolean;
  createdBy: string | null;
  createdAt: string;
  entityType?: string | null;
  entityId?: string | null;
  entityTitle?: string | null;
  answerCount?: number;
  roleCount?: number;
  answeredBy?: string | null;
  answeredAt?: string | null;
}

export interface IntentRecord {
  id: string;
  candidateId: string | null;
  parentId: string | null;
  title: string | null;
  description: string | null;
  sourceType: string | null;
  sourceRef: string | null;
  tags: string[] | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Assessment {
  id: string;
  observationId: string;
  outcome: string;
  confidence: number | null;
  impactScope: Record<string, unknown> | null;
  openQuestions: Record<string, unknown> | null;
  agendaId: string | null;
  autoResolvePlanId: string | null;
  forumPostId: string | null;
  analysisDetail: string | null;
  createdAt: string;
}

export interface Observation {
  id: string;
  triggerType: string;
  sourceArtifactType: string | null;
  sourceArtifactId: string | null;
  payload: Record<string, unknown> | null;
  assessed: boolean;
  createdAt: string;
}

export interface AgentRecord {
  id: string;
  recordType: string | null;
  role: string | null;
  title: string | null;
  content: string | null;
  sourcePath: string | null;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
  systemId: string | null;
  subsystemId: string | null;
  featureId: string | null;
  planRef: string | null;
  level: number | null;
  visibilityScope: string | null;
  createdAt: string;
}

export interface Specification {
  id: string;
  agendaId: string;
  revisionNumber: number;
  revisionType: string;
  supersededBy: string | null;
  derivedFrom: string[] | null;
  itemSnapshot: Record<string, unknown> | null;
  changeSummary: string | null;
  validFrom: string;
  validUntil: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  fileName: string;
  title: string;
  project: string;
  goal: string;
  content: string;
  filesAffected: string;
  acceptanceCriteria: string;
  dependencies: string;
  promptRef: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpecItem {
  id: string;
  agendaId: string;
  sourceType: string | null;
  sourceId: string | null;
  title: string;
  body: string | null;
  decisions: Record<string, unknown> | null;
  openQuestions: Record<string, unknown> | null;
  supportingRefs: Record<string, unknown> | null;
  included: boolean | null;
  plannerNote: string | null;
  agendaTitle: string | null;
  agendaStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaItem {
  id: string;
  agendaId: string;
  sourceType: string;
  sourceId: string;
  title: string;
  body: string | null;
  decisions: Record<string, unknown> | null;
  openQuestions: Record<string, unknown> | null;
  supportingRefs: Record<string, unknown> | null;
  included: boolean | null;
  plannerNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationBlock {
  id: string;
  conversationId: string;
  snapshotId: string;
  blockIndex: number;
  parentTurnId: string | null;
  parentBlockId: string | null;
  blockType: string;
  contentMd: string | null;
  contentHash: string | null;
  role: string | null;
  domPath: string | null;
  domFingerprint: string | null;
  firstLineNo: number | null;
  lastLineNo: number | null;
  createdAt: string;
}

/**
 * Envelope returned by nebula-srv `GET /api/conversations/by-snapshot/:id/blocks`.
 * Mirrors `bs.listBlocks` from `nebula-srv/src/block-segmentation.service.ts`.
 * `blocks` is the only field the UI consumes; segments/overrides are surfaced
 * for completeness and ignored by this consumer.
 */
export interface ConversationBlockEnvelope {
  blocks: ConversationBlock[];
  segments: unknown[];
  overrides: unknown[];
  conversationId?: string;
  snapshotIndex?: number;
  diff?: { added: number; modified: number; removed: number; unchanged: number };
}

export interface TimelineEvent {
  type: 'created' | 'resolved' | 'status_change' | 'note';
  label: string;
  description: string | null;
  timestamp: string;
  actor: string | null;
  icon: 'Circle' | 'CheckCircle2' | 'RefreshCw' | 'FileText';
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatar: string;
  createdAt: string;
}

export interface SearchResult {
  type: string;
  id: string;
  title: string | null;
  description: string;
  href: string;
  status?: string | null;
  role?: string | null;
  recordType?: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private base = '/api';
  // Proxy for nebula-domain reads (nebula-srv :3101). The dev proxy at
  // /nebula in proxy.conf.json forwards to nebula-srv with a pathRewrite of
  // /nebula → /api. Conversation snapshot/block reads live here rather than
  // in assembly-srv because conversation_snapshots/conversation_blocks are
  // nebula-schema tables owned by nebula-srv. See Assembly Issues thread
  // 81eadf40-fb39-4767-8652-bc92c3f3a799 for the boundary decision.
  private nebula = '/nebula';

  constructor(private http: HttpClient) {}

  getCounts() {
    return this.http.get<Counts>(`${this.base}/counts`);
  }

  getForums() {
    return this.http.get<Forum[]>(`${this.base}/forums`);
  }

  getThreads(slug: string) {
    return this.http.get<Thread[]>(`${this.base}/forums/${slug}/threads`);
  }

  createForumThread(slug: string, payload: { title: string; body: string; postedById?: string }) {
    return this.http.post<{ id: string; title: string }>(`${this.base}/forums/${slug}/threads`, payload);
  }

  getThread(threadId: string) {
    return this.http.get<{ thread: Thread; comments: Comment[] }>(`${this.base}/forums/threads/${threadId}`);
  }

  getFeed() {
    return this.http.get<FeedPost[]>(`${this.base}/feed`);
  }

  getWorkRequests(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<WorkRequest>>(`${this.base}/work-requests?page=${page}&pageSize=${pageSize}`);
  }

  getWorkRequest(id: string) {
    return this.http.get<WorkRequest>(`${this.base}/work-requests/${id}`);
  }

  getRequirements(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<Requirement>>(`${this.base}/requirements?page=${page}&pageSize=${pageSize}`);
  }

  getRequirement(id: string) {
    return this.http.get<Requirement>(`${this.base}/requirements/${id}`);
  }

  getAgendas(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<Agenda>>(`${this.base}/agendas?page=${page}&pageSize=${pageSize}`);
  }

  getAgenda(id: string) {
    return this.http.get<Agenda>(`${this.base}/agendas/${id}`);
  }

  getCandidates(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<Candidate>>(`${this.base}/candidates?page=${page}&pageSize=${pageSize}`);
  }

  getCandidate(id: string) {
    return this.http.get<Candidate>(`${this.base}/candidates/${id}`);
  }

  getHarvests(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<Harvest>>(`${this.base}/harvests?page=${page}&pageSize=${pageSize}`);
  }

  getHarvest(id: string) {
    return this.http.get<Harvest>(`${this.base}/harvests/${id}`);
  }

  updateHarvest(id: string, sourceText: string) {
    return this.http.patch<{ id: string }>(`${this.base}/harvests/${id}`, { sourceText });
  }

  getConversations(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    // Reads from nebula-srv directly (see Assembly issue 81eadf40 — these
    // are nebula.conversation_snapshots rows). Same response shape as the
    // former assembly-srv route, plus an extra `source_filename` column.
    return this.http.get<Paged<ConversationSnapshot>>(`${this.nebula}/conversations?page=${page}&pageSize=${pageSize}`);
  }

  getConversation(id: string) {
    // `id` is the snapshot_id (the conversations list emits `item.id` =
    // snapshot id; assembly-ui has always routed with that value as the
    // entity handle). Hit the by-snapshot single endpoint on nebula-srv.
    return this.http.get<ConversationSnapshot>(`${this.nebula}/conversations/by-snapshot/${id}`);
  }

  getOpenQuestions(page = 1, pageSize = DEFAULT_PAGE_SIZE, requirementId?: string | null) {
    let url = `${this.base}/open-questions?page=${page}&pageSize=${pageSize}`;
    if (requirementId) {
      url += `&requirementId=${requirementId}`;
    }
    return this.http.get<Paged<OpenQuestion>>(url);
  }

  getResolvedQuestions(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<OpenQuestion>>(`${this.base}/open-questions?page=${page}&pageSize=${pageSize}&resolved=true`);
  }

  getOpenQuestionsForEntity(entityType: string, entityId: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<OpenQuestion>>(`${this.base}/open-questions?entityType=${entityType}&entityId=${entityId}&page=${page}&pageSize=${pageSize}`);
  }

  getOpenQuestion(id: string) {
    return this.http.get<OpenQuestion>(`${this.base}/open-questions/${id}`);
  }

  createOpenQuestion(payload: Partial<OpenQuestion>) {
    return this.http.post<{ id: string }>(`${this.base}/open-questions`, payload);
  }

  getIntents(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<IntentRecord>>(`${this.base}/intents?page=${page}&pageSize=${pageSize}`);
  }

  getIntent(id: string) {
    return this.http.get<IntentRecord>(`${this.base}/intents/${id}`);
  }

  getAssessments(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<Assessment>>(`${this.base}/assessments?page=${page}&pageSize=${pageSize}`);
  }

  getAssessment(id: string) {
    return this.http.get<Assessment>(`${this.base}/assessments/${id}`);
  }

  getObservations(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<Observation>>(`${this.base}/observations?page=${page}&pageSize=${pageSize}`);
  }

  getObservation(id: string) {
    return this.http.get<Observation>(`${this.base}/observations/${id}`);
  }

  getReports(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    // Reports view now uses agent-records endpoint with type filter
    // (previously /api/reports which was deleted as dead code duplicate)
    return this.http.get<Paged<AgentRecord>>(`${this.base}/agent-records?type=report&page=${page}&pageSize=${pageSize}`);
  }

  getReport(id: string) {
    return this.http.get<AgentRecord>(`${this.base}/agent-records/${id}`);
  }

  getAgentRecords(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<AgentRecord>>(`${this.base}/agent-records?page=${page}&pageSize=${pageSize}`);
  }

  getAgentRecord(id: string) {
    return this.http.get<AgentRecord>(`${this.base}/agent-records/${id}`);
  }

  getSpecifications(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<Specification>>(`${this.base}/specifications?page=${page}&pageSize=${pageSize}`);
  }

  getSpecification(id: string) {
    return this.http.get<Specification>(`${this.base}/specifications/${id}`);
  }

  getPlans(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<Plan>>(`${this.base}/plans?page=${page}&pageSize=${pageSize}`);
  }

  getPlan(id: string) {
    return this.http.get<Plan>(`${this.base}/plans/${id}`);
  }

  getSpecs(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    return this.http.get<Paged<SpecItem>>(`${this.nebula}/specs?page=${page}&pageSize=${pageSize}`);
  }

  getSpecItem(id: string) {
    return this.http.get<SpecItem>(`${this.nebula}/specs/${id}`);
  }

  getAgendaItems(agendaId: string) {
    return this.http.get<AgendaItem[]>(`${this.base}/agendas/${agendaId}/items`);
  }

  getConversationBlocks(conversationId: string) {
    // `conversationId` here is, in practice, a snapshot_id — the
    // conversations-view routes detail by `item.id` which is the snapshot
    // UUID. Hit the snapshot-keyed blocks endpoint on nebula-srv and unwrap
    // the `{ blocks, segments, overrides, conversationId, snapshotIndex }`
    // envelope to the bare `ConversationBlock[]` the consumer expects.
    return this.http
      .get<ConversationBlockEnvelope>(`${this.nebula}/conversations/by-snapshot/${conversationId}/blocks`)
      .pipe(map(envelope => envelope.blocks));
  }

  getOpenQuestionAnswers(id: string) {
    return this.http.get<OpenQuestionAnswersResponse>(`${this.base}/open-questions/${id}/answers`);
  }

  addOpenQuestionAnswer(id: string, payload: { role: string; answer: string; confidence?: string; reasoning?: string }) {
    return this.http.post<OpenQuestionAnswer>(`${this.base}/open-questions/${id}/answers`, payload);
  }

  getOpenQuestionTimeline(id: string) {
    return this.http.get<TimelineEvent[]>(`${this.base}/open-questions/${id}/timeline`);
  }

  getUsers() {
    return this.http.get<User[]>(`${this.base}/users`);
  }

  getUser(id: string) {
    return this.http.get<User>(`${this.base}/users/${id}`);
  }

  createFeedPost(payload: { text: string; postedById: string }) {
    return this.http.post<{ id: string }>(`${this.base}/feed`, payload);
  }

  deletePost(id: string) {
    return this.http.delete<{ id: string }>(`${this.base}/feed/${id}`);
  }

  createComment(threadId: string, payload: { body: string; postedById: string; parentId?: string }) {
    return this.http.post<{ id: string }>(`${this.base}/forums/threads/${threadId}/comments`, payload);
  }

  createForum(payload: { name: string; slug: string; description: string }) {
    return this.http.post<Forum>(`${this.base}/forums`, payload);
  }

  updateForum(id: string, payload: { name?: string; slug?: string; description?: string }) {
    return this.http.put<Forum>(`${this.base}/forums/${id}`, payload);
  }

  deleteForum(id: string) {
    return this.http.delete<{ id: string }>(`${this.base}/forums/${id}`);
  }

  reorderForums(orderedIds: string[]) {
    return this.http.put<{ reordered: boolean }>(`${this.base}/forums/reorder`, { orderedIds });
  }

  search(q: string) {
    return this.http.get<SearchResponse>(`${this.base}/search?q=${encodeURIComponent(q)}`);
  }
}
