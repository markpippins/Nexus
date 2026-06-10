import json
import os
import re
import select
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from typing import Any, Dict

try:
    from urllib.request import Request, urlopen
    from urllib.error import URLError
except ImportError:
    from urllib2 import Request, urlopen, URLError  # type: ignore[no-redef]

from env_config import load_env  # shared .env loader; load_env() fires at import time
from work_request import WorkResultEvent


# ── Env vars loaded above ───────────────────────────────────────────

OPENCODE_BIN = os.environ.get("OPENCODE_BIN", "/home/codex/.opencode/bin/opencode")
# Timeout for external harness invocations (30 min default).
# This is a last-resort safety valve — the conduit watchdog
# handles the primary timeout, but this ensures executor_cloud.py itself
# doesn't hang forever even when invoked outside the conduit.
OPENCODE_TIMEOUT_SECONDS = int(os.environ.get("PIPELINE_EXECUTOR_TIMEOUT", "1800"))

# Default harness semantic definitions (used when DB is not available).
# These match the seed defaults in nexus/typescript/conduit-mcp/src/db.ts.
_OPencode_SEMANTICS = {
    "binary": OPENCODE_BIN,  # full path from env or fallback (not bare "opencode" which may not be in PATH)
    "capabilities": {"model": True, "agent": True, "working_directory": True, "system_prompt": False},
    "execution": {"mode": "interactive", "subcommand": "run"},
    "semantics": {
        "model": {"type": "flag", "flag": "--model"},
        "agent": {"type": "flag", "flag": "--agent"},
        "working_directory": {"type": "flag", "flag": "--dir"},
    },
    "role_mapping": {"strategy": "agent"},
}

try:
    import ollama
except ImportError:
    ollama = None  # optional — only needed when harness is ollama


MCP_BASE_URL = os.environ.get("MCP_BASE_URL", "http://localhost:3100")


