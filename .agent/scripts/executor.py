import json
import os
import sys
import re
import shutil
import ollama

def execute_step(step, req, working_path, artifacts_dir, wr_id):
    """Executes a single step using the LLM and writes its output."""
    print(f"Executing step: {step['step_id']}")
    
    # 1. Load resources
    resources = req.get("resources", []) or []
    context_contents = []
    for res in resources:
        res_path = os.path.join(working_path, res)
        if not os.path.commonpath([os.path.abspath(res_path), working_path]).startswith(working_path):
            continue
        if os.path.isfile(res_path):
            try:
                with open(res_path, 'r', encoding='utf-8') as rf:
                    content = rf.read()
                context_contents.append(f"[RESOURCE: {res}]\n{content}")
            except Exception:
                pass
                
    # Also load outputs of dependency steps from artifacts dir if available
    for dep in step.get('dependencies', []):
        dep_artifact = os.path.join(artifacts_dir, f"{dep}_output.txt")
        if os.path.isfile(dep_artifact):
            with open(dep_artifact, 'r', encoding='utf-8') as f:
                context_contents.append(f"[DEP OUTPUT: {dep}]\n{f.read()}")

    context_joined = "\n---\n".join(context_contents)
    
    intent_desc = req.get("intent", {}).get("desired_outcome", "Solve task")
    step_desc = step.get("description", "")
    
    system_base = "SYSTEM:\nYou are a deterministic cognitive compiler node executing a graph step.\n"
    prompt_body = (
        system_base +
        f"\nGLOBAL INTENT:\n{intent_desc}\n" +
        f"\nCURRENT STEP [{step.get('type')}]:\n{step_desc}\n" +
        "\n\nWORKING DIRECTORY:\n" + working_path +
        "\n\nCONTEXT FILES & PRIOR OUTPUTS:\n" + context_joined +
        "\n\nOUTPUT FORMAT RULES:\n" +
        "You must output only structured file blocks.\n\nFormat:\n\n---START_FILE: relative/path---\n<content>\n---END_FILE---" +
        "\nNo explanations. No markdown outside file blocks."
    )
    
    # Execute Model
    try:
        response = ollama.generate(
            model=req.get("metadata", {}).get("mode", "default") or req.get("model", "llama3"),
            system=system_base,
            prompt=prompt_body,
            options={"num_predict": 2000}
        )
    except Exception as e:
        return False, str(e), []
        
    raw_text = response.get('response') if isinstance(response, dict) else None
    
    # Save step raw output
    try:
        if artifacts_dir and raw_text:
            with open(os.path.join(artifacts_dir, f"{step['step_id']}_raw.txt"), 'w', encoding='utf-8') as rf:
                rf.write(raw_text)
    except Exception:
        pass
        
    if not raw_text:
        return False, "No model output produced", []
        
    file_blocks = re.findall(r'---START_FILE: (.*?)---(.*?)---END_FILE---', raw_text, re.DOTALL)
    
    # If no file blocks but step type is analysis or validation, we might just output the text as an artifact
    if not file_blocks and step.get("type") in ["analysis", "validation"]:
        try:
            with open(os.path.join(artifacts_dir, f"{step['step_id']}_output.txt"), 'w', encoding='utf-8') as wf:
                wf.write(raw_text.strip())
        except:
            pass
        return True, "", []
        
    if not file_blocks:
        return False, "No valid file blocks generated", []
        
    # Write Files
    files_written = []
    for rel_path, content in file_blocks:
        rel = rel_path.strip()
        if rel.startswith("..") or os.path.isabs(rel):
            return False, "Invalid relative path in output block", files_written
            
        dest_path = os.path.abspath(os.path.join(working_path, rel))
        if not dest_path.startswith(os.path.abspath(working_path)):
            return False, "Block path escapes working directory", files_written
            
        try:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'w', encoding='utf-8') as wf:
                wf.write(content)
            files_written.append(rel)
            
            # Record output for dependents
            with open(os.path.join(artifacts_dir, f"{step['step_id']}_output.txt"), 'w', encoding='utf-8') as wf:
                wf.write(f"File updated: {rel}\n\n{content}")
        except Exception as e:
            return False, f"Filesystem write failed: {e}", files_written
            
    return True, "", files_written

def run_worker(request_path):
    result = {
        "workRequestId": "",
        "status": "failure",
        "files_written": [],
        "model": "",
        "error": ""
    }

    try:
        with open(request_path, 'r') as f:
            req = json.load(f)
    except Exception as e:
        result["error"] = f"Invalid JSON: {e}"
        exit(2)

    wr_id = req.get("id")
    result["workRequestId"] = wr_id or "unknown"
    
    # Verify DCO Structure
    if "decomposition" not in req or "steps" not in req["decomposition"]:
        result["error"] = "Not a valid DCO. Missing decomposition block."
        exit(2)
        
    working_path = os.path.abspath(req.get("path", "."))
    artifacts_dir = os.path.join(working_path, ".pipeline", "WORK_REQUESTS", "artifacts", wr_id) if wr_id else None

    if artifacts_dir:
        os.makedirs(artifacts_dir, exist_ok=True)
        shutil.copyfile(request_path, os.path.join(artifacts_dir, "request.json"))

    steps = req["decomposition"]["steps"]
    
    # Ready-Set Scheduling Loop (Graph Traversal)
    step_status = {s["step_id"]: "pending" for s in steps}
    all_files_written = []
    
    while True:
        # Compute ready set
        ready_set = []
        for s in steps:
            if step_status[s["step_id"]] != "pending":
                continue
                
            deps_met = True
            for dep in s.get("dependencies", []):
                if step_status.get(dep) != "completed":
                    deps_met = False
                    break
            
            if deps_met:
                ready_set.append(s)
                
        if not ready_set:
            # Check if done or deadlocked
            if all(v == "completed" for v in step_status.values()):
                break
            else:
                result["status"] = "failure"
                result["error"] = "DAG deadlock detected. Unmet dependencies."
                if artifacts_dir:
                    with open(os.path.join(artifacts_dir, "result.json"), 'w') as jf:
                        json.dump(result, jf, indent=2)
                exit(3)
                
        # Execute ready set (sequentially for now, but scheduled via graph)
        for step in ready_set:
            step_status[step["step_id"]] = "in_progress"
            success, err, written = execute_step(step, req, working_path, artifacts_dir, wr_id)
            
            if success:
                step_status[step["step_id"]] = "completed"
                all_files_written.extend(written)
            else:
                step_status[step["step_id"]] = "failed"
                result["status"] = "failure"
                result["error"] = f"Step {step['step_id']} failed: {err}"
                if artifacts_dir:
                    with open(os.path.join(artifacts_dir, "result.json"), 'w') as jf:
                        json.dump(result, jf, indent=2)
                exit(3)

    # Success
    result["status"] = "success"
    result["files_written"] = all_files_written
    if artifacts_dir:
        with open(os.path.join(artifacts_dir, "result.json"), 'w') as jf:
            json.dump(result, jf, indent=2)
    exit(0)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: executor.py <path_to_dco_json>")
        sys.exit(1)
    run_worker(sys.argv[1])
