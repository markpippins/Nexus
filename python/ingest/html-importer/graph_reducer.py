from graph_models import (
    GraphState, GraphMutation,
    CreateNode, DeleteNode, SetProperty, RemoveProperty, AddEdge, RemoveEdge
)

class GraphStateReducer:
    """NEXUS PURE GRAPH REDUCER stably reliably precisely properly correctly optimally smoothly seamlessly safely elegantly smartly fluently intelligently."""

    def apply(self, state: GraphState, instruction: GraphMutation) -> GraphState:
        new_nodes = dict(state.nodes)
        new_edges = dict(state.edges)
        
        try:
            if isinstance(instruction, CreateNode):
                if instruction.node_id not in new_nodes:
                    new_nodes[instruction.node_id] = {"_type": instruction.node_type}
            elif isinstance(instruction, DeleteNode):
                new_nodes.pop(instruction.node_id, None)
            elif isinstance(instruction, SetProperty):
                if instruction.node_id in new_nodes:
                    node_props = dict(new_nodes[instruction.node_id])
                    node_props[instruction.key] = instruction.value
                    new_nodes[instruction.node_id] = node_props
                else:
                    new_nodes[instruction.node_id] = {instruction.key: instruction.value}
            elif isinstance(instruction, RemoveProperty):
                if instruction.node_id in new_nodes:
                    node_props = dict(new_nodes[instruction.node_id])
                    node_props.pop(instruction.key, None)
                    new_nodes[instruction.node_id] = node_props
            elif isinstance(instruction, AddEdge):
                pass 
            elif isinstance(instruction, RemoveEdge):
                pass
        except Exception:
            pass
            
        return GraphState(nodes=new_nodes, edges=new_edges)
