import crypto from 'crypto';
import { PipelineWatcher } from './watcher';
import { createError, createSuccess } from './errors';
import { validate } from './validate';
import { validateReceipt } from './receipts';
import { insertReceipt, createTicketIfMissing, getPlan, getPlanById, getLatestReceiptType, getPlanReceipts, upsertPlan, softDeletePlan, checkpointWal, cancelTicketsByPlan, deleteReceiptsByPlanAndType } from './db';
import fs from 'fs';
import path from 'path';

import { ArchiveEntry, ArchiveSearchParams, AgentRole, AgentStatus, AgentState, InspectionEntry, InspectionSearchParams, PromptSearchParams, PipelineMetrics, PlanCard } from './types';
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export const toolDefinitions: MCPToolDefinition[] = [
  {
    name: 'query_conduit_state',
    description:
      'Returns the full conduit state JSON including all plans, builder status, and circuit breaker status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'report_plan_metadata',
    description: 'Report or update metadata for a specific plan',
    inputSchema: {
      type: 'object',
      properties: {
        planId: {
          type: 'string',
          description: 'Plan ID (e.g., "0030")',
        },
        title: {
          type: 'string',
          description: 'Optional new title',
        },
        description: {
          type: 'string',
          description: 'Optional description',
        },
      },
      required: ['planId'],
    },
  },
  {
    name: 'report_builder_status',
    description: 'Report or update builder process status',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Builder status (running, idle, stale, killed)',
        },
        pid: {
          type: 'number',
          description: 'Optional PID',
        },
        note: {
          type: 'string',
          description: 'Optional note',
        },
      },
      required: ['status'],
    },
  },
  {
    name: 'agent_heartbeat',
    description: 'Report agent liveness and current activity',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Agent role (planner, builder, reviewer, critic, analyst, architect)' },
        state: { type: 'string', description: 'Agent state (idle, working, blocked)' },
        detail: { type: 'string', description: 'Optional detail (e.g., "Executing plan 0029")' },
        pid: { type: 'number', description: 'Optional OS process ID' },
      },
      required: ['role', 'state'],
    },
  },
  {
    name: 'agent_finished',
    description: 'Report agent has finished its current task',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Agent role' },
        exitCode: { type: 'number', description: 'Optional exit code (0=success)' },
        summary: { type: 'string', description: 'Optional summary' },
      },
      required: ['role'],
    },
  },
  {
    name: 'query_inspections',
    description: 'Query conduit inspection reports with search, filter, and pagination',
    inputSchema: { type: 'object', properties: { category: { type: 'string' }, status: { type: 'string' }, search: { type: 'string' }, planRef: { type: 'string' }, page: { type: 'number' }, pageSize: { type: 'number' } } },
  },
  {
    name: 'query_prompts',
    description: 'Query captured prompts with plan lineage tracking',
    inputSchema: { type: 'object', properties: { search: { type: 'string' }, project: { type: 'string' }, session: { type: 'string' }, planRef: { type: 'string' }, location: { type: 'string' }, page: { type: 'number' }, pageSize: { type: 'number' } } },
  },
  {
    name: 'save_prompt',
    description: 'Save a prompt as the start of the audit trail. Writes a .md file to PROMPTS/ which appears in the prompt catalog.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Prompt title (e.g., "Refactor getState() to receipt authority")' },
        content: { type: 'string', description: 'Full prompt text / conversation content' },
        project: { type: 'string', description: 'Project name (e.g., "conduit-mcp")' },
        session: { type: 'string', description: 'Session identifier' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'save_response',
    description: 'Save an agent response to an existing prompt, completing the audit trail. Appends a ## Response section to the prompt file.',
    inputSchema: {
      type: 'object',
      properties: {
        promptNumber: { type: 'string', description: 'Prompt number to attach the response to (e.g., "0070")' },
        response: { type: 'string', description: 'Full agent response text' },
      },
      required: ['promptNumber', 'response'],
    },
  },
  {
    name: 'query_analytics',
    description: 'Query conduit analytics metrics',
    inputSchema: { type: 'object', properties: { range: { type: 'string' } } },
  },
  {
    name: 'query_changes',
    description: 'Query change reports with plan references',
    inputSchema: { type: 'object', properties: { category: { type: 'string' }, planRef: { type: 'string' }, sessionId: { type: 'string' }, agent: { type: 'string' }, search: { type: 'string' }, location: { type: 'string' }, page: { type: 'number' }, pageSize: { type: 'number' } } },
  },
  {
    name: 'create_plan',
    description: 'Create a new implementation plan file in the pending directory',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Plan title (e.g., "Dark/light theme toggle")' },
        project: { type: 'string', description: 'Project name (e.g., "conduit-ui")' },
        goal: { type: 'string', description: 'Goal description' },
        filesAffected: { type: 'array', items: { type: 'string' }, description: 'List of files that will be affected' },
        acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'List of acceptance criteria' },
        dependencies: { type: 'array', items: { type: 'string' }, description: 'List of dependency plan numbers' },
        promptRef: { type: 'string', description: 'Optional prompt number this plan was spawned from (e.g., "0001")' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_plan',
    description: 'Update metadata for an existing plan file',
    inputSchema: {
      type: 'object',
      properties: {
        planNumber: { type: 'string', description: 'Plan number to update (e.g., "0051")' },
        title: { type: 'string', description: 'New title' },
        project: { type: 'string', description: 'New project' },
        goal: { type: 'string', description: 'New goal description' },
        filesAffected: { type: 'array', items: { type: 'string' }, description: 'New files affected list' },
        acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'New acceptance criteria' },
        dependencies: { type: 'array', items: { type: 'string' }, description: 'New dependencies' },
      },
      required: ['planNumber'],
    },
  },
  {
    name: 'issue_receipt',
    description: 'Record a conduit event receipt. Required for state transitions.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'Plan number (e.g. "0053")' },
        type: { type: 'string', description: 'PLAN_CREATE|IMPLEMENTATION|REVIEW_PASS|REVIEW_REJECT|BLOCK|PROPOSED|PLANNING|API_LIMIT' },
        agent_role: { type: 'string', description: 'planner|builder|reviewer|watchdog' },
        session_id: { type: 'string', description: 'Optional session ID' },
        artifact_path: { type: 'string', description: 'Optional path to proof artifact' },
        summary: { type: 'string', description: 'Optional one-line summary' },
        metadata: { type: 'object', description: 'Optional arbitrary metadata' },
      },
      required: ['plan_id', 'type', 'agent_role'],
    },
  },
  {
    name: 'get_plan_receipts',
    description: 'Get the full receipt chain for a plan',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'Plan number (e.g. "0053")' },
      },
      required: ['plan_id'],
    },
  },
  {
    name: 'revise_plan',
    description: 'Create a revision copy of an existing plan in planning state. Copies title/goal/acceptance criteria but strips filesAffected (Planner will add those). Issues a PLANNING receipt on the new plan.',
    inputSchema: {
      type: 'object',
      properties: {
        planNumber: { type: 'string', description: 'Plan number to revise (e.g. "0053")' },
        title: { type: 'string', description: 'Optional new title (defaults to original)' },
        goal: { type: 'string', description: 'Optional updated goal' },
        acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'Optional updated acceptance criteria' },
        dependencies: { type: 'array', items: { type: 'string' }, description: 'Optional updated dependencies' },
      },
      required: ['planNumber'],
    },
  },
  {
    name: 'unblock_plan',
    description: 'Move a blocked plan back to pending: deletes all BLOCK/PLAN_BLOCK receipts, issues a PLAN_CREATE receipt, and spawns a planner ticket so the conduit can pick it up again.',
    inputSchema: {
      type: 'object',
      properties: {
        planNumber: { type: 'string', description: 'Plan number to unblock (e.g. "0076")' },
      },
      required: ['planNumber'],
    },
  },
  {
    name: 'promote_plan',
    description: 'Promote a proposed plan to planning state. Accepts optional title/goal edits that are saved before promoting. Issues a PLANNING receipt so the Planner can elucidate and prepare it for implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        planNumber: { type: 'string', description: 'Plan number to promote (e.g. "0067")' },
        title: { type: 'string', description: 'Optional updated title to save before promoting' },
        goal: { type: 'string', description: 'Optional updated goal to save before promoting' },
      },
      required: ['planNumber'],
    },
  },
  {
    name: 'delete_plan',
    description: 'Soft-delete a plan: marks it deleted in the database so it disappears from all views. If the plan is blocked, block artifacts outside the database (plan files, block-related files) are removed. Receipts and audit trail are preserved.',
    inputSchema: {
      type: 'object',
      properties: {
        planNumber: { type: 'string', description: 'Plan number to delete (e.g. "0053")' },
      },
      required: ['planNumber'],
    },
  },
  {
    name: 'create_proposed_plan',
    description: 'Create a new proposed plan in the proposed/ directory with a PROPOSED receipt. Simplified form — only title, project, and goal are accepted. Files affected and acceptance criteria are deferred to planning.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Plan title (e.g., "Add dark mode toggle")' },
        project: { type: 'string', description: 'Project name (e.g., "conduit-ui")' },
        goal: { type: 'string', description: 'Goal description' },
        promptRef: { type: 'string', description: 'Optional prompt number this idea was spawned from (e.g., "0001")' },
      },
      required: ['title'],
    },
  },
];

