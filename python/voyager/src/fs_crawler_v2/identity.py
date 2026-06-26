import logging
import uuid
from typing import Dict, List, Any
from .models import FileObservation, DirectoryObservation, TopologySignal, ObservationEdgeHint, IdentityCandidate, Entity, PhysicalFingerprint, EntityDrift
from .voyager_envelope_adapter import create_envelope, CanonicalEnvelope
from .publisher import Publisher

class IdentityEngine:
    """
    Identity Engine: Resolves observations into stable Entities.
    Strictly uses physical and structural invariants.
    """
    def __init__(self, publisher: Publisher):
        self.publisher = publisher.scoped("identity")
        # observation_id -> entity_id
        self.obs_registry: Dict[str, str] = {}
        # entity_id -> Entity
        self.entities: Dict[str, Entity] = {}
        # Physical Fingerprint map for quick continuity (exact match)
        self.fingerprint_map: Dict[tuple, str] = {} # fingerprint tuple -> entity_id
        # Inode map for drift detection (same file, different state)
        self.inode_map: Dict[tuple, str] = {} # (device_id, inode) -> entity_id
        # Last known fingerprint per entity to calculate deltas
        self.entity_states: Dict[str, PhysicalFingerprint] = {}

    async def handle_observation(self, envelope: CanonicalEnvelope):
        payload = envelope.payload
        obs_id = payload.get("observation_id")
        path = payload.get("path")
        
        # 1. Extract Physical Fingerprint
        if envelope.event_type == "FileObservation":
            obs = FileObservation(**payload)
            fingerprint = PhysicalFingerprint(
                device_id=obs.device_id,
                inode=obs.inode,
                size=obs.size,
                mtime=obs.mtime
            )
        else:
            obs = DirectoryObservation(**payload)
            # Directories use a reduced fingerprint (no size/mtime)
            fingerprint = PhysicalFingerprint(
                device_id=obs.device_id,
                inode=obs.inode,
                size=0,
                mtime="0"
            )
        
        fp_key = fingerprint.to_key()
        inode_key = (fingerprint.device_id, fingerprint.inode)
        
        # 2. Physical Continuity (Fingerprint match)
        entity_id = self.fingerprint_map.get(fp_key)
        
        if not entity_id:
            # 3. Drift Detection (Inode match but fingerprint mismatch)
            entity_id = self.inode_map.get(inode_key)
            if entity_id:
                # Detected drift
                old_fp = self.entity_states[entity_id]
                delta = {}
                if old_fp.size != fingerprint.size:
                    delta["size"] = {"old": old_fp.size, "new": fingerprint.size}
                if old_fp.mtime != fingerprint.mtime:
                    delta["mtime"] = {"old": old_fp.mtime, "new": fingerprint.mtime}
                
                magnitude = self._calculate_drift_magnitude(old_fp, fingerprint)
                logging.info(f"Identity: {magnitude} drift detected for {path} -> {entity_id}: {delta}")
                
                # Update state
                self.entity_states[entity_id] = fingerprint
                self.fingerprint_map[fp_key] = entity_id
                
                # Update Entity metadata
                entity = self.entities[entity_id]
                entity.canonical_observations.append(obs_id)
                entity.lineage["transformation_chain"].append({
                    "type": "drift",
                    "delta": delta,
                    "timestamp": envelope.occurred_at
                })
                
                # Emit Drift event
                await self.publisher.publish(
                    f"nexus.identity.v1.drift.{entity_id}",
                    create_envelope(
                        origin_layer="identity",
                        event_type="EntityDrift",
                        epoch_id=envelope.epoch_id,
                        source_event_ids=[envelope.event_id],
                        correlation_id=envelope.correlation_id,
                        payload=EntityDrift(
                            entity_id=entity_id,
                            observation_id=obs_id,
                            delta=delta,
                            magnitude=magnitude,
                            confidence=0.9
                        ).model_dump()
                    )
                )
            else:
                # 4. New Entity hypothesis
                entity_id = str(uuid.uuid4())
                self.entities[entity_id] = Entity(
                    entity_id=entity_id,
                    canonical_observations=[obs_id],
                    lineage={"root_observation": obs_id, "transformation_chain": []},
                    stability_score=0.5
                )
                self.fingerprint_map[fp_key] = entity_id
                self.inode_map[inode_key] = entity_id
                self.entity_states[entity_id] = fingerprint
                logging.info(f"Identity: New entity created for {path}: {entity_id}")
        else:
            # Continuity detected
            entity = self.entities[entity_id]
            if obs_id not in entity.canonical_observations:
                entity.canonical_observations.append(obs_id)
                entity.stability_score = min(1.0, entity.stability_score + 0.1)
                logging.info(f"Identity: Continuity resolved for {path} -> {entity_id}")

        self.obs_registry[obs_id] = entity_id
        
        # Emit Entity event
        await self.publisher.publish(
            f"nexus.identity.v1.entity.{entity_id}",
            create_envelope(
                origin_layer="identity",
                event_type="Entity",
                epoch_id=envelope.epoch_id,
                source_event_ids=[envelope.event_id],
                correlation_id=envelope.correlation_id,
                payload=self.entities[entity_id].model_dump()
            )
        )

    def _calculate_drift_magnitude(self, old_fp: PhysicalFingerprint, new_fp: PhysicalFingerprint) -> str:
        """Classifies the physical magnitude of drift."""
        if old_fp.size == 0:
            return "MASSIVE" if new_fp.size > 0 else "TRACE"
            
        size_diff = abs(new_fp.size - old_fp.size)
        percent_change = (size_diff / old_fp.size) * 100
        
        if percent_change == 0:
            return "TRACE" # only mtime changed
        elif percent_change < 5:
            return "MINOR"
        elif percent_change < 25:
            return "MAJOR"
        else:
            return "MASSIVE"

    async def handle_topology(self, envelope: CanonicalEnvelope):
        signal = TopologySignal(**envelope.payload)
        # Identity consumes topology to strengthen continuity hypotheses
        # e.g. if files in a directory move together, increase stability_score
        if signal.structure["type"] == "evolution":
            logging.info(f"Identity: Strengthening candidates based on topology evolution at {signal.geometry.get('path')}")
            # ... structural logic here ...

    async def handle_hint(self, envelope: CanonicalEnvelope):
        hint = ObservationEdgeHint(**envelope.payload)
        # Hints from crawler help bootstrap candidates
        candidate = IdentityCandidate(
            observation_ids=hint.observation_ids,
            evidence=hint.evidence,
            confidence=0.8
        )
        await self.publisher.publish(
            "nexus.identity.v1.candidate",
            create_envelope(
                origin_layer="identity",
                event_type="IdentityCandidate",
                epoch_id=envelope.epoch_id,
                source_event_ids=hint.observation_ids,
                correlation_id=envelope.correlation_id,
                payload=candidate.model_dump()
            )
        )
