from dataclasses import dataclass, field
from typing import List, Dict, Any
import hashlib
from graph_models import IR_EventEnvelope, EnvelopeProvenance

@dataclass
class TranscriptSegment:
    speaker: str
    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class RawTranscript:
    session_id: str
    segments: List[TranscriptSegment]

class IngestionCompiler:
    """Layer XII: Transcript to Event Envelope Compiler"""
    
    @staticmethod
    def compile(transcript: RawTranscript) -> List[IR_EventEnvelope]:
        """Translates unordered observations into causal events without semantic interpretation."""
        envelopes = []
        for i, segment in enumerate(transcript.segments):
            # 1. Structural Actor Resolution
            actor_id = segment.speaker if segment.speaker else "unknown_actor"
            
            # 2. Structural Dependency Inference (from explicit metadata only)
            read_set = segment.metadata.get("explicit_reads", [])
            write_set = segment.metadata.get("explicit_writes", [])
            
            # 3. Deterministic Hashing
            struct_data = f"{transcript.session_id}|{i}|{actor_id}|{read_set}|{write_set}"
            event_id = hashlib.sha256(struct_data.encode('utf-8')).hexdigest()
            
            # 4. Partial Info Handling: missing fields are not guessed
            provenance = EnvelopeProvenance(
                origin_archetype="TRANSCRIPT_INGESTION",
                origin_event_id=f"seq_{i}",
                origin_component="IngestionCompiler",
                timestamp=segment.metadata.get("timestamp", str(i))
            )
            
            env = IR_EventEnvelope(
                envelope_id=event_id,
                execution_universe=None,
                transition=None,
                inputs={"payload": segment.text, "read_set": read_set, "write_set": write_set},
                provenance=provenance,
                policy_reference=None,
                determinism=None,
                replay=None
            )
            
            env.trajectory_id = transcript.session_id
            env.timestep_msg_id = event_id
            envelopes.append(env)
            
        return envelopes