export function registerToolHandlers(
  watcher: PipelineWatcher,
  emitter?: (event: any) => void,
): Record<string, Function> {
  return {
    query_conduit_state: async (_args: any) => {
      return watcher.getState();
    },
    report_plan_metadata: async (args: {
      planId: string;
      title?: string;
      description?: string;
    }) => {
      const errs = validate(args, [
        { field: 'planId', type: 'string', required: true },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      const updates: Record<string, any> = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.goal = args.description;
      const result = watcher.updatePlanMetadata(args.planId, updates);
      return {
        acknowledged: true,
        planId: args.planId,
        updated: result.found,
        timestamp: new Date().toISOString(),
      };
    },
    report_builder_status: async (args: {
      status: string;
      pid?: number;
      note?: string;
    }) => {
      const errs = validate(args, [
        { field: 'status', type: 'string', required: true },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      return {
        acknowledged: true,
        status: args.status,
        timestamp: new Date().toISOString(),
      };
    },
    agent_heartbeat: async (args: {
      role: string;
      state: string;
      detail?: string;
      pid?: number;
    }) => {
      const errs = validate(args, [
        { field: 'role', type: 'string', required: true },
        { field: 'state', type: 'string', required: true },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      watcher.updateAgentHeartbeat(
        args.role as AgentRole,
        args.state as AgentStatus,
        args.detail || null,
        args.pid || null,
      );
      return { acknowledged: true, timestamp: new Date().toISOString() };
    },
    agent_finished: async (args: {
      role: string;
      exitCode?: number;
      summary?: string;
    }) => {
      const errs = validate(args, [
        { field: 'role', type: 'string', required: true },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      watcher.updateAgentFinished(args.role as AgentRole);
      return { acknowledged: true, timestamp: new Date().toISOString() };
    },
    query_archive: async (args: ArchiveSearchParams) => {
      const errs = validate(args, [
        { field: 'category', type: 'string' },
        { field: 'search', type: 'string' },
        { field: 'dateFrom', type: 'string' },
        { field: 'dateTo', type: 'string' },
        { field: 'page', type: 'number' },
        { field: 'pageSize', type: 'number' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      let results = watcher.getArchiveEntries();

      // Category filter
      if (args.category && args.category !== 'all') {
        results = results.filter((e) => e.category === args.category);
      }

      // Full-text search
      if (args.search) {
        const q = args.search.toLowerCase();
        results = results.filter(
          (e) =>
            e.fileName.toLowerCase().includes(q) ||
            e.title?.toLowerCase().includes(q) ||
            e.goal?.toLowerCase().includes(q) ||
            e.sessionId?.toLowerCase().includes(q),
        );
      }

      // Date range
      if (args.dateFrom) {
        const from = new Date(args.dateFrom).getTime();
        results = results.filter((e) => new Date(e.mtime).getTime() >= from);
      }
      if (args.dateTo) {
        const to = new Date(args.dateTo).getTime();
        results = results.filter((e) => new Date(e.mtime).getTime() <= to);
      }

      // Sort by mtime descending
      results.sort(
        (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
      );

      // Pagination
      const page = args.page || 1;
      const pageSize = args.pageSize ?? 50;
      const total = results.length;
      const start = (page - 1) * pageSize;
      results = results.slice(start, start + pageSize);

      return { results, total, page, pageSize };
    },
    query_inspections: async (args: InspectionSearchParams) => {
      const errs = validate(args, [
        { field: 'category', type: 'string' },
        { field: 'status', type: 'string' },
        { field: 'search', type: 'string' },
        { field: 'planRef', type: 'string' },
        { field: 'page', type: 'number' },
        { field: 'pageSize', type: 'number' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      let results = watcher.getInspections();
      if (args.category && args.category !== 'all') results = results.filter((e: any) => e.category === args.category);
      if (args.status && args.status !== 'all') results = results.filter((e: any) => e.status === args.status);
      if (args.search) { const q = args.search.toLowerCase(); results = results.filter((e: any) => e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)); }
      if (args.planRef) results = results.filter((e: any) => e.planRefs.includes(args.planRef!));
      results.sort((a: any, b: any) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
      const page = args.page || 1; const ps = args.pageSize ?? 50; const total = results.length;
      return { results: results.slice((page-1)*ps, page*ps), total, page, pageSize: ps };
    },
    query_prompts: async (args: PromptSearchParams) => {
      const errs = validate(args, [
        { field: 'search', type: 'string' },
        { field: 'project', type: 'string' },
        { field: 'session', type: 'string' },
        { field: 'planRef', type: 'string' },
        { field: 'location', type: 'string' },
        { field: 'page', type: 'number' },
        { field: 'pageSize', type: 'number' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      let results = watcher.getPrompts();
      if (args.search) { const q = args.search.toLowerCase(); results = results.filter((e: any) => e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)); }
      if (args.project) results = results.filter((e: any) => e.project === args.project);
      if (args.planRef) results = results.filter((e: any) => e.planRefs.some((p: any) => p.planNumber === args.planRef));
      if (args.location && args.location !== 'all') results = results.filter((e: any) => e.location === args.location);
      results.sort((a: any, b: any) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
      const page = args.page || 1; const ps = args.pageSize ?? 50; const total = results.length;
      return { results: results.slice((page-1)*ps, page*ps), total, page, pageSize: ps };
    },
    query_analytics: async (_args: any) => {
      return watcher.computeAnalytics();
    },
    query_changes: async (args: any) => {
      const errs = validate(args, [
        { field: 'category', type: 'string' },
        { field: 'planRef', type: 'string' },
        { field: 'sessionId', type: 'string' },
        { field: 'agent', type: 'string' },
        { field: 'search', type: 'string' },
        { field: 'location', type: 'string' },
        { field: 'page', type: 'number' },
        { field: 'pageSize', type: 'number' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      let results = watcher.getChangeReports();
      if (args.category && args.category !== 'all') results = results.filter((e: any) => e.category === args.category);
      if (args.planRef) results = results.filter((e: any) => e.planRefs.some((p: any) => p.planNumber === args.planRef));
      if (args.search) { const q = args.search.toLowerCase(); results = results.filter((e: any) => e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)); }
      results.sort((a: any, b: any) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
      const page = args.page || 1; const ps = args.pageSize ?? 50; const total = results.length;
      return { results: results.slice((page-1)*ps, page*ps), total, page, pageSize: ps };
    },
    create_plan: async (args: {
      title: string;
      project?: string;
      goal?: string;
      filesAffected?: string[];
      acceptanceCriteria?: string[];
      dependencies?: string[];
      promptRef?: string;
    }) => {
      const errs = validate(args, [
        { field: 'title', type: 'string', required: true },
        { field: 'filesAffected', type: 'array' },
        { field: 'acceptanceCriteria', type: 'array' },
        { field: 'dependencies', type: 'array' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      const result = watcher.createPlan({
        title: args.title,
        project: args.project || 'conduit-ui',
        goal: args.goal || '',
        filesAffected: args.filesAffected || [],
        acceptanceCriteria: args.acceptanceCriteria || [],
        dependencies: args.dependencies || [],
        promptRef: args.promptRef,
      });

      // Upsert plan into DB immediately so the FK constraint on receipts is satisfied
      const now = new Date().toISOString();
      upsertPlan({
        id: result.planNumber,
        file_name: result.fileName,
        title: args.title,
        project: args.project || 'conduit-ui',
        goal: args.goal || '',
        content: '',
        files_affected: JSON.stringify(args.filesAffected || []),
        acceptance_criteria: JSON.stringify(args.acceptanceCriteria || []),
        dependencies: JSON.stringify(args.dependencies || []),
        prompt_ref: args.promptRef || '',
        created_at: now,
        updated_at: now,
      });

      // Bootstrap initial planner ticket so the conduit can pick this up
      const receiptId = crypto.randomUUID();
      const ticketId = createTicketIfMissing(
        result.planNumber,
        'planner',
        receiptId,
        now,
        args.title,
        '',
        'planner',
      );
      if (ticketId) {
        console.log(`[${now}] Bootstrapped planner ticket ${ticketId} for plan ${result.planNumber}`);
      }

      // Issue PLAN_CREATE receipt with ticket reference
      insertReceipt({
        id: receiptId,
        plan_id: result.planNumber,
        type: 'PLAN_CREATE',
        agent_role: 'planner',
        session_id: '',
        ticket_id: ticketId,  // link receipt to the bootstrap ticket
        artifact_path: null,
        summary: `Created: ${args.title}`,
        metadata_json: JSON.stringify(args.promptRef ? { promptRef: args.promptRef } : {}),
        tokens_used: 0,
        created_at: now,
      });

      checkpointWal();  // durable across abrupt restarts

      if (emitter) {
        emitter({
          type: 'plan_state_changed',
          data: {
            planNumber: result.planNumber,
            planTitle: result.fileName,
            receiptType: 'PLAN_CREATE',
            agentRole: 'planner',
            newDerivedStatus: 'PLAN_CREATE',
            timestamp: now,
          },
        });
      }

      return {
        created: true,
        planNumber: result.planNumber,
        fileName: result.fileName,
        status: 'pending',
        timestamp: now,
      };
    },
    update_plan: async (args: {
      planNumber: string;
      title?: string;
      project?: string;
      goal?: string;
      filesAffected?: string[];
      acceptanceCriteria?: string[];
      dependencies?: string[];
    }) => {
      const errs = validate(args, [
        { field: 'planNumber', type: 'string', required: true },
        { field: 'title', type: 'string' },
        { field: 'project', type: 'string' },
        { field: 'goal', type: 'string' },
        { field: 'filesAffected', type: 'array' },
        { field: 'acceptanceCriteria', type: 'array' },
        { field: 'dependencies', type: 'array' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);
      const updates: Record<string, any> = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.project !== undefined) updates.project = args.project;
      if (args.goal !== undefined) updates.goal = args.goal;
      if (args.filesAffected !== undefined) updates.filesAffected = args.filesAffected;
      if (args.acceptanceCriteria !== undefined) updates.acceptanceCriteria = args.acceptanceCriteria;
      if (args.dependencies !== undefined) updates.dependencies = args.dependencies;
      const result = watcher.updatePlanMetadata(args.planNumber, updates);
      return {
        updated: result.found,
        planNumber: args.planNumber,
        timestamp: new Date().toISOString(),
      };
    },
    issue_receipt: async (args: {
      plan_id: string; type: string; agent_role: string;
      session_id?: string; ticket_id?: string; artifact_path?: string;
      summary?: string; metadata?: Record<string, any>;
    }) => {
      // Validate the receipt
      const validation = validateReceipt(args.plan_id, args.type);
      if (!validation.valid) {
        return {
          issued: false,
          error: validation.error,
          plan_id: args.plan_id,
        };
      }
      
      // Check plan exists
      const plan = getPlan(args.plan_id);
      if (!plan) {
        return {
          issued: false,
          error: `Plan ${args.plan_id} not found in database`,
          plan_id: args.plan_id,
        };
      }
      
      // ── Bootstrapping and receipt insertion ──────────────────
      // For PLAN_CREATE, create the ticket first so the receipt can
      // reference it (bi-directional link: ticket↔receipt).
      const receiptId = crypto.randomUUID();
      const now = new Date().toISOString();
      let ticketId: string | null = null;
      if (args.type === 'PLAN_CREATE') {
        // v086: bootstrap a planner ticket so the conduit can pick this up
        ticketId = createTicketIfMissing(
          args.plan_id,
          'planner',
          receiptId,
          now,
          args.summary || '',
          '',
          args.agent_role,
        );
        if (ticketId) {
          console.log(`[${now}] Bootstrapped planner ticket ${ticketId} for plan ${args.plan_id}`);
        }
      }

      // Insert receipt (references the bootstrap ticket if PLAN_CREATE)
      insertReceipt({
        id: receiptId,
        plan_id: args.plan_id,
        type: args.type,
        agent_role: args.agent_role,
        session_id: args.session_id || '',
        ticket_id: ticketId || args.ticket_id || null,
        artifact_path: args.artifact_path || null,
        summary: args.summary || '',
        metadata_json: JSON.stringify(args.metadata || {}),
        tokens_used: 0,
        created_at: now,
      });

      checkpointWal();

      // SSE: notify all connected clients that state changed
      try {
        const plan = getPlan(args.plan_id);
        if (plan && emitter) {
          emitter({
            type: 'plan_state_changed',
            data: {
              planNumber: args.plan_id,
              planTitle: plan.title,
              receiptType: args.type,
              agentRole: args.agent_role,
              newDerivedStatus: getLatestReceiptType(args.plan_id),
              timestamp: now,
            },
          });
        }
      } catch {
        // SSE emission is best-effort
      }
      
      return {
        issued: true,
        receipt_id: receiptId,
        plan_id: args.plan_id,
        type: args.type,
        new_derived_status: getLatestReceiptType(args.plan_id),
        timestamp: now,
      };
    },
    get_plan_receipts: async (args: { plan_id: string }) => {
      const receipts = getPlanReceipts(args.plan_id);
      return {
        plan_id: args.plan_id,
        count: receipts.length,
        receipts,
      };
    },
    revise_plan: async (args: {
      planNumber: string;
      title?: string;
      goal?: string;
      acceptanceCriteria?: string[];
      dependencies?: string[];
    }) => {
      const errs = validate(args, [
        { field: 'planNumber', type: 'string', required: true },
        { field: 'title', type: 'string' },
        { field: 'goal', type: 'string' },
        { field: 'acceptanceCriteria', type: 'array' },
        { field: 'dependencies', type: 'array' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);

      // Find the original plan
      const allPlans = watcher.getState().plans;
      let original: PlanCard | undefined;
      for (const col of ['completed', 'blocked', 'pending', 'active'] as const) {
        original = allPlans[col].find((p: PlanCard) => p.planNumber === args.planNumber);
        if (original) break;
      }
      if (!original) {
        throw createError('PLAN_NOT_FOUND', `Plan ${args.planNumber} not found`, null);
      }

      // Create the revised plan (no filesAffected — Planner adds those)
      const revised = watcher.createPlan({
        title: args.title || `[Revise] ${original.title}`,
        project: original.project || 'conduit-ui',
        goal: args.goal || original.goal || '',
        filesAffected: [],  // intentionally stripped
        acceptanceCriteria: args.acceptanceCriteria || original.acceptanceCriteria || [],
        dependencies: args.dependencies || original.dependencies || [],
        promptRef: original.promptRef,  // carry forward the original prompt reference
      });

      // Move from pending/ to planning/
      const pendingPath = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'pending', revised.fileName);
      const planningPath = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'planning', revised.fileName);
      if (fs.existsSync(pendingPath)) {
        const planningDir = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'planning');
        if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
        fs.renameSync(pendingPath, planningPath);
      }

      // Upsert plan into DB so it's durable (not relying on async chokidar watcher)
      const now = new Date().toISOString();
      upsertPlan({
        id: revised.planNumber,
        file_name: revised.fileName,
        title: args.title || `[Revise] ${original.title}`,
        project: original.project || 'conduit-ui',
        goal: args.goal || original.goal || '',
        content: '',
        files_affected: '[]',
        acceptance_criteria: JSON.stringify(args.acceptanceCriteria || original.acceptanceCriteria || []),
        dependencies: JSON.stringify(args.dependencies || original.dependencies || []),
        prompt_ref: original.promptRef || '',
        created_at: now,
        updated_at: now,
      });

      // Issue PLANNING receipt (no ticket_id — this is a revision, not a bootstrap)
      const receiptId = crypto.randomUUID();
      insertReceipt({
        id: receiptId,
        plan_id: revised.planNumber,
        type: 'PLANNING',
        agent_role: 'planner',
        session_id: '',
        ticket_id: null,
        artifact_path: null,
        summary: `Revision of plan ${args.planNumber}`,
        metadata_json: JSON.stringify({ revised_from: args.planNumber }),
        tokens_used: 0,
        created_at: now,
      });
      checkpointWal();

      if (emitter) {
        emitter({
          type: 'plan_state_changed',
          data: {
            planNumber: revised.planNumber,
            planTitle: revised.fileName,
            receiptType: 'PLANNING',
            agentRole: 'planner',
            newDerivedStatus: 'PLANNING',
            revisedFrom: args.planNumber,
            timestamp: now,
          },
        });
      }

      return {
        created: true,
        planNumber: revised.planNumber,
        fileName: revised.fileName,
        revisedFrom: args.planNumber,
        status: 'planning',
        timestamp: now,
      };
    },
    create_proposed_plan: async (args: {
      title: string;
      project?: string;
      goal?: string;
      promptRef?: string;
    }) => {
      const errs = validate(args, [
        { field: 'title', type: 'string', required: true },
        { field: 'project', type: 'string' },
        { field: 'goal', type: 'string' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);

      // Create the plan file in proposed/ directory
      const result = watcher.createPlan({
        title: args.title,
        project: args.project || 'conduit-ui',
        goal: args.goal || '',
        filesAffected: [],
        acceptanceCriteria: [],
        dependencies: [],
        promptRef: args.promptRef,
      });

      // Move from pending/ to proposed/
      const pendingPath = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'pending', result.fileName);
      const proposedPath = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'proposed', result.fileName);
      if (fs.existsSync(pendingPath)) {
        const proposedDir = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'proposed');
        if (!fs.existsSync(proposedDir)) fs.mkdirSync(proposedDir, { recursive: true });
        fs.renameSync(pendingPath, proposedPath);
      }

      // Upsert plan into DB immediately so the FK constraint on receipts is satisfied
      const now = new Date().toISOString();
      upsertPlan({
        id: result.planNumber,
        file_name: result.fileName,
        title: args.title,
        project: args.project || 'conduit-ui',
        goal: args.goal || '',
        content: '',
        files_affected: '[]',
        acceptance_criteria: '[]',
        dependencies: '[]',
        prompt_ref: args.promptRef || '',
        created_at: now,
        updated_at: now,
      });

      // Issue PROPOSED receipt (no ticket_id — the planner will bootstrap tickets)
      const receiptId = crypto.randomUUID();
      insertReceipt({
        id: receiptId,
        plan_id: result.planNumber,
        type: 'PROPOSED',
        agent_role: 'planner',
        session_id: '',
        ticket_id: null,
        artifact_path: null,
        summary: `Proposed: ${args.title}`,
        metadata_json: JSON.stringify({ proposed_from_ui: true, ...(args.promptRef ? { promptRef: args.promptRef } : {}) }),
        tokens_used: 0,
        created_at: now,
      });
      checkpointWal();  // durable across abrupt restarts

      if (emitter) {
        emitter({
          type: 'plan_state_changed',
          data: {
            planNumber: result.planNumber,
            planTitle: result.fileName,
            receiptType: 'PROPOSED',
            agentRole: 'planner',
            newDerivedStatus: 'PROPOSED',
            timestamp: now,
          },
        });
      }

      return {
        created: true,
        planNumber: result.planNumber,
        fileName: result.fileName,
        status: 'proposed',
        timestamp: now,
      };
    },
    save_prompt: async (args: {
      title: string;
      content: string;
      project?: string;
      session?: string;
    }) => {
      const errs = validate(args, [
        { field: 'title', type: 'string', required: true },
        { field: 'content', type: 'string', required: true },
        { field: 'project', type: 'string' },
        { field: 'session', type: 'string' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);

      const promptsDir = path.join(watcher.baseDir, 'PROMPTS');
      if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });

      // Auto-increment prompt number from existing files
      let maxNum = 0;
      for (const f of fs.readdirSync(promptsDir)) {
        const m = f.match(/^(\d+)/);
        if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
      }
      const nextNum = String(maxNum + 1).padStart(4, '0');
      const slug = args.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50);
      const fileName = `${nextNum}-${slug}.md`;
      const filePath = path.join(promptsDir, fileName);

      const lines: string[] = [];
      lines.push('---');
      lines.push(`project: ${args.project || ''}`);
      lines.push(`session: ${args.session || ''}`);
      lines.push('---');
      lines.push(`# Prompt ${nextNum}: ${args.title}`);
      lines.push('');
      lines.push('## Summary');
      lines.push('');
      lines.push(args.content);
      lines.push('');

      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

      const now = new Date().toISOString();
      return {
        saved: true,
        promptNumber: nextNum,
        fileName,
        title: args.title,
        timestamp: now,
      };
    },

    save_response: async (args: {
      promptNumber: string;
      response: string;
    }) => {
      const errs = validate(args, [
        { field: 'promptNumber', type: 'string', required: true },
        { field: 'response', type: 'string', required: true },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);

      const promptsDir = path.join(watcher.baseDir, 'PROMPTS');
      if (!fs.existsSync(promptsDir)) {
        throw createError('FILE_NOT_FOUND', 'PROMPTS directory does not exist', null);
      }

      // Find the prompt file by number prefix (exact delimiter match)
      const padded = args.promptNumber.padStart(4, '0');
      let filePath: string | null = null;
      for (const f of fs.readdirSync(promptsDir)) {
        if (!f.endsWith('.md')) continue;
        if (f.startsWith(padded + '-') || f === padded + '.md') {
          filePath = path.join(promptsDir, f);
          break;
        }
      }
      if (!filePath) {
        throw createError('FILE_NOT_FOUND', `Prompt ${args.promptNumber} not found`, null);
      }

      let content = fs.readFileSync(filePath, 'utf-8');
      const ts = new Date().toISOString();

      // Append or replace the ## Response section
      if (content.includes('\n## Response\n')) {
        content = content.replace(
          /\n## Response\n[\s\S]*/,
          `\n## Response\n\n${args.response}\n\n---\n*Response recorded: ${ts}*\n`
        );
      } else {
        content = content.trimEnd() + `\n\n## Response\n\n${args.response}\n\n---\n*Response recorded: ${ts}*\n`;
      }

      fs.writeFileSync(filePath, content, 'utf-8');

      const now = new Date().toISOString();
      return {
        saved: true,
        promptNumber: args.promptNumber,
        timestamp: now,
      };
    },

    delete_plan: async (args: { planNumber: string }) => {
      const errs = validate(args, [
        { field: 'planNumber', type: 'string', required: true },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);

      // Use getPlanById (raw plans table) to find the plan even if it has no receipts
      const plan = getPlanById(args.planNumber);
      if (!plan) {
        throw createError('PLAN_NOT_FOUND', `Plan ${args.planNumber} not found`, null);
      }

      if (plan.deleted) {
        // Cancel any non-terminal tickets for this plan so they don't
        // remain orphaned in open/claimed/stale state.
        const ticketsCancelled = cancelTicketsByPlan(args.planNumber, 'plan_deleted');
        // Proactively clean the watcher's in-memory cache even if already
        // soft-deleted. This handles cases where SQL was used directly or
        // a previous delete_plan call returned early without cleanup.
        watcher.removePlanFromMemory(args.planNumber);
        const now = new Date().toISOString();
        if (emitter) {
          emitter({
            type: 'plan_deleted',
            data: {
              planNumber: args.planNumber,
              planTitle: plan.title,
              wasBlocked: false,
              cleanedArtifacts: [],
              timestamp: now,
            },
          });
        }
        return {
          deleted: false,
          planNumber: args.planNumber,
          alreadyDeleted: true,
          ticketsCancelled,
          timestamp: now,
        };
      }

      // Determine if the plan is blocked (check derived status)
      const derivedStatus = getLatestReceiptType(args.planNumber);
      const isBlocked = derivedStatus === 'BLOCK' || derivedStatus === 'PLAN_BLOCK';

      // Soft-delete in DB first
      const deleted = softDeletePlan(args.planNumber);
      if (!deleted) {
        return {
          deleted: false,
          planNumber: args.planNumber,
          error: 'Failed to soft-delete plan',
          timestamp: new Date().toISOString(),
        };
      }
      checkpointWal();

      // Cancel any non-terminal tickets so they don't remain orphaned
      // in open/claimed/stale state on the now-deleted plan.
      const ticketsCancelled = cancelTicketsByPlan(args.planNumber, 'plan_deleted');

      // Delete the .md file from ALL IMPLEMENTATION_PLANS subdirectories.
      // Without this, the plan-watcher re-adds the plan to in-memory state
      // on next rescan even though the DB row is deleted=1.
      const cleanedPaths: string[] = [];
      const planDirs = ['proposed', 'planning', 'pending', 'active', 'completed', 'blocked'] as const;
      for (const dir of planDirs) {
        const dirPath = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', dir);
        if (!fs.existsSync(dirPath)) continue;
        for (const file of fs.readdirSync(dirPath)) {
          if (!file.endsWith('.md') || file === '.gitkeep') continue;
          const filePath = path.join(dirPath, file);
          // Match by plan number in the filename (e.g., "some-plan-v0001.md")
          const planMatch = file.match(/v(\d+)/) || file.match(/^(\d+)-/);
          if (planMatch) {
            const filePlanNumber = planMatch[1];
            if (filePlanNumber === args.planNumber || filePlanNumber.padStart(4, '0') === args.planNumber) {
              try {
                fs.unlinkSync(filePath);
                cleanedPaths.push(filePath);
              } catch {
                // best-effort cleanup
              }
            }
          }
        }
      }

      // Also clean up block artifacts if blocked
      if (isBlocked) {
        const blockedDir = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'blocked');
        if (fs.existsSync(blockedDir)) {
          for (const file of fs.readdirSync(blockedDir)) {
            if (!file.endsWith('.md') || file === '.gitkeep') continue;
            const filePath = path.join(blockedDir, file);
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              if (content.includes(`**Plan Number:** ${args.planNumber}`)) {
                fs.unlinkSync(filePath);
                cleanedPaths.push(filePath);
              }
            } catch {
              // best-effort cleanup
            }
          }
        }
      }

      // Also remove from in-memory plan-watcher state immediately
      watcher.removePlanFromMemory(args.planNumber);

      const now = new Date().toISOString();

      // Emit SSE event so UI removes the plan immediately
      if (emitter) {
        emitter({
          type: 'plan_deleted',
          data: {
            planNumber: args.planNumber,
            planTitle: plan.title,
            wasBlocked: isBlocked,
            cleanedArtifacts: cleanedPaths,
            timestamp: now,
          },
        });
      }

      return {
        deleted: true,
        planNumber: args.planNumber,
        wasBlocked: isBlocked,
        cleanedArtifacts: cleanedPaths,
        ticketsCancelled,
        timestamp: now,
      };
    },

    promote_plan: async (args: { planNumber: string; title?: string; goal?: string }) => {
      const errs = validate(args, [
        { field: 'planNumber', type: 'string', required: true },
        { field: 'title', type: 'string' },
        { field: 'goal', type: 'string' },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);

      const plan = getPlan(args.planNumber);
      if (!plan) {
        throw createError('PLAN_NOT_FOUND', `Plan ${args.planNumber} not found`, null);
      }

      const newTitle = args.title?.trim() || plan.title;
      const newGoal = args.goal?.trim() || plan.goal;

      // Move file from proposed/ to planning/ — apply edits before moving
      const proposedPath = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'proposed');
      let movedFile = false;
      if (fs.existsSync(proposedPath)) {
        for (const file of fs.readdirSync(proposedPath)) {
          if (!file.endsWith('.md') || file === '.gitkeep') continue;
          const filePath = path.join(proposedPath, file);
          if (tryParsePlanFile(filePath) === args.planNumber) {
            // Apply title/goal edits to the file before moving
            if (args.title?.trim() || args.goal?.trim()) {
              let content = fs.readFileSync(filePath, 'utf-8');
              if (args.title?.trim()) content = content.replace(/^# .+$/m, `# ${args.title.trim()}`);
              if (args.goal?.trim()) {
                content = content.replace(/## Goal\s*\n([\s\S]*?)(?=\n## |$)/, `## Goal\n\n${args.goal.trim()}`);
              }
              fs.writeFileSync(filePath, content, 'utf-8');
            }
            const planningDir = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS', 'planning');
            if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
            fs.renameSync(filePath, path.join(planningDir, file));
            movedFile = true;
            break;
          }
        }
      }

      // Issue PLANNING receipt to promote from PROPOSED → PLANNING
      const now = new Date().toISOString();
      upsertPlan({
        id: args.planNumber,
        file_name: plan.file_name,
        title: newTitle,
        project: plan.project,
        goal: newGoal,
        content: '',
        files_affected: plan.files_affected,
        acceptance_criteria: plan.acceptance_criteria,
        dependencies: plan.dependencies,
        prompt_ref: plan.prompt_ref || '',
        created_at: plan.created_at,
        updated_at: now,
      });

      const receiptId = crypto.randomUUID();
      insertReceipt({
        id: receiptId,
        plan_id: args.planNumber,
        type: 'PLANNING',
        agent_role: 'planner',
        session_id: '',
        ticket_id: null,
        artifact_path: null,
        summary: 'Promoted from proposed to planning',
        metadata_json: JSON.stringify({ promoted: true }),
        tokens_used: 0,
        created_at: now,
      });
      checkpointWal();

      if (emitter) {
        emitter({
          type: 'plan_state_changed',
          data: {
            planNumber: args.planNumber,
            planTitle: newTitle,
            receiptType: 'PLANNING',
            agentRole: 'planner',
            newDerivedStatus: 'PLANNING',
            timestamp: now,
          },
        });
      }

      return {
        promoted: true,
        planNumber: args.planNumber,
        newStatus: 'planning',
        fileMoved: movedFile,
        timestamp: now,
      };
    },

    unblock_plan: async (args: { planNumber: string }) => {
      const errs = validate(args, [
        { field: 'planNumber', type: 'string', required: true },
      ]);
      if (errs.length > 0) throw createError('INVALID_ARGUMENTS', 'Validation failed', errs);

      // Find the plan
      const plan = getPlan(args.planNumber);
      if (!plan) {
        throw createError('PLAN_NOT_FOUND', `Plan ${args.planNumber} not found`, null);
      }

      const now = new Date().toISOString();

      // Delete all BLOCK / PLAN_BLOCK receipts
      const deleted = deleteReceiptsByPlanAndType(args.planNumber, ['BLOCK', 'PLAN_BLOCK']);
      console.log(`[${now}] unblock_plan: deleted ${deleted} BLOCK/PLAN_BLOCK receipts for plan ${args.planNumber}`);

      // Issue a PLAN_CREATE receipt (moves plan back to pending)
      const receiptId = crypto.randomUUID();
      const ticketId = createTicketIfMissing(
        args.planNumber,
        'planner',
        receiptId,
        now,
        plan.title,
        '',
        'planner',
      );
      if (ticketId) {
        console.log(`[${now}] unblock_plan: bootstrapped planner ticket ${ticketId} for plan ${args.planNumber}`);
      }
      insertReceipt({
        id: receiptId,
        plan_id: args.planNumber,
        type: 'PLAN_CREATE',
        agent_role: 'planner',
        session_id: '',
        ticket_id: ticketId,
        artifact_path: null,
        summary: `Unblocked: ${plan.title}`,
        metadata_json: JSON.stringify({ unblocked: true }),
        tokens_used: 0,
        created_at: now,
      });

      checkpointWal();

      // Remove from watcher's in-memory cache so it rescans
      watcher.removePlanFromMemory(args.planNumber);

      // ── Move plan file from blocked/ to pending/ on disk ──
      // Without this, the PlanWatcher's chokidar watcher re-adds the plan
      // from the blocked/ directory, causing a reconciliation mismatch.
      const implDir = path.join(watcher.baseDir, 'IMPLEMENTATION_PLANS');
      const blockedDir = path.join(implDir, 'blocked');
      const pendingDir = path.join(implDir, 'pending');
      let fileMoved = false;
      if (fs.existsSync(blockedDir)) {
        for (const file of fs.readdirSync(blockedDir)) {
          if (!file.endsWith('.md') || file === '.gitkeep') continue;
          const filePath = path.join(blockedDir, file);
          const planMatch = file.match(/v(\d+)/) || file.match(/^(\d{4})-/);
          if (planMatch && (planMatch[1] === args.planNumber || planMatch[1].padStart(4, '0') === args.planNumber)) {
            if (!fs.existsSync(pendingDir)) fs.mkdirSync(pendingDir, { recursive: true });
            fs.renameSync(filePath, path.join(pendingDir, file));
            fileMoved = true;
            console.log(`[${now}] unblock_plan: moved ${file} from blocked/ to pending/`);
            break;
          }
        }
      }

      // Cancel any orphaned tickets so the plan gets fresh tickets
      const ticketsCancelled = cancelTicketsByPlan(args.planNumber, 'plan_unblocked');
      if (ticketsCancelled > 0) {
        console.log(`[${now}] unblock_plan: cancelled ${ticketsCancelled} orphaned tickets for plan ${args.planNumber}`);
      }

      // SSE: notify clients
      if (emitter) {
        emitter({
          type: 'plan_state_changed',
          data: {
            planNumber: args.planNumber,
            planTitle: plan.title,
            receiptType: 'PLAN_CREATE',
            agentRole: 'planner',
            newDerivedStatus: 'PLAN_CREATE',
            timestamp: now,
          },
        });
      }

      return {
        unblocked: true,
        planNumber: args.planNumber,
        deletedBlockReceipts: deleted,
        fileMoved,
        ticketsCancelled,
        newStatus: 'pending',
        timestamp: now,
      };
    },
  };
}

/** Parse a plan file to extract just the plan number (lightweight). */
function tryParsePlanFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/\*\*Plan Number:\*\*\s*(\S+)/);
    if (match) return match[1];
    const nameMatch = filePath.match(/(?:^|\/)(\d{4})-/);
    if (nameMatch) return nameMatch[1];
  } catch { /* skip */ }
  return null;
}
