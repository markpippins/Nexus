import { Component, computed, signal, HostListener } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { ConduitService } from '../../services/conduit.service';
import { DepNode, DepEdge, PlanCard, PromptEntry } from '../../services/types';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

@Component({
  selector: 'app-dependency-graph',
  standalone: true,
  imports: [NgFor, NgIf, EmptyStateComponent],
  templateUrl: './dependency-graph.component.html',
  styleUrls: ['./dependency-graph.component.scss'],
})
export class DependencyGraphComponent {
  scale = signal(1);
  panX = signal(0);
  panY = signal(0);
  hoveredNode = signal<string | null>(null);

  /** All plans (non-archived) */
  private readonly allPlans = computed<PlanCard[]>(() => {
    const s = this.pipe.state();
    if (!s) return [];
    return [...s.plans.pending, ...s.plans.active, ...s.plans.completed, ...s.plans.blocked];
  });

  /** All prompts from state */
  private readonly allPrompts = computed<PromptEntry[]>(() => {
    const s = this.pipe.state();
    return s?.prompts || [];
  });

  /** Map: promptNumber → PromptEntry for quick lookup */
  private readonly promptMap = computed(() => {
    const m = new Map<string, any>();
    for (const p of this.allPrompts()) m.set(p.promptNumber, p);
    return m;
  });

  /** Prompt nodes: one per prompt that is referenced by at least one plan */
  private readonly promptNodes = computed<DepNode[]>(() => {
    const ap = this.allPlans();
    const pm = this.promptMap();
    const seen = new Set<string>();
    const nodes: DepNode[] = [];
    for (const plan of ap) {
      if (!plan.promptRef) continue;
      const match = plan.promptRef.match(/(\d{3,4})/);
      if (!match) continue;
      const pn = match[1];
      if (seen.has(pn)) continue;
      seen.add(pn);
      const entry = pm.get(pn);
      nodes.push({
        type: 'prompt',
        planNumber: pn,
        title: entry ? entry.title.slice(0, 25) : `Prompt #${pn}`,
        status: 'prompt',
        x: 0, y: 0,
      });
    }
    // Sort ascending by prompt number
    nodes.sort((a, b) => {
      const an = parseInt(a.planNumber, 10);
      const bn = parseInt(b.planNumber, 10);
      if (isNaN(an) && isNaN(bn)) return a.planNumber.localeCompare(b.planNumber);
      if (isNaN(an)) return 1;
      if (isNaN(bn)) return -1;
      return an - bn;
    });
    return nodes;
  });

  /** All nodes: prompts + plans */
  readonly nodes = computed<DepNode[]>(() => {
    const prompts = this.promptNodes();
    const plans = this.allPlans().map(p => ({
      type: 'plan' as const,
      planNumber: p.planNumber,
      title: p.title || p.baseName,
      status: this.getStatus(p.planNumber),
      x: 0, y: 0,
    }));
    return [...prompts, ...plans];
  });

  /** Edges: prompt→plan (from promptRef) + plan→plan (from dependencies) */
  readonly edges = computed<DepEdge[]>(() => {
    const deps: DepEdge[] = [];
    const ap = this.allPlans();
    // Prompt → plan edges
    for (const plan of ap) {
      if (!plan.promptRef) continue;
      const match = plan.promptRef.match(/(\d{3,4})/);
      if (!match) continue;
      deps.push({ from: match[1], to: plan.planNumber });
    }
    // Plan → plan dependency edges
    for (const plan of ap) {
      if (!plan.dependencies) continue;
      for (const dep of plan.dependencies) {
        const match = dep.match(/(\d{3,4})/);
        if (match) deps.push({ from: match[1], to: plan.planNumber });
      }
    }
    return deps;
  });

