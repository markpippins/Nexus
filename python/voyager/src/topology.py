import logging
from typing import List, Dict
from models import FileObservation, DirectoryObservation, TopologySignal
from voyager_envelope_adapter import create_envelope, CanonicalEnvelope
from publisher import Publisher

class TopologyEngine:
    def __init__(self, publisher: Publisher):
        self.publisher = publisher
        self.directory_history: Dict[str, Dict[str, str]] = {}
        self.staged_members: Dict[str, Dict[str, str]] = {}
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
        self._stage(parent_path, name, observation.observation_id)

    async def record_active(self, observation_id: str, path: str):
        import os
        name = os.path.basename(path)
        dir_path = os.path.dirname(path)
        self._stage(dir_path, name, observation_id)

    def restage_skipped_subtrees(self):
        for dir_path, members in self.directory_history.items():
            if dir_path not in self.staged_members:
                self.staged_members[dir_path] = members.copy()

    def prune_history(self, existing_paths: set):
        if not existing_paths:
            return
        gone = [p for p in self.directory_history if p not in existing_paths]
        for p in gone:
            del self.directory_history[p]
        if gone:
            logging.info("prune_history: dropped %d stale dir(s) from directory_history", len(gone))

    def _stage(self, dir_path: str, name: str, obs_id: str):
        if dir_path not in self.staged_members:
            self.staged_members[dir_path] = {}
        self.staged_members[dir_path][name] = obs_id

    def compute_signals(self):
        self.pending_signals.clear()
        
        vanished_dirs = set(self.directory_history.keys()) - set(self.staged_members.keys())
        for dir_path in vanished_dirs:
            if dir_path == "": continue
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

        for dir_path, members in self.staged_members.items():
            prev_members = self.directory_history.get(dir_path, {})
            
            added = set(members.keys()) - set(prev_members.keys())
            removed = set(prev_members.keys()) - set(members.keys())
            
            changed = [
                name for name in members.keys() & prev_members.keys()
                if members[name] != prev_members[name]
            ]
            
            current_obs_ids = list(members.values())

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
            
            self.directory_history[dir_path] = members.copy()
        
        self.staged_members.clear()

    async def emit_signals(self):
        for envelope in self.pending_signals:
            signal_id = envelope.payload.get("signal_id", "unknown")
            await self.publisher.publish(f"nexus.fs.v1.topology.{signal_id}", envelope)
        self.pending_signals.clear()

    async def emit_topology(self):
        self.compute_signals()
        await self.emit_signals()
