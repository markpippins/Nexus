import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap, of, catchError, combineLatest } from 'rxjs';
import { DataService, OpenQuestion, OpenQuestionAnswer, AgendaItem, ConversationBlock, TimelineEvent, DEFAULT_PAGE_SIZE } from '../../services/data.service';
import { PageHeaderComponent } from '../../components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { RaiseQuestionComponent } from '../../components/raise-question/raise-question.component';
import { SkeletonComponent } from '../../components/skeleton/skeleton.component';
import { ErrorStateComponent } from '../../components/error-state/error-state.component';
import { MarkdownRendererComponent } from '../../components/markdown-renderer/markdown-renderer.component';
import { TtsButtonComponent } from '../../components/tts-button/tts-button.component';
import { entityRouteForType, formatEntityType } from '../../utils/entity-route';

export interface EntityTypeConfig {
  label: string;
  routePrefix: string;
  titleField: string;
  backendType: string;
}

const ENTITY_CONFIG: Record<string, EntityTypeConfig> = {
  'work-requests': { label: 'Work Request', routePrefix: 'work-requests', titleField: 'title', backendType: 'work_request' },
  'requirements': { label: 'Requirement', routePrefix: 'requirements', titleField: 'title', backendType: 'requirement' },
  'agendas': { label: 'Agenda', routePrefix: 'agendas', titleField: 'title', backendType: 'agenda' },
  'candidates': { label: 'Candidate', routePrefix: 'candidates', titleField: 'title', backendType: 'candidate' },
  'harvests': { label: 'Harvest', routePrefix: 'harvests', titleField: 'sourceFilename', backendType: 'harvest' },
  'conversations': { label: 'Conversation', routePrefix: 'conversations', titleField: 'sourceFilename', backendType: 'conversation' },
  'open-questions': { label: 'Open Question', routePrefix: 'open-questions', titleField: 'title', backendType: 'open_question' },
  'intents': { label: 'Intent Record', routePrefix: 'intents', titleField: 'title', backendType: 'intent_record' },
  'assessments': { label: 'Assessment', routePrefix: 'assessments', titleField: 'outcome', backendType: 'assessment' },
  'observations': { label: 'Observation', routePrefix: 'observations', titleField: 'triggerType', backendType: 'observation' },
  'reports': { label: 'Report', routePrefix: 'reports', titleField: 'title', backendType: 'report' },
  'agent-records': { label: 'Agent Record', routePrefix: 'agent-records', titleField: 'title', backendType: 'agent_record' },
  'agents': { label: 'Agent', routePrefix: 'agents', titleField: 'title', backendType: 'agent' },
  'specifications': { label: 'Specification', routePrefix: 'specifications', titleField: 'revisionNumber', backendType: 'specification' },
  'specs': { label: 'Spec Item', routePrefix: 'specs', titleField: 'title', backendType: 'spec_item' },
};

