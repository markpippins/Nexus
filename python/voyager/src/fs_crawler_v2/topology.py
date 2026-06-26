import logging
from typing import List, Dict
from .models import FileObservation, DirectoryObservation, TopologySignal
from .voyager_envelope_adapter import create_envelope, CanonicalEnvelope
from .publisher import Publisher

class TopologyEngine:
    def __init__(self, publisher: Publisher):
        self.publisher = publisher
        # dir_path -> { member_name: obs_id } (persistent state)
        self.directory_history: Dict[str, Dict[str, str]] = {}
        # staged for the current scan cycle
        self.staged_members: Dict[str, Dict[str, str]] = {}
        # signals computed but not yet emitted
        self.pending_signals: List[CanonicalEnvelope] = []
        self.current_epoch: str = None

    def set_epoch(self, epoch_id: str):
        self.current_epoch = epoch_id

    async def record_observation(self, observation: FileObservation):
        import os
        name = os.path.basename(observation.path)
        dir_path = os.path.dirname(observation.path)
        self._stage(dir_path, name, observation.observation_id)

    async def record_directory(self, observation: DirectoryObservation):
        import os
        name = os.path.basename(observation.path)
        parent_path = os.path.dirname(observation.path)
        # Even root directories can be recorded
        self._stage(parent_path, name, observation.observation_id)

    async def record_active(self, observation_id: str, path: str):
        import os
        name = os.path.basename(path)
        dir_path = os.path.dirname(path)
        self._stage(dir_path, name, observation_id)

    def _stage(self, dir_path: str, name: str, obs_id: str):
        if dir_path not in self.staged_members:
            self.staged_members[dir_path] = {}
        self.staged_members[dir_path][name] = obs_id

    def compute_signals(self):
        """Analyzes staged members vs history to detect structural patterns."""
        self.pending_signals.clear()
        
        # 1. Detect Vanished Directories
        # If a directory was in history but is not in staged_members at all,
        # it might have been deleted or moved.
        vanished_dirs = set(self.directory_history.keys()) - set(self.staged_members.keys())
        for dir_path in vanished_dirs:
            if dir_path == "": continue # skip virtual root
            # Note: We emit a signal that the directory structure is gone
            self.pending_signals.append(create_envelope(
                origin_layer="topology",
                event_type="TopologySignal",
                epoch_id=self.current_epoch,
                payload=TopologySignal(
                    observation_ids=[],
                    structure={"type": "vanishing", "scope": "directory"},
                    geometry={"path": dir_path, "status": "missing_from_scan"}
                ).model_dump()
            ))

        # 2. Detect Evolution and Containment in Active Directories
        for dir_path, members in self.staged_members.items():
            prev_members = self.directory_history.get(dir_path, {})
            
            # Structural Delta based on member names (structural handles)
            added = set(members.keys()) - set(prev_members.keys())
            removed = set(prev_members.keys()) - set(members.keys())
            
            # Detect changed members (same name, different obs_id)
            # This is a structural hint that a member's state evolved
            changed = [
                name for name in members.keys() & prev_members.keys()
                if members[name] != prev_members[name]
            ]
            
            # Use current obs_ids for the signal's observation context
            current_obs_ids = list(members.values())

            # Evolution Signal (only if structure changed)
            if added or removed or changed:
                evolution_signal = TopologySignal(
                    observation_ids=current_obs_ids,
                    structure={"type": "evolution", "scope": "directory"},
                    geometry={
                        "path": dir_path,
                        "added_members": list(added),
                        "removed_members": list(removed),
                        "changed_members": list(changed)
                    }
                )
                self.pending_signals.append(create_envelope(
                    origin_layer="topology",
                    event_type="TopologySignal",
                    epoch_id=self.current_epoch,
                    source_event_ids=current_obs_ids,
                    payload=evolution_signal.model_dump()
                ))

            # Containment Signal (always emitted for active directories)
            containment_signal = TopologySignal(
                observation_ids=current_obs_ids,
                structure={"type": "containment", "scope": "directory"},
                geometry={"path": dir_path, "count": len(members)}
            )
            self.pending_signals.append(create_envelope(
                origin_layer="topology",
                event_type="TopologySignal",
                epoch_id=self.current_epoch,
                source_event_ids=current_obs_ids,
                payload=containment_signal.model_dump()
            ))

            # Adjacency Signal
            if len(members) > 1:
                adj_signal = TopologySignal(
                    observation_ids=current_obs_ids,
                    structure={"type": "adjacency", "scope": "file"},
                    geometry={"mode": "co-location", "dir_path": dir_path}
                )
                self.pending_signals.append(create_envelope(
                    origin_layer="topology",
                    event_type="TopologySignal",
                    epoch_id=self.current_epoch,
                    source_event_ids=current_obs_ids,
                    payload=adj_signal.model_dump()
                ))
            
            # Update history
            self.directory_history[dir_path] = members.copy()
        
        # Clear staged
        self.staged_members.clear()

    async def emit_signals(self):
        """Publishes all pending signals."""
        for envelope in self.pending_signals:
            # signal_id is in payload
            signal_id = envelope.payload.get("signal_id", "unknown")
            await self.publisher.publish(f"nexus.fs.v1.topology.{signal_id}", envelope)
        self.pending_signals.clear()

    async def emit_topology(self):
        """Deprecated/Legacy helper for single-pass emission."""
        self.compute_signals()
        await self.emit_signals()
