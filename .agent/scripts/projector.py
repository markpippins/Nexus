import os
import json
import glob

def generate_work_to_date(root_path, output_file):
    """
    Scans for WorkRequests and generates a materialized view in WORK_TO_DATE.md
    """
    # Find all JSON files that look like WorkRequests
    # Assuming they are in .agent/skills/work-request-emission/scripts/complete or similar
    # or anywhere in IMPLEMENTATION_PLAN_RECORD
    
    wr_files = []
    # Search common locations
    search_paths = [
        os.path.join(root_path, ".pipeline", "WORK_REQUESTS", "**", "*.json")
    ]
    
    for path in search_paths:
        wr_files.extend(glob.glob(path, recursive=True))

    work_requests = []
    for f in wr_files:
        try:
            with open(f, 'r') as jf:
                data = json.load(jf)
                if all(k in data for k in ("id", "state", "version")):
                    work_requests.append(data)
        except:
            continue

    # Sort by intent_node_id and version
    work_requests.sort(key=lambda x: (x.get("intent_node_id", "unknown"), x.get("version", 0)))

    with open(output_file, 'w') as out:
        out.write("# 📊 WORK_TO_DATE\n\n")
        out.write("This is a compiled projection of the current system state. **DO NOT EDIT.**\n\n")
        
        out.write("## 🎯 Active Intents & WorkRequests\n\n")
        out.write("| Intent ID | WR ID | Ver | State | Task |\n")
        out.write("|-----------|-------|-----|-------|------|\n")
        
        for wr in work_requests:
            intent_id = wr.get("intent_node_id", "N/A")
            wr_id = wr.get("id", "N/A")
            version = wr.get("version", "1")
            state = wr.get("state", "DRAFT")
            task = wr.get("task", "")[:50] + "..." if len(wr.get("task", "")) > 50 else wr.get("task", "")
            
            out.write(f"| {intent_id} | {wr_id} | {version} | {state} | {task} |\n")

        out.write("\n\n*Last compiled by Nexus Pipeline Projection Engine*\n")

if __name__ == "__main__":
    import sys
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    output = os.path.join(root, "WORK_TO_DATE.md")
    generate_work_to_date(root, output)
