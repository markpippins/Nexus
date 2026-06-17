from graph_models import ConversationGraph, MessageNode, Relationship

def test_graph():
    graph = ConversationGraph(id="conv_graph_1")
    
    msg1 = MessageNode(id="msg_1", text="Hello world")
    msg2 = MessageNode(id="msg_2", text="Hi there")
    
    graph.messages[msg1.id] = msg1
    graph.messages[msg2.id] = msg2
    
    rel = Relationship(source_id="msg_1", target_id="msg_2", relation_type="REPLIES_TO", confidence=1.0)
    graph.relationships.append(rel)
    
    print(f"Graph ID: {graph.id}")
    print(f"Messages: {len(graph.messages)}")
    print(f"Relationships: {len(graph.relationships)}")
    print("Graph passes instantiation logic.")

if __name__ == "__main__":
    test_graph()
