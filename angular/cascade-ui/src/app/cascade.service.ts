import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API = 'http://localhost:3106/cascade';

export interface CascadeEvent {
  event_id: string;
  event_type: string;
  source: string;
  event_timestamp: string;
  payload: { title?: string; harvest_id?: string; cpf?: any };
  aggregate_type: string;
  aggregate_id: string;
  actor_type: string;
  actor_id: string;
  correlation_id: string | null;
  causation_id: string | null;
  caused_by_event_type: string | null;
  sequence_number: string;
  received_at: string;
}

export interface EventsResponse {
  events: CascadeEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface PipelineFunnel {
  harvests: number;
  candidates: number;
  promoted: number;
  intent_records: number;
  plans: number;
}

export interface ThroughputItem {
  event_type: string;
  count: number;
}

export interface TimelineItem {
  bucket: string;
  event_type: string;
  count: number;
}

export interface SourceItem {
  source: string;
  count: number;
}

export interface AnalyticsResponse {
  range: string;
  granularity: string;
  totalEvents: number;
  throughput: ThroughputItem[];
  timeline: TimelineItem[];
  pipelineFunnel: PipelineFunnel;
  topSources: SourceItem[];
}

export interface LineageNode {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  depth: number;
}

export interface LineageEdge {
  source: string;
  target: string;
  type: string;
}

export interface LineageResponse {
  root: string;
  direction: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  truncated: boolean;
}

export interface ChildEvent {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  source: string;
  event_timestamp: string;
}

export interface ChildrenResponse {
  parent: string;
  children: ChildEvent[];
}

export interface ChainEvent {
  event_id: string;
  event_type: string;
  causation_id: string | null;
  caused_by_event_type: string | null;
  source: string;
  event_timestamp: string;
  payload: any;
  depth: number;
}

export interface LineageChainResponse {
  anchor: string;
  chain: ChainEvent[];
  depth: number;
}

export interface Subscriber {
  subject_pattern: string;
  handler_name: string;
  description: string | null;
  enabled: boolean;
  created_at: string;
  last_timestamp: string | null;
  processed_ids: string | null;
  last_processed_at: string | null;
  lag: number;
}

export interface SubscribersResponse {
  subscribers: Subscriber[];
}

export interface Assessment {
  resolution_id: string;
  event_id: string;
  outcome: string;
  confidence: number;
  rationale: string | null;
  dimensions_used: number;
  dimensions_total: number;
  resolved_at: string;
  event_type: string | null;
  source: string | null;
  payload: any;
}

export interface AssessmentsResponse {
  assessments: Assessment[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class CascadeService {
  private http = inject(HttpClient);

  getEvents(params?: {
    type?: string;
    source?: string;
    aggregate_id?: string;
    limit?: number;
    offset?: number;
  }): Observable<EventsResponse> {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.source) query.set('source', params.source);
    if (params?.aggregate_id) query.set('aggregate_id', params.aggregate_id);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    return this.http.get<EventsResponse>(`${API}/events?${query}`);
  }

  getEvent(id: string): Observable<CascadeEvent> {
    return this.http.get<CascadeEvent>(`${API}/events/${id}`);
  }

  getEventLineage(id: string, maxDepth = 10): Observable<LineageChainResponse> {
    return this.http.get<LineageChainResponse>(`${API}/events/${id}/lineage?maxDepth=${maxDepth}`);
  }

  getEventChildren(id: string): Observable<ChildrenResponse> {
    return this.http.get<ChildrenResponse>(`${API}/events/${id}/children`);
  }

  getLineageGraph(root: string, maxDepth = 5): Observable<LineageResponse> {
    return this.http.get<LineageResponse>(`${API}/lineage?root=${root}&maxDepth=${maxDepth}`);
  }

  getAnalytics(range = '24h'): Observable<AnalyticsResponse> {
    return this.http.get<AnalyticsResponse>(`${API}/analytics?range=${range}`);
  }

  getSubscribers(): Observable<SubscribersResponse> {
    return this.http.get<SubscribersResponse>(`${API}/subscribers`);
  }

  getAssessments(params?: {
    outcome?: string;
    event_id?: string;
    limit?: number;
    offset?: number;
  }): Observable<AssessmentsResponse> {
    const query = new URLSearchParams();
    if (params?.outcome) query.set('outcome', params.outcome);
    if (params?.event_id) query.set('event_id', params.event_id);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    return this.http.get<AssessmentsResponse>(`${API}/assessments?${query}`);
  }
}
