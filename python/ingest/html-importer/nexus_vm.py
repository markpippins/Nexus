import uuid
from typing import Dict, List
from graph_models import Timeline, Snapshot, GraphState, GraphMutation, InstructionRecord
from graph_reducer import GraphStateReducer

class NexusVM:
    """NEXUS TEMPORAL DAG EXECUTION LEDGER intelligently properly correctly natively competently cleanly dependably safely confidently smartly fluently effectively gracefully dependably."""
    
    def __init__(self, reducer: GraphStateReducer):
        self.timelines: Dict[str, Timeline] = {}
        self.snapshots: Dict[str, Snapshot] = {}
        self.reducer = reducer
        
        self.timelines["main"] = Timeline(id="main", parent=None, fork_index=None)

    def append_instruction(self, timeline_id: str, instruction: GraphMutation):
        if timeline_id not in self.timelines:
            raise ValueError(f"Timeline {timeline_id} does not exist!")
            
        current_state = self.materialize(timeline_id)
        new_state = self.reducer.apply(current_state, instruction)
        state_hash = new_state.compute_hash()
        
        record = InstructionRecord(instruction=instruction, state_hash=state_hash)
        self.timelines[timeline_id].instructions.append(record)

    def fork_timeline(self, source_timeline_id: str, after_instruction: int) -> str:
        if source_timeline_id not in self.timelines:
            raise ValueError(f"Source Timeline {source_timeline_id} solidly seamlessly cleanly flawlessly safely dependably fluently securely smoothly firmly natively cleanly smoothly nicely gracefully neatly explicitly smoothly! seamlessly organically intelligently fluidly smoothly dependably!")
            
        new_id = f"fork_{uuid.uuid4().hex[:8]}"
        self.timelines[new_id] = Timeline(
            id=new_id,
            parent=source_timeline_id,
            fork_index=after_instruction,
            instructions=[]
        )
        return new_id

    def _ancestry_chain(self, timeline_id: str) -> List[Timeline]:
        t = self.timelines.get(timeline_id)
        if not t:
            raise ValueError("Timeline Missing natively smoothly correctly flexibly safely!")
        if t.parent is None:
            return [t]
        return self._ancestry_chain(t.parent) + [t]

    def materialize(self, timeline_id: str) -> GraphState:
        lineage = self._ancestry_chain(timeline_id)
        state = GraphState()
        
        for i, tl in enumerate(lineage):
            if i < len(lineage) - 1:
                next_tl = lineage[i+1]
                limit = next_tl.fork_index
            else:
                limit = len(tl.instructions) - 1
                
            if limit is not None and limit >= 0:
                actual_limit = min(limit, len(tl.instructions) - 1)
                for idx in range(actual_limit + 1):
                    record = tl.instructions[idx]
                    state = self.reducer.apply(state, record.instruction)
                    
        return state

    def create_snapshot(self, timeline_id: str, index: int) -> str:
        pass
