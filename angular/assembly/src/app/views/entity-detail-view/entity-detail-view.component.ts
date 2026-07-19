import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap, of, catchError } from 'rxjs';
import { DataService, OpenQuestion, AgendaItem, ConversationBlock, TimelineEvent } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { MarkdownRendererComponent } from '../../components/markdown-renderer/markdown-renderer.component';

export interface EntityTypeConfig {
  label: string;
  routePrefix: string;
  titleField: string;
}

const ENTITY_CONFIG: Record<string, EntityTypeConfig> = {
  'work-requests': { label: 'Work Request', routePrefix: 'work-requests', titleField: 'title' },
  'requirements': { label: 'Requirement', routePrefix: 'requirements', titleField: 'title' },
  'agendas': { label: 'Agenda', routePrefix: 'agendas', titleField: 'title' },
  'candidates': { label: 'Candidate', routePrefix: 'candidates', titleField: 'title' },
  'harvests': { label: 'Harvest', routePrefix: 'harvests', titleField: 'sourceFilename' },
  'conversations': { label: 'Conversation', routePrefix: 'conversations', titleField: 'sourceFilename' },
  'open-questions': { label: 'Open Question', routePrefix: 'open-questions', titleField: 'title' },
  'intents': { label: 'Intent Record', routePrefix: 'intents', titleField: 'title' },
  'assessments': { label: 'Assessment', routePrefix: 'assessments', titleField: 'outcome' },
  'observations': { label: 'Observation', routePrefix: 'observations', titleField: 'triggerType' },
  'reports': { label: 'Report', routePrefix: 'reports', titleField: 'title' },
  'agent-records': { label: 'Agent Record', routePrefix: 'agent-records', titleField: 'title' },
  'agents': { label: 'Agent', routePrefix: 'agents', titleField: 'title' },
  'specifications': { label: 'Specification', routePrefix: 'specifications', titleField: 'revisionNumber' },
};

@Component({
  selector: 'app-entity-detail-view',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, StatusBadgeComponent, RaiseQuestionComponent, SkeletonComponent, ErrorStateComponent, MarkdownRendererComponent],
  templateUrl: './entity-detail-view.component.html',
})
export class EntityDetailViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);

  entityType = signal<string>('');
  entityId = signal<string>('');
  entity = signal<Record<string, unknown> | null>(null);
  openQuestions = signal<OpenQuestion[]>([]);
  agendaItems = signal<AgendaItem[]>([]);
  conversationBlocks = signal<ConversationBlock[]>([]);
  timelineEvents = signal<TimelineEvent[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const type = this.route.snapshot.url[0]?.path || '';
      const id = params.get('id') || '';
      this.entityType.set(type);
      this.entityId.set(id);
      this.loadEntity(type, id);
    });
  }

  retry() {
    this.loadEntity(this.entityType(), this.entityId());
  }

  private loadSubCollections(type: string, id: string) {
    this.agendaItems.set([]);
    this.conversationBlocks.set([]);
    this.timelineEvents.set([]);

    if (type === 'agendas') {
      this.dataService.getAgendaItems(id).subscribe({
        next: items => this.agendaItems.set(items),
        error: err => console.error('[entity-detail] failed to load agenda items:', err.message),
      });
    } else if (type === 'conversations') {
      this.dataService.getConversationBlocks(id).subscribe({
        next: blocks => this.conversationBlocks.set(blocks),
        error: err => console.error('[entity-detail] failed to load conversation blocks:', err.message),
      });
    } else if (type === 'open-questions') {
      this.dataService.getOpenQuestionTimeline(id).subscribe({
        next: events => this.timelineEvents.set(events),
        error: err => console.error('[entity-detail] failed to load timeline:', err.message),
      });
    }
  }

  loadEntity(type: string, id: string) {
    this.loading.set(true);
    this.error.set(null);

    const fetcher = this.getFetcher(type);
    if (!fetcher) {
      this.error.set(`Unknown entity type: ${type}`);
      this.loading.set(false);
      return;
    }

    fetcher(id).pipe(
      switchMap(entity => {
        this.entity.set(entity as Record<string, unknown>);
        this.loadSubCollections(type, id);
        return this.dataService.getOpenQuestionsForEntity(type.replace(/s$/, '').replace(/-/, '_'), id);
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to load entity');
        this.loading.set(false);
        return of({ items: [], total: 0, page: 1, pageSize: 100 });
      })
    ).subscribe(result => {
      this.openQuestions.set(result.items);
      this.loading.set(false);
    });
  }

  private getFetcher(type: string): ((id: string) => import('rxjs').Observable<unknown>) | null {
    const map: Record<string, (id: string) => import('rxjs').Observable<unknown>> = {
      'work-requests': id => this.dataService.getWorkRequest(id),
      'requirements': id => this.dataService.getRequirement(id),
      'agendas': id => this.dataService.getAgenda(id),
      'candidates': id => this.dataService.getCandidate(id),
      'harvests': id => this.dataService.getHarvest(id),
      'conversations': id => this.dataService.getConversation(id),
      'open-questions': id => this.dataService.getOpenQuestion(id),
      'intents': id => this.dataService.getIntent(id),
      'assessments': id => this.dataService.getAssessment(id),
      'observations': id => this.dataService.getObservation(id),
      'reports': id => this.dataService.getReport(id),
      'agent-records': id => this.dataService.getAgentRecord(id),
      'agents': id => this.dataService.getAgentRecord(id),
      'specifications': id => this.dataService.getSpecification(id),
    };
    return map[type] || null;
  }

  get config(): EntityTypeConfig | null {
    return ENTITY_CONFIG[this.entityType()] || null;
  }

  get title(): string {
    const entity = this.entity();
    const config = this.config;
    if (!entity || !config) return 'Detail';
    const value = entity[config.titleField];
    if (config.titleField === 'revisionNumber') return `Revision #${value}`;
    return String(value || 'Untitled');
  }

  get metadataEntries(): { key: string; value: unknown }[] {
    const entity = this.entity();
    if (!entity) return [];
    return Object.entries(entity)
      .filter(([key]) => !['id'].includes(key))
      .map(([key, value]) => ({ key: this.formatKey(key), value }));
  }

  formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
      return new Date(value).toLocaleString();
    }
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  formatKey(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  formatDate(date: string) {
    return new Date(date).toLocaleString();
  }
}