  readonly layout = computed(() => {
    const ns = this.nodes();
    const es = this.edges();
    const promptSet = new Set(this.promptNodes().map(n => n.planNumber));
    const NODE_W = 140; const NODE_H = 40; const GAP_X = 40; const GAP_Y = 16;
    const PROMPT_W = 120; const PROMPT_H = 30;

    // Build adjacency: node → list of nodes that depend on it
    const children = new Map<string, string[]>();
    for (const e of es) {
      if (!children.has(e.from)) children.set(e.from, []);
      children.get(e.from)!.push(e.to);
    }

    // BFS layout: prompts start at depth 0, plans start at minimum depth 1
    const depth = new Map<string, number>();
    const hasIncoming = new Set(es.map(e => e.to));
    const queue: string[] = [];

    // Prompt nodes → depth 0
    for (const n of ns) {
      if (promptSet.has(n.planNumber)) {
        depth.set(n.planNumber, 0);
        queue.push(n.planNumber);
      }
    }
    // Plan nodes with no incoming edges → depth 1
    for (const n of ns) {
      if (promptSet.has(n.planNumber)) continue;
      if (!hasIncoming.has(n.planNumber)) {
        depth.set(n.planNumber, 1);
        queue.push(n.planNumber);
      }
    }

    // BFS propagation
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curDepth = depth.get(cur) || 0;
      for (const child of (children.get(cur) || [])) {
        const newDepth = Math.max(depth.get(child) || 0, curDepth + 1);
        depth.set(child, newDepth);
        if (!queue.includes(child)) queue.push(child);
      }
    }
    for (const n of ns) if (!depth.has(n.planNumber)) depth.set(n.planNumber, 1);

    // Assign positions — prompts use smaller width
    const byDepth = new Map<number, DepNode[]>();
    for (const n of ns) {
      const d = depth.get(n.planNumber) || 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push({ ...n, x: 0, y: 0 });
    }
    let col = 0;
    const maxDepth = Math.max(...Array.from(byDepth.keys()), 0);
    for (let d = 0; d <= maxDepth; d++) {
      const row = byDepth.get(d) || [];
      const isPromptCol = row.length > 0 && row[0].type === 'prompt';
      const w = isPromptCol ? PROMPT_W : NODE_W;
      const h = isPromptCol ? PROMPT_H : NODE_H;
      const gy = isPromptCol ? 12 : GAP_Y;
      for (let i = 0; i < row.length; i++) {
        row[i].x = col * (isPromptCol ? (PROMPT_W + 32) : (NODE_W + GAP_X)) + 20;
        row[i].y = i * (h + gy) + 20;
      }
      if (row.length > 0) col++;
    }
    return byDepth;
  });

  readonly allNodes = computed(() => {
    const result: DepNode[] = [];
    for (const [, nodes] of this.layout()) result.push(...nodes);
    return result;
  });

  readonly nodeMap = computed(() => {
    const m = new Map<string, DepNode>();
    for (const n of this.allNodes()) m.set(n.planNumber, n);
    return m;
  });

  readonly renderedEdges = computed(() => {
    return this.edges().filter(e => this.nodeMap().has(e.from) && this.nodeMap().has(e.to));
  });

  readonly svgWidth = computed(() => {
    const ns = this.allNodes();
    if (ns.length === 0) return 400;
    return Math.max(...ns.map(n => n.x + (n.type === 'prompt' ? 120 : 140))) + 40;
  });
  readonly svgHeight = computed(() => {
    const ns = this.allNodes();
    if (ns.length === 0) return 300;
    return Math.max(...ns.map(n => n.y + (n.type === 'prompt' ? 30 : 40))) + 40;
  });

  readonly getStatusColor = (n: DepNode): string => {
    if (n.type === 'prompt') return '#9b59b6';
    switch (n.status) { case 'completed': return '#2ecc71'; case 'active': return '#3498db'; case 'blocked': return '#e74c3c'; default: return '#f39c12'; }
  };

  constructor(private pipe: ConduitService) {}

  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.scale.update(s => Math.max(0.5, Math.min(2, s + delta)));
  }

  getNodeX(pn: string): number { return this.nodeMap().get(pn)?.x ?? 0; }
  getNodeY(pn: string): number { return this.nodeMap().get(pn)?.y ?? 0; }

  getNodeW(pn: string): number { const n = this.nodeMap().get(pn); return n?.type === 'prompt' ? 120 : 140; }
  getNodeH(pn: string): number { const n = this.nodeMap().get(pn); return n?.type === 'prompt' ? 30 : 40; }

  getStatus(pn: string): string {
    const s = this.pipe.state();
    if (!s) return 'pending';
    if (s.plans.completed.find((p: any) => p.planNumber === pn)) return 'completed';
    if (s.plans.active.find((p: any) => p.planNumber === pn)) return 'active';
    if (s.plans.blocked.find((p: any) => p.planNumber === pn)) return 'blocked';
    return 'pending';
  }
}
