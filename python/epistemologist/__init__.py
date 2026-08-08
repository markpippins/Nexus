"""
Epistemologist — Layer-2 concept/relationship/evidence extraction on audit data.

Reads source_observations produced by the Auditor, uses an LLM to extract
typed concepts, relationships, and evidence, and writes them to the
semantics schema (concept, concept_relationship, evidence_item,
statement_evidence).

Usage:
    python -m epistemologist.main [--role epistemologist] [--limit N] [--dry-run]
"""

__version__ = "0.1.0"
