"""
Auditor — Layer-1 typed claim extraction from conversation transcripts.

Reads raw transcript source_observations (canonical asset kind 'transcript'),
uses an LLM to extract typed claims (file_change, api_change, bug_fix,
design_decision, tradeoff, blocker), and writes them to the semantics schema
(evidence_item + statement_evidence) with origin 'claim_extracted' and
verification_state 'candidate'. Confirmation is the owning role's job.

Usage:
    python -m auditor.main [--role auditor] [--limit N] [--dry-run]

Environment:
    AUDITOR_PG_DSN      PostgreSQL DSN (default: conduit's DSN)
    TACKLE_MCP_URL      tackle-mcp URL for LLM config resolution
"""

__version__ = "0.1.0"
