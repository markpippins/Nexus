import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PebApiClient } from "../api/apiClient.js";
import * as decisions from "../api/decisionsClient.js";

/**
 * Registers all PEB Governance Tools.
 */
export function registerTools(server: McpServer) {
  
  // 1. peb_validate_transition
  server.tool(
    "peb_validate_transition",
    "Check whether a WorkStatus transition is legal.",
    {
      entity_id: z.string().describe("Who is requesting"),
      from_state: z.string().describe("Current pipeline state (WorkStatus)"),
      to_state: z.string().describe("Desired next state (WorkStatus)")
    },
    async (args) => {
      const res = await PebApiClient.submitTransaction(args.entity_id, "peb_validate_transition", args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 2. peb_check_invariants
  server.tool(
    "peb_check_invariants",
    "Validate an action against hard laws + capabilities.",
    {
      entity_id: z.string(),
      proposed_action: z.any().describe("What the entity wants to do")
    },
    async (args) => {
      const res = await PebApiClient.submitTransaction(args.entity_id, "peb_check_invariants", args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 3. peb_record_decision
  server.tool(
    "peb_record_decision",
    "Append a decision. This is a state mutation - goes through full admission + transaction.",
    {
      entity_id: z.string(),
      title: z.string(),
      summary: z.any().describe("Structured rationale"),
      affected_keys: z.array(z.string()).describe("Which peb_state keys change"),
      entropy_class: z.enum(["collapser", "shaper", "neutral"]),
      commit_ref: z.string().nullable().optional()
    },
    async (args) => {
      const res = await PebApiClient.submitTransaction(args.entity_id, "peb_record_decision", args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 4. peb_validate_transform
  server.tool(
    "peb_validate_transform",
    "Validate a proposed Transform before execution (RGEM integration).",
    {
      entity_id: z.string(),
      state_view: z.any().describe("What the transform needs to see"),
      context: z.any().describe("{ rules, invariants, allowedTransforms, executionMode }"),
      proposed_delta: z.any().describe("What the transform will change"),
      work_request_id: z.string()
    },
    async (args) => {
      const res = await PebApiClient.submitTransaction(args.entity_id, "peb_validate_transform", args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 5. peb_report_violation
  server.tool(
    "peb_report_violation",
    "Route a detected violation. Bypasses admission invariant check.",
    {
      entity_id: z.string(),
      violation_type: z.enum(["authority_leakage", "state_dependency", "semantic_normalization", "rcl_violation", "transform_invalid"]),
      severity: z.enum(["hard", "soft"]),
      context: z.any().describe("Full request context"),
      capability_attempted: z.string().nullable().optional()
    },
    async (args) => {
      const res = await PebApiClient.submitTransaction(args.entity_id, "peb_report_violation", args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 6. peb_append_trace_segment
  server.tool(
    "peb_append_trace_segment",
    "Append an observational trace segment (never authoritative).",
    {
      entity_id: z.string(),
      work_request_id: z.string(),
      parent_trace_id: z.string().nullable().optional(),
      stage: z.string(),
      inputs: z.any(),
      causal_entries: z.any(),
      rejected_alternatives: z.any(),
      confidence: z.number().min(0).max(1)
    },
    async (args) => {
      const res = await PebApiClient.submitTransaction(args.entity_id, "peb_append_trace_segment", args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 7. peb_request_clarification
  server.tool(
    "peb_request_clarification",
    "Emit a REQUEST_FOR_CLARIFICATION when an agent lacks context.",
    {
      entity_id: z.string(),
      work_request_id: z.string(),
      ambiguity: z.string(),
      options_considered: z.any(),
      proposed_resolution: z.string().nullable().optional()
    },
    async (args) => {
      const res = await PebApiClient.submitTransaction(args.entity_id, "peb_request_clarification", args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 8. peb_extension_proposal
  server.tool(
    "peb_extension_proposal",
    "When PEB is silent on an issue, propose an extension.",
    {
      entity_id: z.string(),
      gap_description: z.string(),
      proposed_content: z.any(),
      target_key: z.string(),
      rationale: z.string()
    },
    async (args) => {
      const res = await PebApiClient.submitTransaction(args.entity_id, "peb_extension_proposal", args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 9. peb_get_state_hash
  server.tool(
    "peb_get_state_hash",
    "Read-only tool that returns current hashes without opening a transaction.",
    {},
    async () => {
      const res = await PebApiClient.getResource("hash");
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // ── Decision CRUD (peb-srv) ────────────────────────────────────────

  // 10. peb_list_decisions
  server.tool(
    "peb_list_decisions",
    "List architecture decisions from peb.decisions. Filterable by status, author, affected key.",
    {
      status: z.string().optional().describe("Filter by status (accepted, proposed, superseded, deprecated)"),
      author_id: z.string().optional().describe("Filter by author role or name"),
      adr_number: z.string().optional().describe("Filter by exact ADR number (e.g. ADR-001)"),
      affected_key: z.string().optional().describe("Filter by affected key (array overlap)"),
      limit: z.number().optional().describe("Max results (default 100, max 500)"),
      offset: z.number().optional().describe("Offset for pagination"),
    },
    async (args) => {
      const res = await decisions.listDecisions(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 11. peb_get_decision
  server.tool(
    "peb_get_decision",
    "Get a single architecture decision by ID or ADR number.",
    {
      id: z.string().describe("Decision UUID or ADR number (e.g. ADR-001)"),
    },
    async (args) => {
      // If it looks like an ADR number, search by that.
      if (/^ADR-\d{3}$/i.test(args.id)) {
        const res = await decisions.listDecisions({ adr_number: args.id.toUpperCase() });
        const found = res.decisions?.[0];
        if (!found) return { content: [{ type: "text", text: `No decision found for ${args.id}` }] };
        return { content: [{ type: "text", text: JSON.stringify(found, null, 2) }] };
      }
      const res = await decisions.getDecision(args.id);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 12. peb_create_decision
  server.tool(
    "peb_create_decision",
    "Create a new architecture decision record in peb.decisions. ADR number is auto-assigned if omitted.",
    {
      title: z.string().describe("Decision title"),
      author_id: z.string().describe("Author role or identifier"),
      summary: z.any().optional().describe("Structured summary: { context, decision, consequences }"),
      affected_keys: z.array(z.string()).optional().describe("Policy keys this decision constrains"),
      entropy_class: z.enum(["structural", "corrective", "policy"]).optional().describe("Change classification"),
      status: z.enum(["proposed", "accepted"]).optional().describe("Initial status (default: proposed)"),
      adr_number: z.string().optional().describe("Explicit ADR number (auto-assigned if omitted)"),
      parent_decision_id: z.string().optional().describe("UUID of parent decision (for supersession chain)"),
    },
    async (args) => {
      const res = await decisions.createDecision(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 13. peb_update_decision
  server.tool(
    "peb_update_decision",
    "Update an existing decision's status, summary, or affected keys.",
    {
      id: z.string().describe("Decision UUID"),
      title: z.string().optional().describe("New title"),
      status: z.enum(["proposed", "accepted", "superseded", "deprecated"]).optional().describe("New status"),
      summary: z.any().optional().describe("Updated structured summary"),
      affected_keys: z.array(z.string()).optional().describe("Updated affected keys"),
      entropy_class: z.string().optional().describe("Updated entropy class"),
    },
    async (args) => {
      const { id, ...opts } = args;
      const res = await decisions.updateDecision(id, opts);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 14. peb_supersede_decision
  server.tool(
    "peb_supersede_decision",
    "Supersede an existing decision. Creates a new ADR that replaces the old one, marking the old as 'superseded'.",
    {
      id: z.string().describe("UUID of the decision to supersede"),
      summary: z.any().describe("New decision summary explaining what changed and why"),
      author_id: z.string().describe("Author of the superseding decision"),
      title: z.string().optional().describe("Title for the new decision (default: auto-generated)"),
      affected_keys: z.array(z.string()).optional().describe("Affected keys (default: inherit from superseded)"),
    },
    async (args) => {
      const { id, ...opts } = args;
      const res = await decisions.supersedeDecision(id, opts);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 15. peb_get_decision_chain
  server.tool(
    "peb_get_decision_chain",
    "Walk the decision ancestry or rollback chain from a given decision.",
    {
      id: z.string().describe("Starting decision UUID"),
      direction: z.enum(["ancestry", "rollback"]).optional().describe("Walk direction (default: ancestry)"),
    },
    async (args) => {
      const res = await decisions.getDecisionChain(args.id, args.direction || 'ancestry');
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

  // 16. peb_next_adr_number
  server.tool(
    "peb_next_adr_number",
    "Get the next available ADR number.",
    {},
    async () => {
      const res = await decisions.getNextAdrNumber();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );

}
