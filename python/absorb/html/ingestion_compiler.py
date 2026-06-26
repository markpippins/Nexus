from dataclasses import dataclass, field
from typing import List, Dict, Any, Literal, Set, Optional
import hashlib
from graph_models import IR_v2_EventEnvelope, EnvelopeProvenance, ExecutionUniverse, EnvelopeTransition, EnvelopePolicyReference, EnvelopeDeterminism, EnvelopeReplay

@dataclass
class TranscriptSegment:
    segment_id: str
    speaker: str
    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ISGRule:
    id: str
    match_type: Literal["prefix", "suffix", "contains", "exact"]
    pattern: str
    label: str
    strength: Literal["strong", "weak", "neutral"]

@dataclass
class ISGMetadata:
    isg_version: str
    labels: Set[str] = field(default_factory=set)
    matched_rules: Set[str] = field(default_factory=set)
    assent_flag: bool = False
    partial_assent_flag: bool = False

@dataclass
class AnnotatedSegment:
    segment_id: str
    speaker: str
    text: str
    isg_metadata: ISGMetadata
    metadata: Dict[str, Any] = field(default_factory=dict)

class ISGEngine:
    """Layer XII.5: Interaction Semantic Gating Filter"""
    def __init__(self, version: str, rules: List[ISGRule]):
        self.version = version
        self.rules = rules

    def evaluate(self, segment: TranscriptSegment) -> AnnotatedSegment:
        matches = []
        for rule in self.rules:
            if rule.match_type == "prefix" and segment.text.startswith(rule.pattern):
                matches.append(rule)
            elif rule.match_type == "suffix" and segment.text.endswith(rule.pattern):
                matches.append(rule)
            elif rule.match_type == "contains" and rule.pattern in segment.text:
                matches.append(rule)
            elif rule.match_type == "exact" and segment.text == rule.pattern:
                matches.append(rule)

        isg_meta = ISGMetadata(
            isg_version=self.version,
            labels={r.label for r in matches},
            matched_rules={r.id for r in matches},
            assent_flag=any(r.label == "assent" for r in matches),
            partial_assent_flag=any(r.label == "partial_assent" for r in matches)
        )
        return AnnotatedSegment(
            segment_id=segment.segment_id,
            speaker=segment.speaker,
            text=segment.text,
            isg_metadata=isg_meta,
            metadata=segment.metadata
        )

@dataclass
class RawTranscript:
    session_id: str
    segments: List[TranscriptSegment]

class IngestionCompiler:
    """Layer XII: Transcript to Event Envelope Compiler"""
    
    def __init__(self, isg_engine: Optional[ISGEngine] = None):
        self.isg_engine = isg_engine
    
    def compile(self, transcript: RawTranscript) -> List[IR_v2_EventEnvelope]:
        """Translates unordered observations into causal events without semantic interpretation."""
        envelopes = []
        for i, segment in enumerate(transcript.segments):
            
            # ISG Pipeline Layer (Layer XII.5)
            if self.isg_engine:
                annotated = self.isg_engine.evaluate(segment)
            else:
                annotated = AnnotatedSegment(
                    segment_id=segment.segment_id,
                    speaker=segment.speaker,
                    text=segment.text,
                    isg_metadata=ISGMetadata(isg_version="none"),
                    metadata=segment.metadata
                )
                
            # 1. Structural Actor Resolution
            actor_id = annotated.speaker if annotated.speaker else "unknown_actor"
            
            # 2. Structural Dependency Inference (from explicit metadata only)
            read_set = annotated.metadata.get("explicit_reads", [])
            write_set = annotated.metadata.get("explicit_writes", [])
            
            # 3. Deterministic Hashing (ISG Metadata explicitly excluded)
            struct_data = f"{transcript.session_id}|{i}|{actor_id}|{read_set}|{write_set}"
            event_id = hashlib.sha256(struct_data.encode('utf-8')).hexdigest()
            
            # 4. Partial Info Handling: missing fields are not guessed
            provenance = EnvelopeProvenance(
                origin_archetype="TRANSCRIPT_INGESTION",
                origin_event_id=annotated.segment_id,
                origin_component="IngestionCompiler",
                timestamp=annotated.metadata.get("timestamp", str(i))
            )
            
            env = IR_v2_EventEnvelope(
                envelope_id=event_id,
                execution_universe=ExecutionUniverse(universe_id=transcript.session_id, ir_schema_version="v2", synthesizer_version="v1", policy_version="v1", fsm_version="v1"),
                transition=EnvelopeTransition(from_state="start", to_state="end", transition_type="linear"),
                inputs={"payload": annotated.text, "read_set": read_set, "write_set": write_set, "isg": annotated.isg_metadata},
                provenance=provenance,
                policy_reference=EnvelopePolicyReference(policy_set_id="default", policy_snapshot_hash="hash"),
                determinism=EnvelopeDeterminism(input_hash="hash", dependency_hash="hash"),
                replay=EnvelopeReplay(expected_state="end", invariant_checks=[])
            )
            
            envelopes.append(env)
            
        return envelopes
