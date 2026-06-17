import logging
from typing import List, Dict
from .models import Entity, TopologySignal, MetadataSpanEmitted, RequirementCandidate, EntityDrift
from .voyager_envelope_adapter import create_envelope, CanonicalEnvelope
from .publisher import Publisher

class LOSMEngine:
    """
    LOSM (Semantic Layer): Consumes Entities, Topology, and Spans.
    Emits RequirementCandidates.
    Blind to raw FileObservations and physical invariants.
    """
    def __init__(self, publisher: Publisher):
        self.publisher = publisher.scoped("losm")
        # entity_id -> data accumulation
        self.entity_data: Dict[str, List[MetadataSpanEmitted]] = {}
        # Simple obs_id -> entity_id map for provenance in this stub
        self.obs_to_entity: Dict[str, str] = {}
        
        # 1. Magnitude -> Semantic Impact (Inference)
        # LOSM decides how significant a physical change is.
        # This could later depend on Entity type or context.
        self.impact_assessment = {
            "TRACE": "LOW",
            "MINOR": "MEDIUM",
            "MAJOR": "HIGH",
            "MASSIVE": "CRITICAL"
        }
        
        # 2. Semantic Impact -> Action Policy (Governance)
        # LOSM decides the system's reaction to the semantic impact.
        self.action_policy = {
            "LOW": "IGNORE",
            "MEDIUM": "EVALUATE",
            "HIGH": "REPROCESS",
            "CRITICAL": "INVALIDATE"
        }

    async def handle_entity(self, envelope: CanonicalEnvelope):
        entity = Entity(**envelope.payload)
        logging.info(f"LOSM: Tracking semantic entity {entity.entity_id}")
        if entity.entity_id not in self.entity_data:
            self.entity_data[entity.entity_id] = []
        # Accumulate observation to entity mapping
        for obs_id in entity.canonical_observations:
            self.obs_to_entity[obs_id] = entity.entity_id

    async def handle_drift(self, envelope: CanonicalEnvelope):
        drift = EntityDrift(**envelope.payload)
        
        # Stage 1: Assessment (Context-aware interpretation)
        impact = self.impact_assessment.get(drift.magnitude, "MEDIUM")
        
        # Stage 2: Policy (Governance decision)
        action = self.action_policy.get(impact, "EVALUATE")
        
        logging.info(f"LOSM: Physical {drift.magnitude} drift detected for entity {drift.entity_id}. "
                     f"Inferred Impact: {impact}. Semantic Action: {action}")
        
        if action == "IGNORE":
            return
        
        if action == "INVALIDATE":
            logging.info(f"LOSM: Invalidating all requirements derived from entity {drift.entity_id}")
            # ... logic to mark derived requirements as stale ...
            return

        # For EVALUATE/REPROCESS, we signal re-evaluation
        logging.info(f"LOSM: Re-evaluating semantic requirements for entity {drift.entity_id} "
                     f"due to {impact} semantic impact.")

    async def handle_topology(self, envelope: CanonicalEnvelope):
        signal = TopologySignal(**envelope.payload)
        # LOSM uses topology to infer context (e.g. "this is a project structure")
        logging.info(f"LOSM: Interpreting topology signal {signal.structure.get('type')} as context")

    async def handle_span(self, envelope: CanonicalEnvelope):
        span_emitted = MetadataSpanEmitted(**envelope.payload)
        obs_id = span_emitted.observation_id
        entity_id = self.obs_to_entity.get(obs_id)
        logging.info(f"LOSM: Processing span from observation {obs_id} (entity: {entity_id})")
        
        # Stub: Generate a RequirementCandidate if we see "Requirement" in text
        if "requirement" in span_emitted.span.text.lower():
            if not entity_id:
                logging.warning(f"LOSM: No entity resolved for observation {obs_id}, skipping requirement")
                return

            candidate = RequirementCandidate(
                text=f"Derived requirement: {span_emitted.span.text}",
                provenance=[entity_id], # Canonical provenance is now Entity
                confidence=0.9
            )
            
            await self.publisher.publish(
                "nexus.losm.v1.requirement",
                create_envelope(
                    origin_layer="losm",
                    event_type="RequirementCandidate",
                    epoch_id=envelope.epoch_id,
                    source_event_ids=[entity_id, envelope.event_id],
                    correlation_id=envelope.correlation_id,
                    payload=candidate.model_dump()
                )
            )