def _capture_session_cost(session_id: str, opencode_bin: str) -> None:
    """Run `opencode stats --days 1` and POST the total cost to the MCP server."""
    if not session_id:
        return

    try:
        result = subprocess.run(
            [opencode_bin, "stats", "--days", "1"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        output = result.stdout or ""
        # Parse "Total Cost                                       $13.48"
        match = re.search(r"Total Cost\s+\$?([\d.]+)", output)
        if not match:
            return
        cost_usd = float(match.group(1))

        payload = json.dumps({"cost_usd": cost_usd}).encode("utf-8")
        req = Request(
            f"{MCP_BASE_URL}/sessions/{session_id}/cost",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urlopen(req, timeout=5)
        print(f"[cost] session={session_id} cost_usd={cost_usd}")
    except Exception as e:
        print(f"[cost] Failed to capture cost for {session_id}: {type(e).__name__}: {e}", file=sys.stderr)


def _resolve_harness(req: Dict[str, Any]) -> str:
    """Extract the harness from DCO metadata (defaults to 'opencode')."""
    harness = (req.get("metadata") or {}).get("harness", "opencode")
    return harness if harness in ("opencode", "ollama", "codex") else "opencode"


PIPELINE_DB_PATH =os.environ.get("PIPELINE_DB_PATH", "/home/codex/dev/nexus/.conduit-data/pipeline.db")


def _resolve_model_name(req: Dict[str, Any]) -> str:
    """Extract the model name from DCO metadata.

    Falls back to DB ai_role_config lookup, then PIPELINE_MODEL env var.
    """
    explicit = (req.get("metadata") or {}).get("model", "")
    if explicit:
        return explicit

    # Fallback 1: DB-backed role config
    role = (req.get("metadata") or {}).get("role", "")
    if role:
        try:
            conn = sqlite3.connect(PIPELINE_DB_PATH)
            row = conn.execute(
                "SELECT m.model_identifier "
                "FROM ai_role_config rc "
                "JOIN ai_models m ON rc.model_id = m.id "
                "WHERE rc.role = ?",
                (role,),
            ).fetchone()
            conn.close()
            if row and row[0]:
                return row[0]
        except Exception as e:
            print(f"[ai-config] model lookup failed: {e}", file=sys.stderr)

    # Fallback 2: env var
    return os.environ.get("PIPELINE_MODEL", "")


def _build_default_opencode_launcher(role: str, model: str) -> 'HarnessLauncher':
    """Build a HarnessLauncher for opencode with default semantics.

    Used by executor_cloud when the DB is not available or when
    running outside the context of a role-config lookup.
    Callers should call ``launcher.set_working_directory(path)``
    and ``launcher.set_prompt(prompt)`` after construction.
    """
    from harness_launcher import HarnessLauncher
    launcher = HarnessLauncher.from_harness_row({
        "name": "opencode",
        "invocation_semantics": _OPencode_SEMANTICS,
    })
    launcher.set_agent(role)
    if model:
        launcher.set_model(model)
    return launcher


def run_ollama(req, system_base, prompt_body):
    if ollama is None:
        raise RuntimeError("ollama package is not installed — cannot use ollama harness")
    response = ollama.generate(
        model=_resolve_model_name(req),
        system=system_base,
        prompt=prompt_body,
        options={"num_predict": 2000},
    )
    return response.get("response") if isinstance(response, dict) else None


def _serialize_dco_for_prompt(req: Dict[str, Any]) -> str:
    """Render the full WorkRequest DCO as structured text for the agent."""
    intent = req.get("intent", {})
    decomposition = req.get("decomposition", {})
    requirements = req.get("requirements", {})
    constraints = req.get("constraints", {})
    success = req.get("success_criteria", {})
    artifacts = req.get("artifacts", {})
    lineage = req.get("lineage", {})
    meta = req.get("metadata", {})

    def _kv(k, v):
        return f"  - **{k}:** {v}"

    blocks: list[str] = []

    # ── Intent ──
    blocks.append("## Intent")
    if intent.get("problem_statement"):
        blocks.append(_kv("Problem", intent["problem_statement"]))
    if intent.get("desired_outcome"):
        blocks.append(_kv("Outcome", intent["desired_outcome"]))
    blocks.append(_kv("Priority", intent.get("priority", "medium")))
    blocks.append(_kv("Abstraction", intent.get("abstraction_level", "task")))
    if intent.get("user_intent_trace"):
        blocks.append(_kv("Prompt ref", intent["user_intent_trace"]))

    # ── Decomposition ──
    steps = decomposition.get("steps", [])
    blocks.append("\n## Decomposition")
    blocks.append(_kv("Strategy", decomposition.get("strategy", "")))
    for i, s in enumerate(steps, 1):
        blocks.append(f"  **Step {i}** [{s.get('type', 'execution')}]: {s.get('description', '')[:300]}")

    # ── Requirements ──
    func = requirements.get("functional", [])
    if func:
        blocks.append("\n## Requirements (functional)")
        for ac in func:
            blocks.append(f"  - {ac}")

    # ── Constraints ──
    safety = constraints.get("safety_constraints", [])
    if safety:
        blocks.append("\n## Constraints")
        for sc in safety:
            blocks.append(f"  - {sc}")

    # ── Success Criteria ──
    conditions = success.get("completion_conditions", [])
    if conditions:
        blocks.append("\n## Success Criteria")
        for c in conditions:
            blocks.append(f"  - {c.get('condition', '')}")

    # ── Artifacts (target files) ──
    files = artifacts.get("produced_files", [])
    if files:
        blocks.append("\n## Target Files")
        for f in files:
            blocks.append(f"  - {f.get('path', '?')}")

    # ── Lineage ──
    derived = lineage.get("derived_from", [])
    if derived:
        blocks.append(f"\n## Lineage: derived from {', '.join(derived)}")

    # ── Metadata ──
    tags = meta.get("tags", [])
    if tags:
        blocks.append(f"\n## Metadata: tags={', '.join(tags)}")

    return "\n".join(blocks)


def _resolve_role(req: Dict[str, Any]) -> str:
    """Extract the agent role from DCO metadata (defaults to 'builder')."""
    role = (req.get("metadata") or {}).get("role", "")
    return role if role in ("builder", "reviewer", "planner", "critic") else "builder"


def _build_opencode_prompt(
    req: Dict[str, Any],
    working_path: str,
    artifacts_dir: str | None = None,
) -> str:
    """Build a structured prompt for opencode from the full WorkRequest DCO."""
    role = _resolve_role(req)
    dco_text = _serialize_dco_for_prompt(req)
    lines = [dco_text, f"\n## Working directory\n{working_path}"]

    if artifacts_dir:
        lines.append(
            f"\n## Full DCO\nThe complete WorkRequest DCO is on disk at "
            f"{artifacts_dir}/request.json. Read it for full detail."
        )

    # ── role-specific instructions ──
    if role == "builder":
        lines.extend([
            "\n## Instructions",
            "Execute this WorkRequest. Implement the plan, modifying only "
            "the files listed in Target Files. Satisfy all acceptance criteria "
            "and completion conditions. Respect all safety constraints.",
        ])
    elif role == "reviewer":
        lines.extend([
            "\n## Instructions",
            "Review the implementation described in this WorkRequest. "
            "Compare the change report in CHANGES/committed/ against the plan. "
            "If changes match the acceptance criteria, issue a REVIEW_PASS receipt. "
            "If they don't match, issue a REVIEW_REJECT receipt with explanation.",
        ])
    elif role == "planner":
        lines.extend([
            "\n## Instructions",
            "Elucidate the proposed plan in this WorkRequest. "
            "Define acceptance criteria, identify files affected, and note dependencies. "
            "When the plan is fully defined, issue a PLAN_CREATE receipt.",
        ])
    elif role == "critic":
        lines.extend([
            "\n## Instructions",
            "Critique the plan in this WorkRequest. "
            "Evaluate the acceptance criteria, identify gaps, suggest improvements. "
            "Issue a CRITIQUE_PASS or CRITIQUE_REJECT receipt.",
        ])

    lines.append("\nDo NOT issue receipts — the conduit manager handles the audit trail.")
    return "\n".join(lines)


def _run_harness_subprocess(
    cmd: list[str],
    session_log_path: str | None,
    timeout: int,
    tool_name: str,
) -> str:
    """Run a harness CLI subprocess and return stdout.

    Shared helper for ``run_opencode``, ``run_codex``, and future harness
    functions.  Handles the full subprocess lifecycle:

    - Opens a session log file if ``session_log_path`` is provided
    - Launches ``cmd`` via ``subprocess.Popen``
    - Reads stdout with a ``select.select()`` polling loop (1s tick)
    - Enforces ``timeout`` as a last-resort safety valve
    - Writes every output line to the log file in real time
    - Raises ``RuntimeError`` on launch failure, timeout, or non-zero exit

    Args:
        cmd: The full CLI command list (binary + args).
        session_log_path: Optional path to append stdout to a log file.
        timeout: Maximum wall-clock seconds before the process is killed.
        tool_name: Human-readable name used in error messages (e.g., "opencode", "Codex").

    Returns:
        Combined stdout as a single string.
    """
    log_fh = None
    if session_log_path:
        os.makedirs(os.path.dirname(session_log_path), exist_ok=True)
        log_fh = open(session_log_path, "a", encoding="utf-8")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except Exception as e:
        if log_fh:
            log_fh.close()
        raise RuntimeError(f"Failed to launch {tool_name}: {e}")

    stdout_lines: list[str] = []
    start_time = datetime.utcnow()

    try:
        while True:
            ready, _, _ = select.select([proc.stdout], [], [], 1.0)
            if not ready:
                elapsed = (datetime.utcnow() - start_time).total_seconds()
                if elapsed > timeout:
                    proc.kill()
                    proc.wait()
                    raise subprocess.TimeoutExpired(cmd, timeout)
                if proc.poll() is not None:
                    break
                continue

            line = proc.stdout.readline()
            if not line:
                if proc.poll() is not None:
                    break
                continue

            stdout_lines.append(line)
            if log_fh:
                log_fh.write(line)
                log_fh.flush()

        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        raise RuntimeError(
            f"{tool_name} timed out after {timeout}s. "
            f"The conduit watchdog will clean up orphaned processes."
        )
    finally:
        if log_fh:
            log_fh.close()

    if proc.returncode != 0:
        output = "".join(stdout_lines).strip()
        raise RuntimeError(
            f"{tool_name} invocation failed: {output or 'exit code ' + str(proc.returncode)}"
        )

    return "".join(stdout_lines)


def run_opencode(req, working_path, artifacts_dir=None, session_log_path=None):
    role = _resolve_role(req)
    prompt = _build_opencode_prompt(req, working_path, artifacts_dir)
    model = _resolve_model_name(req)

    # Build command via HarnessLauncher — no hardcoded flags
    launcher = _build_default_opencode_launcher(role, model)
    launcher.set_working_directory(working_path)
    launcher.set_prompt(prompt)

    # For PROMPT_FILE strategy (e.g., Codex), write the role prompt to a file
    launcher.prepare_role_prompt_file()

    cmd = launcher.build()

    # Inject opencode-specific debug flags (harness-internal, not semantic)
    insert_pos = 2 if len(cmd) > 1 and cmd[1] == "run" else 1
    debug_flags = ["--print-logs", "--log-level", "DEBUG"]
    for f in debug_flags:
        cmd.insert(insert_pos, f)
        insert_pos += 1

    return _run_harness_subprocess(cmd, session_log_path, OPENCODE_TIMEOUT_SECONDS, "opencode")


def run_codex(req, working_path, artifacts_dir=None, session_log_path=None):
    """Run Codex CLI with prompt_file role injection strategy.

    Builds a HarnessLauncher with the codex semantic schema, writes the
    role prompt to a temp file, and invokes ``codex exec --cd PATH FILE``.
    """
    from harness_launcher import DEFAULT_BINARIES, HarnessLauncher
    from harness_enums import ExecutionMode, RoleMappingStrategy

    role = _resolve_role(req)
    prompt = _build_opencode_prompt(req, working_path, artifacts_dir)
    model = _resolve_model_name(req)

    # Codex semantics: oneshot, prompt_file, no model/agent CLI flags
    launcher = HarnessLauncher(
        binary=DEFAULT_BINARIES.get("codex", "codex"),
        capabilities={"model": False, "agent": False,
                       "working_directory": True, "system_prompt": True},
        execution_mode=ExecutionMode.ONESHOT,
        semantics={
            "working_directory": {"type": "flag", "flag": "--cd"},
        },
        role_mapping_strategy=RoleMappingStrategy.PROMPT_FILE,
        execution_data={"mode": "oneshot", "subcommand": "exec"},
    )
    launcher.set_agent(role)
    launcher.set_working_directory(working_path)
    launcher.set_prompt(prompt)
    launcher.prepare_role_prompt_file()

    cmd = launcher.build()

    return _run_harness_subprocess(cmd, session_log_path, OPENCODE_TIMEOUT_SECONDS, "Codex")


def run_model(req, working_path, system_base, prompt_body, artifacts_dir=None, session_log_path=None):
    harness = _resolve_harness(req)
    if harness == "opencode":
        return run_opencode(req, working_path, artifacts_dir, session_log_path)
    if harness == "ollama":
        return run_ollama(req, system_base, prompt_body)
    if harness == "codex":
        return run_codex(req, working_path, artifacts_dir, session_log_path)
    raise RuntimeError(f"Unsupported harness: {harness}")


def execute_step(step, req, working_path, artifacts_dir, wr_id):
    """Executes a single step using the selected backend and writes its output."""
    print(f"Executing step: {step['step_id']}")

    resources = req.get("resources", []) or []
    context_contents = []
    for res in resources:
        res_path = os.path.join(working_path, res)
        resolved = os.path.realpath(res_path)
        root = os.path.realpath(working_path)
        if os.path.commonpath([resolved, root]) != root:
            continue
        if os.path.isfile(res_path):
            try:
                with open(res_path, "r", encoding="utf-8") as rf:
                    content = rf.read()
                context_contents.append(f"[RESOURCE: {res}]\n{content}")
            except Exception:
                pass

    for dep in step.get("dependencies", []):
        dep_artifact = os.path.join(artifacts_dir, f"{dep}_output.txt")
        if os.path.isfile(dep_artifact):
            with open(dep_artifact, "r", encoding="utf-8") as f:
                context_contents.append(f"[DEP OUTPUT: {dep}]\n{f.read()}")

    context_joined = "\n---\n".join(context_contents)

    intent_desc = req.get("intent", {}).get("desired_outcome", "Solve task")
    step_desc = step.get("description", "")

    system_base = "SYSTEM:\nYou are a deterministic cognitive compiler node executing a graph step.\n"
    prompt_body = (
        system_base
        + f"\nGLOBAL INTENT:\n{intent_desc}\n"
        + f"\nCURRENT STEP [{step.get('type')}]:\n{step_desc}\n"
        + "\n\nWORKING DIRECTORY:\n"
        + working_path
        + "\n\nCONTEXT FILES & PRIOR OUTPUTS:\n"
        + context_joined
        + "\n\nOUTPUT FORMAT RULES:\n"
        + "You must output only structured file blocks.\n\nFormat:\n\n---START_FILE: relative/path---\n<content>\n---END_FILE---"
        + "\nNo explanations. No markdown outside file blocks."
    )

    try:
        # Extract session_id from DCO metadata for log streaming
        dag_session_id = (req.get("metadata") or {}).get("session_id", "")
        session_log_path_dag = os.path.join(working_path, ".conduit-data", "sessions", f"{dag_session_id}.log") if dag_session_id else None
        raw_text = run_model(req, working_path, system_base, prompt_body, artifacts_dir, session_log_path_dag)
    except Exception as e:
        return False, str(e), []

    try:
        if artifacts_dir and raw_text:
            with open(os.path.join(artifacts_dir, f"{step['step_id']}_raw.txt"), "w", encoding="utf-8") as rf:
                rf.write(raw_text)
    except Exception:
        pass

    if not raw_text:
        return False, "No model output produced", []

    file_blocks = re.findall(r"---START_FILE: (.*?)---(.*?)---END_FILE---", raw_text, re.DOTALL)

    if not file_blocks and step.get("type") in ["analysis", "validation"]:
        try:
            with open(os.path.join(artifacts_dir, f"{step['step_id']}_output.txt"), "w", encoding="utf-8") as wf:
                wf.write(raw_text.strip())
        except Exception:
            pass
        return True, "", []

    if not file_blocks:
        # OpenCode (and similar harnesses) write files directly via tool calls.
        # The structured file blocks are only required for deterministic DAG executors.
        harness = _resolve_harness(req)
        if harness in ("opencode", "codex"):
            print(f"[execute_step] Harness={harness} completed but produced no file-block output. "
                  f"This is expected — harness writes files directly. Treating as success.")
            return True, "", []
        return False, "No valid file blocks generated", []

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
            with open(dest_path, "w", encoding="utf-8") as wf:
                wf.write(content)
            files_written.append(rel)

            with open(os.path.join(artifacts_dir, f"{step['step_id']}_output.txt"), "w", encoding="utf-8") as wf:
                wf.write(f"File updated: {rel}\n\n{content}")
        except Exception as e:
            return False, f"Filesystem write failed: {e}", files_written

    return True, "", files_written


def run_worker(request_path):
    result = {
        "workRequestId": "",
        "status": "failure",
        "files_written": [],
        "outputs": [],
        "artifacts": [],
        "error": "",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "executor_id": "executor-cloud",
        "harness": "",
        "model": "",
    }

    try:
        with open(request_path, "r", encoding="utf-8") as f:
            req = json.load(f)
    except Exception as e:
        result["error"] = f"Invalid JSON: {e}"
        exit(2)

    wr_id = req.get("id")
    result["workRequestId"] = wr_id or "unknown"
    result["harness"] = _resolve_harness(req)
    result["model"] = _resolve_model_name(req)

    if "decomposition" not in req or "steps" not in req["decomposition"]:
        result["error"] = "Not a valid DCO. Missing decomposition block."
        exit(2)

    working_path = os.path.abspath(req.get("path", "."))
    artifacts_dir = os.path.join(working_path, ".conduit-data", "WORK_REQUESTS", "artifacts", wr_id) if wr_id else None

    if artifacts_dir:
        os.makedirs(artifacts_dir, exist_ok=True)
        shutil.copyfile(request_path, os.path.join(artifacts_dir, "request.json"))

    # ── Non-builder fast-path: skip DAG, just call opencode ──
    role = _resolve_role(req)
    session_id = (req.get("metadata") or {}).get("session_id", "")
    session_log_path = os.path.join(working_path, ".conduit-data", "sessions", f"{session_id}.log") if session_id else None

    if role != "builder":
        print(f"Non-builder role '{role}' — fast-path: dispatch via run_model().")
        try:
            system_base = (
                "SYSTEM:\nYou are a deterministic cognitive compiler node executing a graph step.\n"
            )
            prompt_body = (
                system_base
                + f"\nGLOBAL INTENT:\n{req.get('intent', {}).get('desired_outcome', 'Solve task')}\n"
                + "\n\nWORKING DIRECTORY:\n" + working_path
                + "\n\nExecute this task."
            )
            raw_text = run_model(req, working_path, system_base, prompt_body,
                                 artifacts_dir, session_log_path)
            result["status"] = "success"
            result["timestamp"] = datetime.utcnow().isoformat() + "Z"
            if artifacts_dir and raw_text:
                out_path = os.path.join(artifacts_dir, "output.txt")
                with open(out_path, "w", encoding="utf-8") as wf:
                    wf.write(raw_text)
        except Exception as e:
            result["status"] = "failure"
            result["error"] = str(e)

        _capture_session_cost(session_id, OPENCODE_BIN)
        if artifacts_dir:
            _write_result_event(result, artifacts_dir)
        exit(0 if result["status"] == "success" else 3)

    steps = req["decomposition"]["steps"]
    step_status = {s["step_id"]: "pending" for s in steps}
    all_files_written = []

    while True:
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
            if all(v == "completed" for v in step_status.values()):
                break
            result["status"] = "failure"
            result["error"] = "DAG deadlock detected. Unmet dependencies."
            _capture_session_cost(session_id, OPENCODE_BIN)
            if artifacts_dir:
                _write_result_event(result, artifacts_dir)
            exit(3)

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
                _capture_session_cost(session_id, OPENCODE_BIN)
                if artifacts_dir:
                    _write_result_event(result, artifacts_dir)
                exit(3)

    result["status"] = "success"
    result["files_written"] = all_files_written
    result["timestamp"] = datetime.utcnow().isoformat() + "Z"
    _capture_session_cost(session_id, OPENCODE_BIN)
    if artifacts_dir:
        _write_result_event(result, artifacts_dir)
    exit(0)


def _write_result_event(result: Dict[str, Any], artifacts_dir: str) -> None:
    """Serialize the result as a schema-validated WorkResultEvent."""
    event = WorkResultEvent(
        work_request_id=result.get("workRequestId", ""),
        status=result["status"],
        outputs=result.get("outputs", []),
        artifacts=result.get("artifacts", []),
        error=result.get("error") or None,
        timestamp=result["timestamp"],
        executor_id=result.get("executor_id"),
        harness=result.get("harness"),
        model=result.get("model"),
        files_written=result.get("files_written", []),
    )
    out_path = os.path.join(artifacts_dir, "result.json")
    with open(out_path, "w", encoding="utf-8") as jf:
        jf.write(event.model_dump_json(indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: executor_cloud.py <path_to_dco_json>")
        sys.exit(1)
    run_worker(sys.argv[1])
