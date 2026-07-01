-- Migration 011: Real PEB policy rules — ported from Java to kernel
--
-- Ports three actual PEB invariants from PebViolationEngine.java and
-- implicit architecture conventions into kernel.policy_rule entries.
-- These demonstrate the porting pipeline: Java code → compiled_sql
-- predicate → trigger enforcement.
--
-- Rules added:
--   1. violation.type_required  (policy.violated — from PebViolationEngine.ingest())
--   2. violation.severity_required (policy.violated — from PebViolationEngine.ingest())
--   3. intent.archived_by_architect (intent.archived — implicit architecture rule)
--
-- Depends on: migration 010 (kernel.policy_rule table, trg_authorize_transition)
-- ====================================================================

-- ═══════════════════════════════════════════════════════════════════════
--  Rule 1: Violation type is required
-- ═══════════════════════════════════════════════════════════════════════
-- Source: PebViolationEngine.java line 76-78
--   if (vTypeNode == null || !vTypeNode.isTextual()) {
--       throw new MalformedAdmissionRequestException(
--           "peb_report_violation requires a textual 'violation_type' field");
--   }
-- The kernel equivalent of peb_report_violation is policy.violated.
-- This rule enforces the same invariant at the kernel level.

INSERT INTO kernel.policy_rule (
    rule_name, priority, event_type, cue_source, compiled_sql, deny_reason, created_by
) VALUES (
    'violation.type_required',
    90,
    'policy.violated',
    '// Ported from PebViolationEngine.ingest() — violation_type is required
     // Jira: not tracked (PEB parity)
     violation_type_required: true,
     if: event_type == "policy.violated" {
         payload: {
             violation_type: string
         }
     }',
    '($1).payload->>''violation_type'' IS NOT NULL AND length(trim(($1).payload->>''violation_type'')) > 0',
    'policy.violated events must include a violation_type in their payload',
    'peb'
) ON CONFLICT (rule_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  Rule 2: Severity is required
-- ═══════════════════════════════════════════════════════════════════════
-- Source: PebViolationEngine.java line 80-82
--   if (vSevNode == null || !vSevNode.isTextual()) {
--       throw new MalformedAdmissionRequestException(
--           "peb_report_violation requires a textual 'severity' field");
--   }

INSERT INTO kernel.policy_rule (
    rule_name, priority, event_type, cue_source, compiled_sql, deny_reason, created_by
) VALUES (
    'violation.severity_required',
    91,
    'policy.violated',
    '// Ported from PebViolationEngine.ingest() — severity is required
     severity_required: true,
     if: event_type == "policy.violated" {
         payload: {
             severity: string
         }
     }',
    '($1).payload->>''severity'' IS NOT NULL AND length(trim(($1).payload->>''severity'')) > 0',
    'policy.violated events must include a severity in their payload',
    'peb'
) ON CONFLICT (rule_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  Rule 3: Intent archiving requires architect authority
-- ═══════════════════════════════════════════════════════════════════════
-- Source: Implicit architecture convention — intent lifecycle ownership.
-- Intent is the root aggregate; archiving it changes the canonical
-- objective state. Only the architect role should have this authority.
-- This demonstrates role-based access control in the kernel.

INSERT INTO kernel.policy_rule (
    rule_name, priority, event_type, cue_source, compiled_sql, deny_reason, created_by
) VALUES (
    'intent.archived_by_architect',
    150,
    'intent.archived',
    '// Only architect role may archive intents
     // Intent is the root aggregate — archiving changes canonical state.
     intent_archived_authority: "architect",
     if: event_type == "intent.archived" {
         authority: "architect"
     }',
    '($1).authority = ''architect''',
    'Only the architect role can archive intents',
    'architect'
) ON CONFLICT (rule_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  Verify
-- ═══════════════════════════════════════════════════════════════════════

SELECT rule_name, event_type::TEXT, priority, deny_reason, created_by
FROM kernel.policy_rule
WHERE rule_name IN ('violation.type_required', 'violation.severity_required', 'intent.archived_by_architect')
ORDER BY priority;
