#!/usr/bin/env python3
import sys
import json
import os

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def extract_graph_signature(dco):
    """
    Extracts the strict mathematical signature of the graph for isomorphism testing.
    """
    steps = dco.get("decomposition", {}).get("steps", [])
    
    # 1. Nodes (sorted for determinism)
    nodes = sorted([s.get("step_id", "") for s in steps])
    
    # 2. Edges (sorted)
    edges = sorted([(s.get("step_id", ""), dep) for s in steps for dep in s.get("dependencies", [])])
    
    # 3. Execution State
    exec_state = dco.get("execution_state", {})
    exec_signature = {
        "status": exec_state.get("status"),
        "progress": exec_state.get("progress")
    }
    
    # 4. Lineage State
    lineage = dco.get("lineage", {})
    lineage_signature = {
        "branches": sorted(lineage.get("branches", [])),
        "merge_history_count": len(lineage.get("merge_history", []))
    }
    
    return {
        "nodes": nodes,
        "edges": edges,
        "execution": exec_signature,
        "lineage": lineage_signature
    }

def assess_convergence(current_path, previous_path):
    """
    Acts as the executable component of the assess-stability skill (Pass 4).
    Evaluates the structural fixed point of a WorkRequest DCO: Φ(G) ≡ G.
    Returns 0 if converged, 1 if continue.
    """
    try:
        current_dco = load_json(current_path)
        
        if not os.path.exists(previous_path):
            print("CONTINUE: No previous snapshot found. Forcing iteration.")
            sys.exit(1)
            
        previous_dco = load_json(previous_path)
        
        # Extract mathematical signatures
        sig_curr = extract_graph_signature(current_dco)
        sig_prev = extract_graph_signature(previous_dco)
        
        # 1. Isomorphism Check: Did the structure change?
        if sig_curr["nodes"] != sig_prev["nodes"]:
            print("CONTINUE: Graph nodes changed (Expansion/Reduction occurred).")
            sys.exit(1)
            
        if sig_curr["edges"] != sig_prev["edges"]:
            print("CONTINUE: Graph edges changed.")
            sys.exit(1)
            
        # 2. Execution State Check: Did progress occur?
        if sig_curr["execution"] != sig_prev["execution"]:
            print("CONTINUE: Execution state mutated.")
            sys.exit(1)
            
        # 3. Lineage State Check
        if sig_curr["lineage"] != sig_prev["lineage"]:
            print("CONTINUE: Lineage state mutated.")
            sys.exit(1)
            
        # 4. Pending Execution Nodes Check
        # To be fully complete, all nodes should ideally be executed. 
        # But fixed-point simply requires that NO CHANGES occur. If no changes occur 
        # and nodes are still pending, it implies a deadlock or completion.
        # We ensure no dangling edges exist.
        steps = current_dco.get("decomposition", {}).get("steps", [])
        step_ids = {s.get("step_id") for s in steps}
        for s in steps:
            for dep in s.get("dependencies", []):
                if dep not in step_ids:
                    print(f"CONTINUE: Dangling dependency found ({dep}).")
                    sys.exit(1)

        print("CONVERGED: Structural fixed point reached. Φ(G) ≡ G.")
        sys.exit(0)
        
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: assess_stability.py <current_dco_json> <previous_dco_json>")
        sys.exit(1)
    
    assess_convergence(sys.argv[1], sys.argv[2])
