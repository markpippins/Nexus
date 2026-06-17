"""Step handlers for the agentic pipeline.

Each handler produces artifacts, logs its actions, and supports:
- Artifact propagation (loading prior step outputs)
- Sandbox isolation for compile/integrate
- KernelPanic after 3 consecutive failures
"""

import json, os, sys, tempfile, shutil, subprocess, difflib, uuid, datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
sys.path.insert(0, PROJECT_ROOT)

from handlers.base import StepHandler
from agents.step_generator import generate_for_step


def _log(idea_id, step, msg):
    ts = datetime.datetime.now(datetime.UTC).isoformat()
    print(f"[{ts}] [{idea_id}] [{step}] {msg}")


def _load_failure_count(idea_id, artifact_dir):
    """Count consecutive failures for this step."""
    path = os.path.join(artifact_dir, idea_id, ".failures.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def _save_failure_count(idea_id, artifact_dir, counts):
    path = os.path.join(artifact_dir, idea_id, ".failures.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(counts, f)


def _record_failure(idea_id, artifact_dir, step_name):
    counts = _load_failure_count(idea_id, artifact_dir)
    counts[step_name] = counts.get(step_name, 0) + 1
    _save_failure_count(idea_id, artifact_dir, counts)
    return counts[step_name]


def _reset_success(idea_id, artifact_dir, step_name):
    counts = _load_failure_count(idea_id, artifact_dir)
    counts[step_name] = 0
    _save_failure_count(idea_id, artifact_dir, counts)


def _emit_kernel_panic(idea_id, output_dir, step_name, reason):
    """Emit a KernelPanic event and clear auto_advance."""
    evt = {
        "id": str(uuid.uuid4()),
        "type": "KernelPanic",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        "source": "system",
        "payload": {
            "idea_id": idea_id,
            "step": step_name,
            "reason": reason,
            "action": "Workflow paused. Human intervention required.",
        },
    }
    path = os.path.join(output_dir, f"{evt['id']}.json")
    with open(path, "w") as f:
        json.dump(evt, f, indent=2)
    _log(idea_id, step_name, f"KERNEL PANIC: {reason}")
    return evt


# ── Handlers ──────────────────────────────────────────────────────────────

class VocabularyHandler(StepHandler):
    step_name = "vocabulary"
    completion_type = "VocabularyDrafted"

    def handle(self):
        _log(self.idea_id, self.step_name, "Starting vocabulary generation")
        idea = self.workflow.get("idea", "")
        existing_vocab = self.load_prior_artifact("workflow_vocabulary.json") or \
                         self.workflow.get("vocabulary", {})

        result, error = generate_for_step("vocabulary", {
            "idea": idea,
            "existing_vocabulary": existing_vocab,
        })

        if result and "entities" in result:
            content = {
                "idea_id": self.idea_id,
                "source_idea": idea,
                "entities": result.get("entities", {}),
                "actions": result.get("actions", {}),
                "states": result.get("states", {}),
                "constraints": result.get("constraints", {}),
                "generated_by": "ollama",
            }
            _reset_success(self.idea_id, self.artifact_dir, self.step_name)
        else:
            _log(self.idea_id, self.step_name, f"LLM fallback: {error}")
            fail_count = _record_failure(self.idea_id, self.artifact_dir, self.step_name)
            content = {
                "idea_id": self.idea_id,
                "source_idea": idea,
                "entities": existing_vocab.get("entities", {}),
                "actions": existing_vocab.get("actions", {}),
                "states": existing_vocab.get("states", {}),
                "constraints": existing_vocab.get("constraints", {}),
                "generated_by": "fallback",
                "llm_error": error,
            }
            if fail_count >= 3:
                _emit_kernel_panic(
                    self.idea_id, os.path.join(PROJECT_ROOT, "events"),
                    self.step_name, f"LLM failed 3x consecutively: {error}")

        path = self._write_artifact("vocabulary.json", content)
        _log(self.idea_id, self.step_name, f"Artifact written: {path}")
        return self._completion_event(path)


class RequirementsHandler(StepHandler):
    step_name = "requirements"
    completion_type = "RequirementsFormalized"

    def handle(self):
        _log(self.idea_id, self.step_name, "Starting requirements generation")
        idea = self.workflow.get("idea", "")
        vocab = self.load_prior_artifact("vocabulary.json") or \
                self.workflow.get("vocabulary", {})

        result, error = generate_for_step("requirements", {
            "idea": idea,
            "vocabulary": vocab,
        })

        if result and "functional_requirements" in result:
            content = {
                "idea_id": self.idea_id,
                "functional_requirements": result["functional_requirements"],
                "vocabulary_ref_path": self._artifact_path("vocabulary.json"),
                "generated_by": "ollama",
            }
            _reset_success(self.idea_id, self.artifact_dir, self.step_name)
        else:
            _log(self.idea_id, self.step_name, f"LLM fallback: {error}")
            fail_count = _record_failure(self.idea_id, self.artifact_dir, self.step_name)
            content = {
                "idea_id": self.idea_id,
                "functional_requirements": [
                    {"id": f"FR-{i}", "description": f"TODO: derive from {idea}"}
                    for i in range(1, 4)
                ],
                "vocabulary_ref_path": self._artifact_path("vocabulary.json"),
                "generated_by": "fallback",
                "llm_error": error,
            }
            if fail_count >= 3:
                _emit_kernel_panic(
                    self.idea_id, os.path.join(PROJECT_ROOT, "events"),
                    self.step_name, f"LLM failed 3x consecutively: {error}")

        path = self._write_artifact("requirements.json", content)
        _log(self.idea_id, self.step_name, f"Artifact written: {path}")
        return self._completion_event(path)


class TypeSpecHandler(StepHandler):
    step_name = "typespec"
    completion_type = "TypeSpecDrafted"

    def handle(self):
        _log(self.idea_id, self.step_name, "Starting TypeSpec generation")
        idea = self.workflow.get("idea", "")
        requirements_data = self.load_prior_artifact("requirements.json")
        vocab = self.load_prior_artifact("vocabulary.json")

        requirements = []
        if requirements_data and "functional_requirements" in requirements_data:
            requirements = requirements_data["functional_requirements"]

        result, error = generate_for_step("typespec", {
            "idea": idea,
            "requirements": requirements,
            "vocabulary": vocab or {},
        })

        if result and "typespec_source" in result:
            tsp_content = result["typespec_source"]
            _reset_success(self.idea_id, self.artifact_dir, self.step_name)
        else:
            _log(self.idea_id, self.step_name, f"LLM fallback: {error}")
            fail_count = _record_failure(self.idea_id, self.artifact_dir, self.step_name)
            tsp_content = f"""\
// TypeSpec draft for: {idea}
// TODO: Replace with generated spec from Ollama
// LLM error: {error}

namespace Demo;

model ExampleModel {{
  id: string;
  createdAt: utcDateTime;
}}
"""
            if fail_count >= 3:
                _emit_kernel_panic(
                    self.idea_id, os.path.join(PROJECT_ROOT, "events"),
                    self.step_name, f"LLM failed 3x consecutively: {error}")

        path = self._artifact_path("main.tsp")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(tsp_content)
        _log(self.idea_id, self.step_name, f"Artifact written: {path}")
        return self._completion_event(path, {"format": "typespec"})


class CompileHandler(StepHandler):
    step_name = "compile"
    completion_type = "SpecCompiled"

    def handle(self):
        _log(self.idea_id, self.step_name, "Starting compilation")
        tsp_path = self._artifact_path("main.tsp")
        if not os.path.exists(tsp_path):
            _log(self.idea_id, self.step_name, f"No TypeSpec source found at {tsp_path}")
            fail_count = _record_failure(self.idea_id, self.artifact_dir, self.step_name)
            if fail_count >= 3:
                _emit_kernel_panic(
                    self.idea_id, os.path.join(PROJECT_ROOT, "events"),
                    self.step_name, "Compile failed 3x: no TypeSpec source")
            return self._emit_compile_failure("No TypeSpec source file found")

        # Use a sandbox directory inside artifacts
        sandbox = os.path.join(self.artifact_dir, self.idea_id, "sandbox_compile")
        os.makedirs(sandbox, exist_ok=True)

        # Copy TypeSpec source into sandbox
        sandbox_tsp = os.path.join(sandbox, "main.tsp")
        shutil.copy2(tsp_path, sandbox_tsp)

        # Attempt tsp compile
        try:
            proc = subprocess.run(
                ["tsp", "compile", "main.tsp"],
                cwd=sandbox,
                capture_output=True,
                text=True,
                timeout=120,
            )
            exit_code = proc.returncode
            stdout = proc.stdout
            stderr = proc.stderr
        except FileNotFoundError:
            exit_code = 127
            stdout = ""
            stderr = "tsp command not found. Install TypeSpec compiler."
        except subprocess.TimeoutExpired:
            exit_code = 124
            stdout = ""
            stderr = "Compilation timed out after 120s"
        except Exception as e:
            exit_code = 1
            stdout = ""
            stderr = str(e)

        if exit_code == 0:
            # Collect output artifacts from sandbox
            output_files = []
            for root, dirs, files in os.walk(sandbox):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    rel = os.path.relpath(fpath, sandbox)
                    output_files.append(rel)

            compile_result = {
                "idea_id": self.idea_id,
                "exit_code": exit_code,
                "stdout": stdout,
                "stderr": stderr,
                "sandbox_files_list": output_files,
                "generated_by": "tsp_compile",
            }
            artifact_path = self._write_artifact("compiled.json", compile_result)

            # Write logs
            self._write_compile_logs(sandbox, stdout, stderr)

            _reset_success(self.idea_id, self.artifact_dir, self.step_name)
            _log(self.idea_id, self.step_name, f"Compilation succeeded. Artifact: {artifact_path}")
            return self._completion_event(artifact_path, {
                "exit_code": exit_code,
                "output_files": output_files,
            })
        else:
            _log(self.idea_id, self.step_name, f"Compilation failed (exit code {exit_code})")
            fail_count = _record_failure(self.idea_id, self.artifact_dir, self.step_name)

            # Write failure logs
            self._write_compile_logs(sandbox, stdout, stderr)

            if fail_count >= 3:
                _emit_kernel_panic(
                    self.idea_id, os.path.join(PROJECT_ROOT, "events"),
                    self.step_name,
                    f"Compile failed 3x consecutively (last exit: {exit_code}): {stderr[:200]}")

            failure_artifact = self._write_artifact("compile_failure.json", {
                "idea_id": self.idea_id,
                "exit_code": exit_code,
                "stdout": stdout,
                "stderr": stderr,
                "generated_by": "tsp_compile",
                "status": "failed",
            })
            return self._emit_compile_failure(stderr[:500], failure_artifact)

    def _write_compile_logs(self, sandbox, stdout, stderr):
        """Copy compile stdout/stderr to artifact logs."""
        log_dir = os.path.join(self.artifact_dir, self.idea_id)
        os.makedirs(log_dir, exist_ok=True)
        with open(os.path.join(log_dir, "compile_stdout.log"), "w") as f:
            f.write(stdout)
        with open(os.path.join(log_dir, "compile_stderr.log"), "w") as f:
            f.write(stderr)

    def _emit_compile_failure(self, error_summary, artifact_path=None):
        failure_event = {
            "id": str(uuid.uuid4()),
            "type": "StepRejected",
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "source": "system",
            "payload": {
                "idea_id": self.idea_id,
                "step": self.step_name,
                "reason": f"Compilation failed: {error_summary}",
                "artifact_path": artifact_path,
            },
        }
        out_dir = os.path.join(PROJECT_ROOT, "events")
        path = os.path.join(out_dir, f"{failure_event['id']}.json")
        with open(path, "w") as f:
            json.dump(failure_event, f, indent=2)
        _log(self.idea_id, self.step_name, f"Failure event written: {path}")
        return failure_event


class RefactorHandler(StepHandler):
    step_name = "refactor"
    completion_type = "RefactorDrafted"

    def handle(self):
        _log(self.idea_id, self.step_name, "Starting refactor plan generation")
        idea = self.workflow.get("idea", "")
        compiled_data = self.load_prior_artifact("compiled.json")
        tsp_content = None
        tsp_path = self._artifact_path("main.tsp")
        if os.path.exists(tsp_path):
            with open(tsp_path) as f:
                tsp_content = f.read()

        result, error = generate_for_step("refactor", {
            "idea": idea,
            "compiled_artifact": compiled_data or {},
            "typespec_source": tsp_content,
        })

        if result and "files_to_modify" in result:
            content = {
                "idea_id": self.idea_id,
                "refactor_plan": {
                    "files_to_modify": result.get("files_to_modify", []),
                    "new_files": result.get("new_files", []),
                    "modifications": result.get("modifications", []),
                    "risks": result.get("risks", []),
                },
                "generated_by": "ollama",
            }
            _reset_success(self.idea_id, self.artifact_dir, self.step_name)
        else:
            _log(self.idea_id, self.step_name, f"LLM fallback: {error}")
            fail_count = _record_failure(self.idea_id, self.artifact_dir, self.step_name)
            content = {
                "idea_id": self.idea_id,
                "refactor_plan": {
                    "files_to_modify": [],
                    "new_files": [],
                    "note": f"Refactor plan for: {idea}",
                },
                "generated_by": "fallback",
                "llm_error": error,
            }
            if fail_count >= 3:
                _emit_kernel_panic(
                    self.idea_id, os.path.join(PROJECT_ROOT, "events"),
                    self.step_name, f"LLM failed 3x consecutively: {error}")

        path = self._write_artifact("refactor_plan.json", content)
        _log(self.idea_id, self.step_name, f"Artifact written: {path}")
        return self._completion_event(path)


class IntegrateHandler(StepHandler):
    step_name = "integrate"
    completion_type = "Integrated"

    def handle(self):
        _log(self.idea_id, self.step_name, "Starting integration (patch generation)")
        idea = self.workflow.get("idea", "")
        refactor_data = self.load_prior_artifact("refactor_plan.json")
        compiled_data = self.load_prior_artifact("compiled.json")

        # Gather current state of artifacts
        current_state = self._gather_current_state()
        proposed_state = self._build_proposed_state()

        # Generate unified diff / patch
        patch_content = self._generate_patch(current_state, proposed_state)

        patch_path = self._write_patch(patch_content)

        integrate_artifact = {
            "idea_id": self.idea_id,
            "status": "patch_ready",
            "patch_path": patch_path,
            "changes_summary": self._summarize_changes(current_state, proposed_state),
            "generated_by": "integrate_handler",
            "requires_approval": True,
        }
        artifact_path = self._write_artifact("integrate_plan.json", integrate_artifact)

        _log(self.idea_id, self.step_name, f"Patch written: {patch_path}")
        _log(self.idea_id, self.step_name, f"Artifact written: {artifact_path}")
        return self._completion_event(artifact_path, {
            "patch_path": patch_path,
            "changes_count": len(integrate_artifact["changes_summary"]),
        })

    def _gather_current_state(self):
        """Collect all existing artifact content as baseline."""
        state = {}
        artifact_dir = os.path.join(self.artifact_dir, self.idea_id)
        if not os.path.exists(artifact_dir):
            return state
        for fname in os.listdir(artifact_dir):
            fpath = os.path.join(artifact_dir, fname)
            if fname.startswith(".") or fname.startswith("sandbox") or \
               not os.path.isfile(fpath) or fname.endswith(".patch") or \
               fname.endswith(".log"):
                continue
            try:
                with open(fpath) as f:
                    state[fname] = f.read()
            except Exception:
                state[fname] = "<binary>"
        return state

    def _build_proposed_state(self):
        """Build the proposed new state from compiled artifacts + refactor plan."""
        state = self._gather_current_state()
        # In a full implementation, this would apply the refactor plan
        # For now, add compiled output as proposed additions
        compiled_path = self._artifact_path("compiled.json")
        if os.path.exists(compiled_path):
            with open(compiled_path) as f:
                state["compiled_output.json"] = json.dumps(json.load(f), indent=2)
        return state

    def _generate_patch(self, current, proposed):
        """Generate a unified diff between current and proposed state."""
        lines = []
        all_keys = sorted(set(list(current.keys()) + list(proposed.keys())))
        for key in all_keys:
            current_lines = current.get(key, "").splitlines(keepends=True)
            proposed_lines = proposed.get(key, "").splitlines(keepends=True)
            diff = difflib.unified_diff(
                current_lines, proposed_lines,
                fromfile=f"a/{key}", tofile=f"b/{key}",
                lineterm="",
            )
            lines.extend(diff)
            lines.append("")  # blank line between diffs
        return "\n".join(lines) if lines else "# No changes\n"

    def _write_patch(self, patch_content):
        """Write the patch file to artifacts/<idea_id>/integrate.patch."""
        patch_path = self._artifact_path("integrate.patch")
        os.makedirs(os.path.dirname(patch_path), exist_ok=True)
        with open(patch_path, "w") as f:
            f.write(patch_content)
        return patch_path

    def _summarize_changes(self, current, proposed):
        """Produce a human-readable summary of what changed."""
        summary = []
        all_keys = sorted(set(list(current.keys()) + list(proposed.keys())))
        for key in all_keys:
            if key not in current:
                summary.append(f"  + ADDED: {key}")
            elif key not in proposed:
                summary.append(f"  - REMOVED: {key}")
            elif current[key] != proposed[key]:
                summary.append(f"  ~ MODIFIED: {key}")
        return summary if summary else ["  (no changes)"]