@Component({
  selector: 'app-entity-detail-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent, StatusBadgeComponent, RaiseQuestionComponent, SkeletonComponent, ErrorStateComponent, MarkdownRendererComponent, TtsButtonComponent],
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
  answers = signal<OpenQuestionAnswer[]>([]);
  answersLoading = signal(false);
  loading = signal(true);

  /** Reply form state */
  replyBody = '';
  replyRole = 'user';
  replyConfidence = 'MEDIUM';
  replySaving = signal(false);
  replyError = signal<string | null>(null);

  submitAnswer() {
    const body = this.replyBody.trim();
    if (!body) return;
    const id = this.entityId();
    if (!id) return;

    this.replySaving.set(true);
    this.replyError.set(null);

    this.dataService.addOpenQuestionAnswer(id, {
      role: this.replyRole,
      answer: body,
      confidence: this.replyConfidence,
    }).subscribe({
      next: (newAnswer) => {
        this.answers.update(a => [...a, newAnswer]);
        this.replyBody = '';
        this.replyRole = 'user';
        this.replySaving.set(false);
      },
      error: (err) => {
        this.replyError.set(err.message || 'Failed to submit answer');
        this.replySaving.set(false);
      }
    });
  }

  /** Extracts sourceText from harvest entity (camelCase or snake_case) */
  harvestSourceText = computed<string>(() => {
    const entity = this.entity();
    if (!entity || this.entityType() !== 'harvests') return '';
    const text = entity['sourceText'] as string | undefined
             || entity['source_text'] as string | undefined;
    return typeof text === 'string' ? text : '';
  });

  /** Converts docklang JSONB to readable markdown */
  private docklangToMarkdown(docklang: Record<string, unknown> | null): string {
    if (!docklang) return '';
    const parts: string[] = [];

    // Meta section
    const meta = docklang['meta'] as Record<string, any> | undefined;
    if (meta) {
      if (meta['title']) parts.push(`# ${meta['title']}`);
      if (meta['model']) parts.push(`**Model:** ${meta['model']}`);
      if (meta['description']) parts.push(meta['description']);
      if (meta['date']) parts.push(`*Date: ${meta['date']}*`);
      if (meta['source_filename']) parts.push(`*File: ${meta['source_filename']}*`);
      parts.push('');
    }

    // Stats summary
    const stats = docklang['stats'] as Record<string, any> | undefined;
    if (stats) {
      parts.push('---');
      parts.push('');
      const totalBlocks = stats['total_blocks'] ?? stats['totalBlocks'] ?? '?';
      const totalUnits = stats['total_units'] ?? stats['totalUnits'] ?? (docklang['discourse_units'] as Array<any> | undefined)?.length ?? '?';
      parts.push(`> **Stats:** ${totalUnits} turns, ${totalBlocks} blocks`);
      const byTypeRaw = stats['by_type'] || stats['byType'];
      if (byTypeRaw && typeof byTypeRaw === 'object') {
        const breakdown = Object.entries(byTypeRaw as Record<string, number>)
          .map(([k, v]) => `${k}: ${v}`).join(', ');
        parts.push(`> ${breakdown}`);
      }
      parts.push('');
    }

    // Discourse units (turns with blocks)
    const units = (docklang['discourse_units'] || docklang['discourseUnits']) as Array<any> | undefined;
    if (units && Array.isArray(units)) {
      for (const unit of units) {
        if (unit.heading) {
          parts.push(`## ${unit.heading}`);
        } else if (unit.provenance?.role) {
          const role = String(unit.provenance.role);
          parts.push(`## ${role.charAt(0).toUpperCase() + role.slice(1)}`);
        }

        const blocks = unit.blocks as Array<any> | undefined;
        if (blocks && Array.isArray(blocks) && blocks.length > 0) {
          for (const block of blocks) {
            const blockType = block.type || 'paragraph';

            let textContent = '';
            if (typeof block.content === 'string') {
              textContent = block.content;
            } else if (block.content && typeof block.content === 'object') {
              textContent = block.content.text || block.content.code || block.content.content || '';
            } else if (typeof block.body === 'string') {
              textContent = block.body;
            } else if (typeof block.text === 'string') {
              textContent = block.text;
            }

            if (blockType === 'code') {
              const lang = block.language || (typeof block.content === 'object' ? block.content?.language : '') || '';
              parts.push('');
              parts.push(`\`\`\`${lang}\n${textContent}\n\`\`\``);
              parts.push('');
            } else if (blockType === 'diagram') {
              const fmt = block.format || 'mermaid';
              parts.push('');
              parts.push(`\`\`\`${fmt}\n${textContent}\n\`\`\``);
              parts.push('');
            } else if (blockType === 'quote') {
              const quoted = textContent.split('\n').map((line: string) => `> ${line}`).join('\n');
              parts.push(quoted + '\n');
            } else if (blockType === 'separator') {
              parts.push('---\n');
            } else if (blockType === 'list') {
              if (textContent) {
                parts.push(textContent + '\n');
              } else if (Array.isArray(block.items)) {
                parts.push(block.items.map((it: any) => `- ${it}`).join('\n') + '\n');
              }
            } else {
              if (textContent) {
                parts.push(textContent + '\n');
              }
            }
          }
        } else if (unit.body && typeof unit.body === 'string') {
          parts.push(unit.body + '\n');
        }
        parts.push('');
      }
    }

    if (parts.length === 0) {
      const allKeys = Object.keys(docklang);
      for (const key of allKeys) {
        if (['meta', 'stats', 'discourse_units', 'discourseUnits'].includes(key)) continue;
        const val = docklang[key];
        if (typeof val === 'string') {
          parts.push(`## ${key}`);
          parts.push(val);
          parts.push('');
        }
      }
    }

    return parts.join('\n').trim();
  }

  /** Extracts docklang from harvest entity for DockLang toggle */
  harvestDockLang = computed<string>(() => {
    const entity = this.entity();
    if (!entity || this.entityType() !== 'harvests') return '';
    const docklang = entity['docklang'];
    if (!docklang) return '';
    try {
      return typeof docklang === 'string' ? docklang : JSON.stringify(docklang, null, 2);
    } catch {
      return String(docklang);
    }
  });

  /** Docklang rendered as readable markdown — tries docklang field first,
   *  then attempts to parse sourceText as docklang JSON if docklang is null */
  harvestDockLangMarkdown = computed<string>(() => {
    const entity = this.entity();
    if (!entity || this.entityType() !== 'harvests') return '';

    const docklang = entity['docklang'];
    const sourceText = entity['sourceText'] || entity['source_text'];

    // Primary: convert docklang object to markdown
    if (docklang) {
      if (typeof docklang === 'object' && docklang !== null) {
        const md = this.docklangToMarkdown(docklang as Record<string, unknown>);
        if (md) return md;
      } else if (typeof docklang === 'string' && docklang.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(docklang);
          if (parsed && typeof parsed === 'object') {
            const md = this.docklangToMarkdown(parsed as Record<string, unknown>);
            if (md) return md;
          }
        } catch {
          // not valid json
        }
      }
    }

    // Fallback: try to parse sourceText as docklang JSON (some imports store
    // docklang data in sourceText when docklang field is null)
    if (sourceText && typeof sourceText === 'string' && sourceText.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(sourceText);
        if (parsed && typeof parsed === 'object') {
          const md = this.docklangToMarkdown(parsed as Record<string, unknown>);
          if (md) return md;
        }
      } catch {
        // Not valid JSON — fall through to raw sourceText
      }
    }

    // Last fallback: return sourceText as-is (the markdown renderer will handle it)
    return typeof sourceText === 'string' ? sourceText : '';
  });

  /** Whether DockLang view is active instead of markdown */
  showDockLang = signal(false);

  toggleDockLang() {
    this.showDockLang.update(v => !v);
  }

  /** Whether the open question is resolved */
  openQuestionIsResolved = computed<boolean>(() => {
    const entity = this.entity();
    if (!entity || this.entityType() !== 'open-questions') return false;
    const status = entity['status'];
    return status === 'RESOLVED' || status === 'WONT_FIX';
  });

  /** Latest answer (resolution) text from the answers collection */
  latestAnswerText = computed<string>(() => {
    const answers = this.answers();
    if (answers.length === 0) return '';
    return answers[answers.length - 1].answer || '';
  });

  /** Extracts forum thread route from the description field for discussion links */
  forumThreadRoute = computed<string[] | null>(() => {
    const entity = this.entity();
    if (!entity || this.entityType() !== 'open-questions') return null;
    const desc = entity['description'];
    if (typeof desc !== 'string') return null;
    const match = desc.match(/\/forums\/([^\/\s]+)\/([^\/\s\)]+)/);
    if (!match) return null;
    return ['/forums', match[1], match[2]];
  });

  /** Merges consecutive blocks by the same role into single-turn markdown sections */
  conversationMarkdown = computed<string>(() => {
    const blocks = this.conversationBlocks();
    if (!blocks.length) return '';

    // Group consecutive blocks by role into turns
    const turns: { role: string; content: string[] }[] = [];
    for (const block of blocks) {
      const roleLabel = block.role
        ? block.role.charAt(0).toUpperCase() + block.role.slice(1)
        : 'Unknown';
      // Handle both camelCase (contentMd) and snake_case (content_md) from backend
      const content = (block as unknown as Record<string, unknown>)['contentMd'] as string | undefined
                   || (block as unknown as Record<string, unknown>)['content_md'] as string | undefined
                   || '';

      const lastTurn = turns[turns.length - 1];
      if (lastTurn && lastTurn.role === roleLabel) {
        lastTurn.content.push(content);
      } else {
        turns.push({ role: roleLabel, content: [content] });
      }
    }

    // Render each turn as a single section with one role header
    return turns.map(turn => {
      const header = `**${turn.role}:**`;
      const body = turn.content.join('\n\n');
      return `${header}\n\n${body}`;
    }).join('\n\n---\n\n');
  });
  error = signal<string | null>(null);

  linkedEntityType = signal<string | null>(null);
  linkedEntityId = signal<string | null>(null);

  linkedEntityRoute = computed<string[] | null>(() => {
    const type = this.linkedEntityType();
    const id = this.linkedEntityId();
    if (!type || !id) return null;
    const route = entityRouteForType(type);
    if (!route) return null;
    return ['/', route, id];
  });

  linkedEntityLabel = computed<string>(() => formatEntityType(this.linkedEntityType()));

  linkedEntityTitle = computed<string>(() => {
    const title = this.entity()?.['entityTitle'];
    if (typeof title === 'string' && title.trim()) return title;
    return formatEntityType(this.linkedEntityType());
  });

  ngOnInit() {
    combineLatest([this.route.url, this.route.paramMap]).subscribe(([segments, params]) => {
      const type = segments[0]?.path || '';
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
    this.answers.set([]);

    if (type === 'agendas') {
      const entity = this.entity();
      if (entity && Array.isArray(entity['items'])) {
        this.agendaItems.set(entity['items'] as AgendaItem[]);
      }
      this.dataService.getAgendaItems(id).subscribe({
        next: (res: any) => {
          const list = Array.isArray(res) ? res : (res?.items || []);
          if (list.length > 0) {
            this.agendaItems.set(list);
          }
        },
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
      this.answersLoading.set(true);
      this.dataService.getOpenQuestionAnswers(id).subscribe({
        next: res => {
          this.answers.set(res.answers || []);
          this.answersLoading.set(false);
        },
        error: err => {
          console.error('[entity-detail] failed to load answers:', err.message);
          this.answers.set([]);
          this.answersLoading.set(false);
        }
      });
    }
  }

  getItemTitle(item: AgendaItem | Record<string, unknown>): string {
    const obj = item as Record<string, unknown>;
    return String(obj['title'] || obj['name'] || obj['topic'] || 'Untitled Item');
  }

  getItemSourceType(item: AgendaItem | Record<string, unknown>): string {
    const obj = item as Record<string, unknown>;
    return String(obj['sourceType'] || obj['source_type'] || '');
  }

  getItemSourceId(item: AgendaItem | Record<string, unknown>): string {
    const obj = item as Record<string, unknown>;
    return String(obj['sourceId'] || obj['source_id'] || '');
  }

  getItemBody(item: AgendaItem | Record<string, unknown>): string {
    const obj = item as Record<string, unknown>;
    return String(obj['body'] || obj['description'] || obj['summary'] || '');
  }

  loadEntity(type: string, id: string) {
    this.loading.set(true);
    this.error.set(null);
    this.linkedEntityType.set(null);
    this.linkedEntityId.set(null);

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
        if (type === 'open-questions' && entity && typeof entity === 'object') {
          const oq = entity as OpenQuestion;
          this.linkedEntityType.set(oq.entityType || null);
          this.linkedEntityId.set(oq.entityId || null);
        }
        const backendType = this.config?.backendType || 'unknown';
        return this.dataService.getOpenQuestionsForEntity(backendType, id);
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to load entity');
        this.loading.set(false);
        return of({ items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE });
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
      'specs': id => this.dataService.getSpecItem(id),
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

  /** Fields to exclude from the metadata table — these are large JSON blobs shown
   *  in dedicated sections below, internal routing fields, or raw JSON that isn't
   *  useful as key-value pairs. The rest are plain scalar values that display fine. */
  private METADATA_EXCLUDED_KEYS = new Set([
    'id', 'entityType', 'entityId',
    'docklang',      // shown in dedicated DockLang toggle section
    'sourceText',    // shown in dedicated Source Conversation section
    'candidates',    // raw JSON — not useful in metadata table
    'metadata',      // raw JSON — shows docklingVersion etc.
    'runMetadata',   // raw JSON — empty or opaque
    'items',         // agenda items array — rendered in dedicated Agenda Items panel
  ]);

  get metadataEntries(): { key: string; rawKey: string; value: unknown; formattedValue: string; route: string[] | null }[] {
    const entity = this.entity();
    if (!entity) return [];
    return Object.entries(entity)
      .filter(([key]) => !this.METADATA_EXCLUDED_KEYS.has(key))
      .map(([key, value]) => ({
        key: this.formatKey(key),
        rawKey: key,
        value,
        formattedValue: this.formatValue(value),
        route: this.resolveEntityRoute(key, value)
      }));
  }

  resolveEntityRoute(rawKey: string, value: unknown): string[] | null {
    if (!value || typeof value !== 'string' || !value.trim()) return null;
    const val = value.trim();
    const entity = this.entity();
    const currentType = this.entityType();

    if ((rawKey === 'sourceId' || rawKey === 'source_id') && entity) {
      const sourceType = (entity['sourceType'] || entity['source_type']) as string | undefined;
      if (sourceType) {
        const route = entityRouteForType(sourceType);
        if (route) return ['/', route, val];
      }
    }

    let stem = '';
    if (rawKey.endsWith('Id')) {
      stem = rawKey.slice(0, -2);
    } else if (rawKey.endsWith('_id')) {
      stem = rawKey.slice(0, -3);
    } else if (rawKey.endsWith('Ref')) {
      stem = rawKey.slice(0, -3);
    }

    if (stem) {
      let targetType = stem;
      if (targetType.startsWith('source') && targetType.length > 6) {
        targetType = targetType.slice(6);
        targetType = targetType.charAt(0).toLowerCase() + targetType.slice(1);
      } else if (targetType.startsWith('target') && targetType.length > 6) {
        targetType = targetType.slice(6);
        targetType = targetType.charAt(0).toLowerCase() + targetType.slice(1);
      }

      const normalized = targetType.replace(/([A-Z])/g, '_$1').toLowerCase();

      if ((normalized === 'parent' || normalized === 'parent_id') && currentType) {
        const parentRoute = entityRouteForType(currentType);
        if (parentRoute) return ['/', parentRoute, val];
      }

      const route = entityRouteForType(normalized);
      if (route) return ['/', route, val];
    }

    return null;
  }

  getItemRoute(item: AgendaItem | Record<string, unknown>): string[] | null {
    const obj = item as Record<string, unknown>;
    const sourceId = (obj['sourceId'] || obj['source_id']) as string | undefined;
    const sourceType = (obj['sourceType'] || obj['source_type']) as string | undefined;
    if (sourceId && sourceType) {
      const route = entityRouteForType(sourceType);
      if (route) return ['/', route, sourceId];
    }
    for (const key of Object.keys(obj)) {
      if (key.endsWith('Id') || key.endsWith('_id') || key.endsWith('Ref')) {
        const val = obj[key];
        if (typeof val === 'string' && val.trim()) {
          const r = this.resolveEntityRoute(key, val);
          if (r) return r;
        }
      }
    }
    return null;
  }

  formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
      return new Date(value).toLocaleString();
    }
    if (Array.isArray(value)) {
      if (!value.length) return '—';
      const formatted = value.map(item => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          return String(obj['title'] || obj['name'] || obj['label'] || obj['id'] || JSON.stringify(item));
        }
        return String(item);
      });
      return formatted.join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  formatKey(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  formatDate(date: string) {
    return new Date(date).toLocaleString();
  }

  confidenceColor(confidence: string): string {
    switch ((confidence || '').toUpperCase()) {
      case 'HIGH': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'LOW': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  }

  roleBadgeColor(role: string): string {
    const colors: Record<string, string> = {
      architect: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-700',
      engineer: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-700',
      analyst: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-700',
      planner: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400 border-teal-200 dark:border-teal-700',
      reviewer: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-700',
      inspector: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-700',
      critic: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    };
    return colors[role?.toLowerCase()] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700';
  }

}
