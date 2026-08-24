import { Component, inject, signal, computed, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CascadeService,
  type CascadeEvent,
  type AnalyticsResponse,
  type Subscriber,
  type LineageNode,
  type LineageEdge,
} from './cascade.service';
import { Subscription, interval } from 'rxjs';

// ── Force-Directed Layout Types ───────────────────────────────────
interface LayoutNode {
  id: string;
  type: string;
  source: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number;
  color: string;
}

interface LayoutEdge {
  source: string;
  target: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  private api = inject(CascadeService);
  Math = Math;

  // ── Event bus connection status ────────────────────────────────
  readonly busConnected = signal(false);
  readonly busLastEvent = signal<string | null>(null);

  // ── Theme ─────────────────────────────────────────────────────────
  readonly theme = signal<'steel' | 'light' | 'dark'>('steel');

  private readonly EVENT_BUS_URL = 'http://localhost:3200';

  toggleTheme() {
    const cycle: Array<'steel' | 'light' | 'dark'> = ['steel', 'light', 'dark'];
    const idx = cycle.indexOf(this.theme());
    const newTheme = cycle[(idx + 1) % cycle.length];
    this.theme.set(newTheme);

    // Publish theme change to the event bus so other apps (nebula-ui, etc.) follow
    const themeValue = `theme-${newTheme}`;
    fetch(`${this.EVENT_BUS_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: 'cascade-ui',
        eventName: 'theme-change',
        eventValue: themeValue,
      }),
    }).catch(() => {});
  }

  /** Map nexus-console theme IDs to cascade-ui theme values */
  private mapTheme(themeId: string): 'steel' | 'light' | 'dark' {
    switch (themeId) {
      case 'theme-light': return 'light';
      case 'theme-dark': return 'dark';
      case 'theme-steel':
      default: return 'steel';
    }
  }

  // ── Data ──────────────────────────────────────────────────────────
  events = signal<CascadeEvent[]>([]);
  totalEvents = signal(0);
  analytics = signal<AnalyticsResponse | null>(null);
  subscribers = signal<Subscriber[]>([]);
  subscriberCount = signal(0);
  loading = signal(false);
  error = signal<string | null>(null);
  refreshTime = signal<string>('');
  autoRefresh = signal(true);

  // ── Filters ───────────────────────────────────────────────────────
  filterType = signal('');
  filterSource = signal('');
  range = signal('24h');
  limit = signal(50);
  offset = signal(0);

  // ── Selection ─────────────────────────────────────────────────────
  selectedEvent = signal<CascadeEvent | null>(null);
  showSubscribers = signal(false);
  showAsJson = signal(false);

  // ── Detail sub-views ──────────────────────────────────────────────
  lineageEvents = signal<any[]>([]);
  lineageLoading = signal(false);
  childrenEvents = signal<any[]>([]);
  childrenLoading = signal(false);
  detailView = signal<'detail' | 'lineage' | 'children' | 'graph'>('detail');

  // ── Graph View ────────────────────────────────────────────────────
  graphLoading = signal(false);
  graphNodes = signal<LayoutNode[]>([]);
  graphEdges = signal<LayoutEdge[]>([]);
  graphSvgW = signal(340);
  graphSvgH = signal(400);
  graphNodeCount = signal(0);
  graphEdgeCount = signal(0);
  graphTruncated = signal(false);
  graphDirection = signal('');
  hoveredNode = signal<string | null>(null);

  // ── Event types for filter ────────────────────────────────────────
  eventTypes = signal<string[]>([]);
  eventSources = signal<string[]>([]);

  // ── Pagination ───────────────────────────────────────────────────
  totalPages = computed(() => Math.ceil(this.totalEvents() / this.limit()));
  currentPage = computed(() => Math.floor(this.offset() / this.limit()) + 1);

  private refreshSub?: Subscription;
  private eventSource?: EventSource;

  constructor() {
    // Sync theme signal to DOM class changes reactively — matches Nebula/Nexus pattern
    effect(() => {
      const t = this.theme();
      const html = document.documentElement;
      html.classList.remove('steel', 'light', 'dark');
      html.classList.add(t);
      if (t === 'steel' || t === 'dark') {
        html.classList.add('dark');
      }
    });
  }

  ngOnInit() {
    this.loadAll();
    this.refreshSub = interval(15000).subscribe(() => {
      if (this.autoRefresh()) this.loadAll();
    });

    // Connect to the UI event bus SSE stream to sync theme from parent (nexus-console)
    this.connectEventBus();
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
    this.eventSource?.close();
  }

  /** Connect to the cross-app UI event bus to receive theme updates from nexus-console */
  private connectEventBus(): void {
    try {
      const url = `${this.EVENT_BUS_URL}/api/events/stream?sender=${encodeURIComponent('cascade-ui')}`;
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.busConnected.set(true);
      };

      this.eventSource.onmessage = (msg: MessageEvent) => {
        try {
          const event = JSON.parse(msg.data) as {
            sender: string;
            eventName: string;
            eventValue: string;
          };

          // Skip system messages and self-originated events (server-side should filter,
          // but be defensive)
          if (event.sender === '_system' || event.sender === 'cascade-ui') return;

          // Track last event for the connection status tooltip
          const now = new Date().toLocaleTimeString();
          this.busLastEvent.set(`${event.sender} › ${event.eventName} @ ${now}`);

          if (event.eventName === 'theme-change' && typeof event.eventValue === 'string') {
            const mappedTheme = this.mapTheme(event.eventValue);
            if (this.theme() !== mappedTheme) {
              console.log(`[cascade-ui] theme sync from ${event.sender}: ${event.eventValue} → ${mappedTheme}`);
              this.theme.set(mappedTheme);
            }
          }
        } catch {
          // Ignore parse errors from SSE connection
        }
      };

      this.eventSource.onerror = () => {
        this.busConnected.set(false);
        console.warn('[cascade-ui] Event bus SSE lost, will reconnect automatically');
      };
    } catch (err) {
      this.busConnected.set(false);
      console.warn('[cascade-ui] Failed to connect to event bus:', err);
    }
  }

  loadAll() {
    this.loading.set(true);
    this.error.set(null);
    this.refreshTime.set(new Date().toLocaleTimeString());

    this.api
      .getEvents({
        limit: this.limit(),
        offset: this.offset(),
        type: this.filterType() || undefined,
        source: this.filterSource() || undefined,
      })
      .subscribe({
        next: (r: { events: CascadeEvent[]; total: number }) => {
          this.events.set(r.events);
          this.totalEvents.set(r.total);
          const types = [...new Set(r.events.map((e: CascadeEvent) => e.event_type))].sort() as string[];
          const sources = [...new Set(r.events.map((e: CascadeEvent) => e.source))].sort() as string[];
          this.eventTypes.set(types);
          this.eventSources.set(sources);
          this.loading.set(false);
        },
        error: (e: Error) => {
          this.error.set(e.message);
          this.loading.set(false);
        },
      });

    this.api.getAnalytics(this.range()).subscribe({
      next: (r: AnalyticsResponse) => this.analytics.set(r),
      error: () => {},
    });

    this.api.getSubscribers().subscribe({
      next: (r: { subscribers: Subscriber[] }) => {
        this.subscribers.set(r.subscribers);
        this.subscriberCount.set(r.subscribers.length);
      },
      error: () => {},
    });
  }

  applyFilters() {
    this.offset.set(0);
    this.loadAll();
  }

  prevPage() {
    const newOff = Math.max(0, this.offset() - this.limit());
    this.offset.set(newOff);
    this.loadAll();
  }

  nextPage() {
    const newOff = this.offset() + this.limit();
    if (newOff < this.totalEvents()) {
      this.offset.set(newOff);
      this.loadAll();
    }
  }

  goToPage(p: number) {
    this.offset.set((p - 1) * this.limit());
    this.loadAll();
  }

  selectEvent(ev: CascadeEvent) {
    this.selectedEvent.set(ev);
    this.detailView.set('detail');
    this.lineageEvents.set([]);
    this.childrenEvents.set([]);
    this.graphNodes.set([]);
    this.graphEdges.set([]);
  }

  closeDetail() {
    this.selectedEvent.set(null);
    this.lineageEvents.set([]);
    this.childrenEvents.set([]);
    this.graphNodes.set([]);
    this.graphEdges.set([]);
  }

  loadLineage() {
    const ev = this.selectedEvent();
    if (!ev) return;
    this.detailView.set('lineage');
    this.lineageLoading.set(true);
    this.api.getEventLineage(ev.event_id).subscribe({
      next: (r: { chain: any[] }) => {
        this.lineageEvents.set(r.chain);
        this.lineageLoading.set(false);
      },
      error: () => {
        this.lineageLoading.set(false);
      },
    });
  }

  loadChildren() {
    const ev = this.selectedEvent();
    if (!ev) return;
    this.detailView.set('children');
    this.childrenLoading.set(true);
    this.api.getEventChildren(ev.event_id).subscribe({
      next: (r: { children: any[] }) => {
        this.childrenEvents.set(r.children);
        this.childrenLoading.set(false);
      },
      error: () => {
        this.childrenLoading.set(false);
      },
    });
  }

  // ── Force-Directed Graph ─────────────────────────────────────────
  loadGraph() {
    const ev = this.selectedEvent();
    if (!ev) return;
    this.detailView.set('graph');
    this.graphNodes.set([]);
    this.graphEdges.set([]);
    this.graphLoading.set(true);

    this.api.getLineageGraph(ev.event_id, 8).subscribe({
      next: (r) => {
        this.graphNodeCount.set(r.nodes.length);
        this.graphEdgeCount.set(r.edges.length);
        this.graphTruncated.set(r.truncated);
        this.graphDirection.set(r.direction);
        this.runForceLayout(r.nodes, r.edges);
        this.graphLoading.set(false);
      },
      error: () => {
        this.graphLoading.set(false);
      },
    });
  }

  private runForceLayout(rawNodes: LineageNode[], rawEdges: LineageEdge[]) {
    if (rawNodes.length === 0) {
      this.graphNodes.set([]);
      this.graphEdges.set([]);
      return;
    }

    const W = 340;
    const H = 400;
    const cx = W / 2;
    const cy = H / 2;

    // Build layout nodes with initial positions (circle layout)
    const nodes: LayoutNode[] = rawNodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / rawNodes.length;
      const radius = Math.min(W, H) * 0.35;
      return {
        id: n.id,
        type: n.type,
        source: n.source,
        label: n.type.length > 25 ? n.type.slice(0, 22) + '…' : n.type,
        x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 20,
        y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        depth: n.depth,
        color: this.eventTypeColor(n.type),
      };
    });

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edges: LayoutEdge[] = [];

    for (const e of rawEdges) {
      if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
        edges.push({ source: e.source, target: e.target });
      }
    }

    // Force simulation parameters
    const REPULSION = 6000;
    const ATTRACTION = 0.005;
    const CENTER_GRAVITY = 0.01;
    const DAMPING = 0.85;
    const ITERATIONS = 150;
    const MIN_DIST = 30;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const cooling = 1 - iter / ITERATIONS;

      // Repulsion (Coulomb's law) — all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x;
          let dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MIN_DIST) dist = MIN_DIST;
          const force = (REPULSION / (dist * dist)) * cooling;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction (spring force) — along edges
      for (const e of edges) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * ATTRACTION * cooling;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Center gravity
      for (const n of nodes) {
        n.vx += (cx - n.x) * CENTER_GRAVITY * cooling;
        n.vy += (cy - n.y) * CENTER_GRAVITY * cooling;
      }

      // Apply velocity with damping
      for (const n of nodes) {
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;

        // Keep within bounds
        if (n.x < 30) n.x = 30;
        if (n.x > W - 30) n.x = W - 30;
        if (n.y < 30) n.y = 30;
        if (n.y > H - 30) n.y = H - 30;
      }
    }

    this.graphNodes.set(nodes);
    this.graphEdges.set(edges);
    this.graphSvgW.set(W);
    this.graphSvgH.set(H);
  }

  // ── Utility ───────────────────────────────────────────────────────
  formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleString();
  }

  timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  eventTypeColor(type: string): string {
    if (type.includes('discovered')) return '#8b5cf6';
    if (type.includes('promoted')) return '#10b981';
    if (type.includes('created')) return '#3b82f6';
    if (type.includes('captured')) return '#f59e0b';
    if (type.includes('test')) return '#6b7280';
    if (type.includes('error')) return '#ef4444';
    return '#6366f1';
  }

  truncate(id: string): string {
    return id.length > 8 ? id.slice(0, 8) + '…' : id;
  }

  get maxTimelineCount(): number {
    const a = this.analytics();
    if (!a?.timeline.length) return 1;
    return Math.max(...a.timeline.map((t) => t.count), 1);
  }

  get funnelMax(): number {
    const f = this.analytics()?.pipelineFunnel;
    if (!f) return 1;
    return Math.max(f.harvests, f.candidates, f.promoted, f.plans, 1);
  }

  get pages(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  jsonStringify(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }

  eventTitle(ev: CascadeEvent): string {
    if (ev.payload?.title) return ev.payload.title;
    return `${ev.event_type} — ${ev.aggregate_type} ${this.truncate(ev.aggregate_id)}`;
  }

  subscriberLagClass(lag: number): string {
    if (lag === 0) return 'lag-none';
    if (lag < 10) return 'lag-low';
    if (lag < 50) return 'lag-medium';
    return 'lag-high';
  }

  // Graph helper — find a node by id
  getNode(id: string, nodes: LayoutNode[]): LayoutNode | undefined {
    return nodes.find((n) => n.id === id);
  }

  // Graph helper — check if a node is connected to the hovered node
  isConnectedToHovered(nodeId: string, edges: LayoutEdge[]): boolean {
    const hov = this.hoveredNode();
    if (!hov || hov === nodeId) return true;
    return edges.some((e) => (e.source === hov && e.target === nodeId) || (e.source === nodeId && e.target === hov));
  }
}
