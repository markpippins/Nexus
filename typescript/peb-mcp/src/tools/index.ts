import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PebApiClient } from "../api/apiClient.js";

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

}
