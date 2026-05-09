import json
import os
import sys
import re
import shutil
import ollama

def run_worker(request_path):
    # This executor implements the strict contract described in v1.0.
    result = {
        "workRequestId": "",
        "status": "failure",
        "files_written": [],
        "model": "",
        "error": ""
    }

    # Load request and basic validation
    try:
        with open(request_path, 'r') as f:
            req = json.load(f)
    except Exception as e:
        # Cannot even parse input
        req = None
        result["error"] = f"Invalid JSON: {e}"
        req_valid = False
    else:
        req_valid = True

    # Prepare artifact directory mandatorily
    artifacts_dir = None
    wr_id = None
    if req and isinstance(req, dict):
        wr_id = req.get("id")
        req_valid = req_valid and all(k in req for k in ("id", "task", "path", "model"))
        if wr_id:
            artifacts_root = os.path.join(req.get("path", "."), ".pipeline", "WORK_REQUESTS", "artifacts")
            artifacts_dir = os.path.join(artifacts_root, wr_id)
        else:
            artifacts_dir = None
    else:
        req_valid = False

    # Step 2: Create artifact directory (if possible)
    try:
        if artifacts_dir:
            os.makedirs(artifacts_dir, exist_ok=True)
    except Exception as e:
        # If we cannot create artifacts dir, treat as filesystem error
        result["error"] = f"Fs error creating artifacts dir: {e}"
        result["workRequestId"] = wr_id or "unknown"
        # Write minimal result
        with open(os.path.join(os.path.dirname(request_path), "result.json"), 'w', encoding='utf-8') as jf:
            json.dump(result, jf, indent=2)
        exit(3)

    # Step 3: Copy Request Snapshot
    if artifacts_dir and request_path and os.path.exists(request_path):
        try:
            shutil.copyfile(request_path, os.path.join(artifacts_dir, "request.json"))
        except Exception as e:
            # Non-fatal for contract, but recordable
            result["error"] = f"Failed to snapshot request: {e}"

    # If input invalid, fail early but still produce artifacts and result.json
    if not req_valid or req is None:
        result["workRequestId"] = wr_id or "unknown"
        result["status"] = "failure"
        result["model"] = req.get("model") if isinstance(req, dict) else ""
        # Write result.json and exit with parse failure code (2)
        if artifacts_dir:
            with open(os.path.join(artifacts_dir, "result.json"), 'w', encoding='utf-8') as jf:
                json.dump(result, jf, indent=2)
        exit(2)

    # Step 4: Load resource files strictly
    resources = req.get("resources", []) or []
    working_path = os.path.abspath(req.get("path"))
    context_contents = []
    for res in resources:
        res_path = os.path.join(working_path, res)
        # Safety: no traversal, only direct file reads
        if not os.path.commonpath([os.path.abspath(res_path), working_path]).startswith(working_path):
            # skip dangerous entry
            continue
        if os.path.isfile(res_path):
            try:
                with open(res_path, 'r', encoding='utf-8') as rf:
                    content = rf.read()
                context_contents.append(f"[RESOURCE: {res}]\n{content}")
            except Exception:
                # Missing or unreadable resource: warning, continue
                pass
        else:
            # Missing resource: warn and ignore
            pass

    context_joined = "\n---\n".join(context_contents)

    # Step 5: Build deterministic prompt sections
    system_base = "SYSTEM:\nYou are a deterministic code generation worker.\n"
    task_text = req.get("task", "")
    working_dir = req.get("path", "")
    prompt_body = (
        system_base +
        "\nTASK:\n" + task_text +
        "\n\nWORKING DIRECTORY:\n" + working_dir +
        "\n\nCONTEXT FILES:\n" + context_joined +
        "\n\nOUTPUT FORMAT RULES:\n" +
        "You must output only structured file blocks.\n\nFormat:\n\n---START_FILE: relative/path---\n<content>\n---END_FILE---" +
        "\nNo explanations. No markdown outside file blocks."
    )

    system_prompt = system_base

    # Persist prompt for traceability (artifact requirement)
    try:
        with open(os.path.join(artifacts_dir, "prompt.txt"), 'w', encoding='utf-8') as pf:
            pf.write(prompt_body)
    except Exception:
        pass
    # Step 6: Call Model
    try:
        response = ollama.generate(
            model=req.get("model"),
            system=system_base,
            prompt=prompt_body,
            options={
                "num_predict": int(req.get("max_tokens", 2000))
            }
        )
    except Exception as e:
        result["workRequestId"] = wr_id
        result["status"] = "failure"
        result["error"] = f"Model invocation failed: {e}"
        with open(os.path.join(artifacts_dir, "result.json"), 'w', encoding='utf-8') as jf:
            json.dump(result, jf, indent=2)
        exit(1)

    # Step 7: Parse Output
    raw_text = response.get('response') if isinstance(response, dict) else None
    # Persist raw model output as per artifact contract
    try:
        if artifacts_dir and raw_text is not None:
            with open(os.path.join(artifacts_dir, "raw_model_output.txt"), 'w', encoding='utf-8') as rf:
                rf.write(raw_text)
    except Exception:
        pass
    if not raw_text:
        result["workRequestId"] = wr_id
        result["status"] = "failure"
        result["error"] = "No model output produced"
        with open(os.path.join(artifacts_dir, "result.json"), 'w', encoding='utf-8') as jf:
            json.dump(result, jf, indent=2)
        exit(2)
    file_blocks = re.findall(r'---START_FILE: (.*?)---(.*?)---END_FILE---', raw_text, re.DOTALL)
    if not file_blocks:
        result["workRequestId"] = wr_id
        result["status"] = "failure"
        result["error"] = "No valid file blocks generated"
        with open(os.path.join(artifacts_dir, "result.json"), 'w', encoding='utf-8') as jf:
            json.dump(result, jf, indent=2)
        exit(2)

    # Step 8: Write Files
    files_written = []
    for rel_path, content in file_blocks:
        # Safety: disallow traversal and absolute writes outside working dir
        rel = rel_path.strip()
        if rel.startswith("..") or os.path.isabs(rel):
            result["workRequestId"] = wr_id
            result["status"] = "failure"
            result["error"] = "Invalid relative path in output block"
            with open(os.path.join(artifacts_dir, "result.json"), 'w', encoding='utf-8') as jf:
                json.dump(result, jf, indent=2)
            exit(3)
        dest_path = os.path.abspath(os.path.join(req.get("path"), rel))
        base_req_path = os.path.abspath(req.get("path"))
        if not dest_path.startswith(base_req_path):
            result["workRequestId"] = wr_id
            result["status"] = "failure"
            result["error"] = "Block path escapes working directory"
            with open(os.path.join(artifacts_dir, "result.json"), 'w', encoding='utf-8') as jf:
                json.dump(result, jf, indent=2)
            exit(3)
        try:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'w', encoding='utf-8') as wf:
                wf.write(content)
            files_written.append(rel)
        except Exception as e:
            result["workRequestId"] = wr_id
            result["status"] = "failure"
            result["error"] = f"Filesystem write failed: {e}"
            with open(os.path.join(artifacts_dir, "result.json"), 'w', encoding='utf-8') as jf:
                json.dump(result, jf, indent=2)
            exit(3)

    # Step 9: Write Result File
    result["workRequestId"] = wr_id
    result["status"] = "success"
    result["files_written"] = files_written
    result["model"] = req.get("model")
    with open(os.path.join(artifacts_dir, "result.json"), 'w', encoding='utf-8') as jf:
        json.dump(result, jf, indent=2)

    # Step 10: Exit 0
    exit(0)
