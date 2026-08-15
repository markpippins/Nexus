/**
 * Evidence Link Type Taxonomy v0.1 — ported from
 * nexus/typescript/nebula-srv/src/evidence-link-types.ts (Wave 3.1).
 * Valid link_type values for knowledge.evidence_links.
 */

export enum EvidenceLinkType {
  SUPPORTS      = "supports",
  REFINES       = "refines",
  INSTANTIATES  = "instantiates",
  CONTRADICTS   = "contradicts",
  SUPERSEDES    = "supersedes",
  MENTIONS      = "mentions",
  INFORMS       = "informs",
  VALIDATES     = "validates",
}

export const ALL_EVIDENCE_LINK_TYPES: readonly string[] = Object.values(EvidenceLinkType)

export const EVIDENCE_LINK_TYPE_DESCRIPTIONS: Record<string, string> = {
  [EvidenceLinkType.SUPPORTS]:
    "Entity is supported by the evidence. The evidence corroborates or confirms the entity's claims.",
  [EvidenceLinkType.REFINES]:
    "Evidence refines/elaborates entity details. Provides richer or more precise information.",
  [EvidenceLinkType.INSTANTIATES]:
    "Evidence is a concrete instance of the entity concept. The entity is abstract; the evidence shows a real-world example.",
  [EvidenceLinkType.CONTRADICTS]:
    "Evidence contradicts the entity. Disagrees with or undermines the entity's claims.",
  [EvidenceLinkType.SUPERSEDES]:
    "This evidence supersedes older evidence for this entity. A newer or more authoritative source.",
  [EvidenceLinkType.MENTIONS]:
    "Evidence mentions the entity (weakest link). The entity is referenced but not elaborated.",
  [EvidenceLinkType.INFORMS]:
    "Evidence informs entity definition without directly supporting or contradicting it. Contextual or background information.",
  [EvidenceLinkType.VALIDATES]:
    "Evidence validates entity correctness. Typically used for verified/factual entities.",
}

export function isValidEvidenceLinkType(value: string): value is EvidenceLinkType {
  return ALL_EVIDENCE_LINK_TYPES.includes(value)
}

export const EVIDENCE_PROVENANCE_VALUES = [
  "auto_ingestor",
  "manual",
  "reconciler",
  "llm_extracted",
  "migration",
] as const

export type EvidenceProvenance = typeof EVIDENCE_PROVENANCE_VALUES[number]

export function isValidProvenance(value: string): value is EvidenceProvenance {
  return (EVIDENCE_PROVENANCE_VALUES as readonly string[]).includes(value)
}

export const DEFAULT_PROVENANCE: EvidenceProvenance = "auto_ingestor"
