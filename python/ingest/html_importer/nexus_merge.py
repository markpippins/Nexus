from typing import List, Tuple, Set, Optional, Dict
from dataclasses import dataclass
from nexus_vm import NexusVM
from graph_models import Timeline, InstructionRecord, ConflictType, TimelineMetadata

@dataclass
class ResolutionContext:
    base_state_hash: str
    path_a_metadata: TimelineMetadata
    path_b_metadata: TimelineMetadata
    lca_index: int

@dataclass
class ConflictGroup:
    target_overlap: set
    instructions_a: List[InstructionRecord]
    instructions_b: List[InstructionRecord]
    conflict_type: ConflictType

class MergeConflictException(Exception):
    def __init__(self, message: str, groups: List[ConflictGroup]):
        super().__init__(message)
        self.groups = groups

class ResolutionStrategy:
    def resolve(self, group: ConflictGroup, context: ResolutionContext) -> List[InstructionRecord]:
        raise NotImplementedError

class LastWriteWins(ResolutionStrategy):
    def resolve(self, group: ConflictGroup, context: ResolutionContext) -> List[InstructionRecord]:
        # Return sequence resolving the group mathematically. LWW appends B after A.
        return group.instructions_a + group.instructions_b

class CausalPriorityStrategy(ResolutionStrategy):
    def resolve(self, group: ConflictGroup, context: ResolutionContext) -> List[InstructionRecord]:
        # Check metadata, if one is 'user', it overrides entirely.
        a_is_user = any(r.metadata.actor_id == "user" for r in group.instructions_a)
        b_is_user = any(r.metadata.actor_id == "user" for r in group.instructions_b)
        
        if a_is_user and not b_is_user:
            return group.instructions_a
        elif b_is_user and not a_is_user:
            return group.instructions_b
        return group.instructions_a + group.instructions_b

class ConflictClassifier:
    def classify_pair(self, record_a: InstructionRecord, record_b: InstructionRecord) -> ConflictType:
        impact_a = record_a.instruction.impact()
        impact_b = record_b.instruction.impact()
        
        ww_intersect = impact_a.write_set.intersection(impact_b.write_set)
        if ww_intersect:
            if impact_a.effect_type == "structural" or impact_b.effect_type == "structural":
                return ConflictType.STRUCTURAL
            return ConflictType.VALUE
            
        if impact_a.effect_type == "structural" and impact_a.write_set.intersection(impact_b.read_set):
            return ConflictType.STRUCTURAL
            
        if impact_b.effect_type == "structural" and impact_b.write_set.intersection(impact_a.read_set):
            return ConflictType.STRUCTURAL
            
        return ConflictType.NONE

class ConceptMergeEngine:
    def __init__(self, vm: NexusVM, strategy: ResolutionStrategy = LastWriteWins()):
        self.vm = vm
        self.classifier = ConflictClassifier()
        self.strategy = strategy

    def compute_lca(self, timeline_a: str, timeline_b: str) -> str:
        chain_a = {t.id for t in self.vm._ancestry_chain(timeline_a)}
        
        current = timeline_b
        while current:
            if current in chain_a:
                return current
            t_obj = self.vm.timelines.get(current)
            current = t_obj.parent if t_obj else None
            
        return "main"

    def get_delta_from_base(self, base_id: str, target_id: str) -> List[InstructionRecord]:
        chain = self.vm._ancestry_chain(target_id)
        base_index = next((i for i, t in enumerate(chain) if t.id == base_id), -1)
                
        if base_index == -1:
            raise ValueError("Target timeline does not descend from base timeline")
            
        path = chain[base_index:]
        delta = []
        
        for i, t in enumerate(path):
            if i > 0:
                if i < len(path) - 1:
                    next_fork = path[i+1].fork_index
                    limit = min(next_fork, len(t.instructions) - 1) if next_fork is not None else len(t.instructions) - 1
                    delta.extend(t.instructions[:limit + 1])
                else:
                    delta.extend(t.instructions)
                    
        return delta

    def detect_conflict_groups(self, delta_a: List[InstructionRecord], delta_b: List[InstructionRecord]) -> List[ConflictGroup]:
        groups = []
        # Trivial clustering for MVP: Everything independent goes to one "NONE" cluster per delta element.
        # Overlapping things form a dedicated cluster.
        
        a_consumed = [False] * len(delta_a)
        b_consumed = [False] * len(delta_b)
        
        for i, rec_a in enumerate(delta_a):
            if a_consumed[i]: continue
            
            cluster_b_idx = []
            max_c_type = ConflictType.NONE
            overlap_targets = set()
            
            for j, rec_b in enumerate(delta_b):
                ctype = self.classifier.classify_pair(rec_a, rec_b)
                if ctype != ConflictType.NONE:
                    cluster_b_idx.append(j)
                    b_consumed[j] = True
                    # Target both Write-Write and Read-Write intersections
                    overlap_targets.update(rec_a.instruction.impact().write_set.intersection(rec_b.instruction.impact().write_set))
                    overlap_targets.update(rec_a.instruction.impact().write_set.intersection(rec_b.instruction.impact().read_set))
                    overlap_targets.update(rec_b.instruction.impact().write_set.intersection(rec_a.instruction.impact().read_set))
                    
                    if ctype == ConflictType.STRUCTURAL:
                        max_c_type = ConflictType.STRUCTURAL
                    elif ctype == ConflictType.VALUE and max_c_type != ConflictType.STRUCTURAL:
                        max_c_type = ConflictType.VALUE
            
            if cluster_b_idx:
                a_consumed[i] = True
                groups.append(ConflictGroup(
                    target_overlap=overlap_targets,
                    instructions_a=[rec_a],
                    instructions_b=[delta_b[j] for j in cluster_b_idx],
                    conflict_type=max_c_type
                ))
                
        # Independent A
        for i, rec_a in enumerate(delta_a):
            if not a_consumed[i]:
                groups.append(ConflictGroup(set(), [rec_a], [], ConflictType.NONE))
                
        # Independent B
        for j, rec_b in enumerate(delta_b):
            if not b_consumed[j]:
                groups.append(ConflictGroup(set(), [], [rec_b], ConflictType.NONE))
                
        return groups

    def merge(self, timeline_a: str, timeline_b: str) -> str:
        base_id = self.compute_lca(timeline_a, timeline_b)
        
        delta_a = self.get_delta_from_base(base_id, timeline_a)
        delta_b = self.get_delta_from_base(base_id, timeline_b)
        
        conflict_groups = self.detect_conflict_groups(delta_a, delta_b)
        
        structural_errors = [g for g in conflict_groups if g.conflict_type == ConflictType.STRUCTURAL]
        if structural_errors:
            raise MergeConflictException("Structural Conflict detected.", structural_errors)
            
        t_a = self.vm.timelines[timeline_a]
        t_b = self.vm.timelines[timeline_b]
        
        context = ResolutionContext(
            base_state_hash=self.vm.materialize(base_id).compute_hash(),
            path_a_metadata=t_a.metadata,
            path_b_metadata=t_b.metadata,
            lca_index=len(self.vm.timelines[base_id].instructions) - 1
        )
        
        resolved = []
        for group in conflict_groups:
            resolved.extend(self.strategy.resolve(group, context))
            
        merged_id = self.vm.fork_timeline(base_id, context.lca_index)
        
        for record in resolved:
            self.vm.append_instruction(merged_id, record.instruction)
            
        return merged_id
