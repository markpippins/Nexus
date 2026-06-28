#!/usr/bin/env python3
"""Smoke tests for HarnessLauncher — builds launchers for all 4 seeded harnesses
and verifies the command output shape.

Run:  python -m pytest nexus/legacy/python/conduit/tests/test_harness_launcher.py -v
"""

import json
import sys
import os

# Ensure the harness_launcher module is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tackle.harness_launcher import HarnessLauncher
from tackle.harness_enums import ExecutionMode, RoleMappingStrategy


# ── Fixture data (matches the seeded DB state from nexus/typescript/conduit-mcp/src/db.ts) ──

FIXTURE_OPENCODE = {
    "name": "Opencode CLI (openai)",
    "invocation_semantics": json.dumps({
        "binary": "opencode",
        "capabilities": {"model": True, "agent": True, "working_directory": True, "system_prompt": False},
        "execution": {"mode": "interactive", "subcommand": "run"},
        "semantics": {
            "model": {"type": "flag", "flag": "--model"},
            "agent": {"type": "flag", "flag": "--agent"},
            "working_directory": {"type": "flag", "flag": "--dir"},
        },
        "role_mapping": {"strategy": "agent"},
    }),
}

FIXTURE_OPENCODE_ANTHROPIC = {
    "name": "Opencode CLI (anthropic)",
    "invocation_semantics": json.dumps({
        "binary": "opencode",
        "capabilities": {"model": True, "agent": True, "working_directory": True, "system_prompt": False},
        "execution": {"mode": "interactive", "subcommand": "run"},
        "semantics": {
            "model": {"type": "flag", "flag": "--model"},
            "agent": {"type": "flag", "flag": "--agent"},
            "working_directory": {"type": "flag", "flag": "--dir"},
        },
        "role_mapping": {"strategy": "agent"},
    }),
}

FIXTURE_OLLAMA = {
    "name": "Ollama SDK",
    "invocation_semantics": json.dumps({
        "binary": "ollama",
        "capabilities": {"model": True, "agent": False, "working_directory": False, "system_prompt": True},
        "execution": {"mode": "daemon"},
        "semantics": {
            "model": {"type": "positional_after_subcommand", "subcommand": "run"},
            "system_prompt": {"type": "flag", "flag": "--system"},
        },
        "role_mapping": {"strategy": "none"},
    }),
}

FIXTURE_CODEX = {
    "name": "Codex CLI",
    "invocation_semantics": json.dumps({
        "binary": "codex",
        "capabilities": {"model": False, "agent": False, "working_directory": True, "system_prompt": True},
        "execution": {"mode": "oneshot", "subcommand": "exec"},
        "semantics": {
            "working_directory": {"type": "flag", "flag": "--cd"},
        },
        "role_mapping": {"strategy": "prompt_file"},
    }),
}


# ── Harness: Opencode (openai) ───────────────────────────────────────

class TestOpencode:
    """Smoke test for the Opencode CLI (openai) harness."""

    def test_properties(self):
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OPENCODE)
        assert launcher.binary == "opencode"
        assert launcher.execution_mode == ExecutionMode.INTERACTIVE
        assert launcher.role_mapping_strategy == RoleMappingStrategy.AGENT
        assert launcher.capabilities == {"model": True, "agent": True, "working_directory": True, "system_prompt": False}

    def test_build_full_command(self):
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OPENCODE)
        launcher.set_model("gpt-4o")
        launcher.set_agent("planner")
        launcher.set_working_directory("/home/codex/dev")
        launcher.set_prompt("Implement feature X")

        cmd = launcher.build()
        assert cmd == [
            "opencode", "run",
            "--agent", "planner",
            "--dir", "/home/codex/dev",
            "--model", "gpt-4o",
            "Implement feature X",
        ]

    def test_build_minimal(self):
        """Only prompt — capabilities that are false should not emit args."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OPENCODE)
        launcher.set_prompt("Hello")
        cmd = launcher.build()
        assert cmd == ["opencode", "run", "Hello"]

    def test_build_without_agent(self):
        """Agent is stored but not emitted as CLI args when strategy is AGENT."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OPENCODE)
        launcher.set_model("claude-sonnet-4")
        launcher.set_prompt("Task")
        cmd = launcher.build()
        # agent capability is true but no agent set — no --agent flag
        assert cmd == ["opencode", "run", "--model", "claude-sonnet-4", "Task"]

    def test_capability_gate(self):
        """system_prompt is false — set_system_prompt should not appear in build."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OPENCODE)
        launcher.set_system_prompt("You are an expert.")
        launcher.set_prompt("Do something")
        cmd = launcher.build()
        # system_prompt is not set on capabilities, so --system-prompt should not appear
        assert "--system-prompt" not in cmd
        # But the prompt itself should be there
        assert "Do something" in cmd


# ── Harness: Opencode (anthropic) ────────────────────────────────────

class TestOpencodeAnthropic:
    """Smoke test for the Opencode CLI (anthropic) harness — identical shape to openai variant."""

    def test_properties(self):
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OPENCODE_ANTHROPIC)
        assert launcher.binary == "opencode"
        assert launcher.execution_mode == ExecutionMode.INTERACTIVE
        assert launcher.role_mapping_strategy == RoleMappingStrategy.AGENT

    def test_build_full_command(self):
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OPENCODE_ANTHROPIC)
        launcher.set_model("claude-sonnet-4-20250514")
        launcher.set_agent("builder")
        launcher.set_working_directory("/tmp/test")
        launcher.set_prompt("Build something")

        cmd = launcher.build()
        assert cmd == [
            "opencode", "run",
            "--agent", "builder",
            "--dir", "/tmp/test",
            "--model", "claude-sonnet-4-20250514",
            "Build something",
        ]


# ── Harness: Ollama SDK ─────────────────────────────────────────────

class TestOllama:
    """Smoke test for the Ollama SDK harness (daemon, positional model, system_flag)."""

    def test_properties(self):
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OLLAMA)
        assert launcher.binary == "ollama"
        assert launcher.execution_mode == ExecutionMode.DAEMON
        assert launcher.role_mapping_strategy == RoleMappingStrategy.NONE
        assert launcher.capabilities == {"model": True, "agent": False, "working_directory": False, "system_prompt": True}

    def test_build_with_model_and_system(self):
        """Model is positional after 'run' subcommand.

        NOTE: system_prompt is stored but not emitted as a CLI flag when
        role_mapping_strategy is NONE — build() only emits it for SYSTEM_FLAG.
        """
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OLLAMA)
        launcher.set_model("qwen2.5-coder")
        launcher.set_system_prompt("You are an expert Python developer.")
        launcher.set_prompt("Write a unit test")

        cmd = launcher.build()
        # system_prompt is stored but not emitted for NONE strategy
        assert "--system" not in cmd
        assert cmd == [
            "ollama", "run", "qwen2.5-coder",
            "Write a unit test",
        ]

    def test_build_minimal(self):
        """Just a prompt — no model or system set."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OLLAMA)
        launcher.set_prompt("Hello")
        cmd = launcher.build()
        assert cmd == ["ollama", "Hello"]

    def test_capability_gate_working_directory(self):
        """working_directory capability is false — set_working_directory should not appear."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_OLLAMA)
        launcher.set_working_directory("/some/path")
        launcher.set_prompt("Task")
        cmd = launcher.build()
        assert "--dir" not in cmd
        assert "/some/path" not in cmd[2:]


# ── Harness: Codex CLI ─────────────────────────────────────────────

class TestCodex:
    """Smoke test for the Codex CLI harness (oneshot, prompt_file strategy)."""

    def test_properties(self):
        launcher = HarnessLauncher.from_harness_row(FIXTURE_CODEX)
        assert launcher.binary == "codex"
        assert launcher.execution_mode == ExecutionMode.ONESHOT
        assert launcher.role_mapping_strategy == RoleMappingStrategy.PROMPT_FILE
        assert launcher.capabilities == {"model": False, "agent": False, "working_directory": True, "system_prompt": True}

    def test_build_with_working_directory_and_system(self):
        """Codex supports --cd for working dir. Prompt file strategy means
        the prompt is NOT on the command line until prepare_role_prompt_file is called."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_CODEX)
        launcher.set_working_directory("/home/codex/dev")
        launcher.set_system_prompt("You are an expert coder.")
        launcher.set_agent("reviewer")
        launcher.set_prompt("Review this code for bugs")

        # Without prepare_role_prompt_file — prompt is a positional fallback
        cmd = launcher.build()
        # For PROMPT_FILE strategy with no prompt_file_path set, prompt falls back to inline
        # The system_prompt is NOT added as CLI arg because strategy is PROMPT_FILE
        # (system prompt goes into the file instead)
        assert cmd == [
            "codex", "exec",
            "--cd", "/home/codex/dev",
            "Review this code for bugs",
        ]

    def test_build_with_prompt_file(self, tmp_path):
        """When prepare_role_prompt_file is called, the file path replaces the inline prompt."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_CODEX)
        launcher.set_agent("reviewer")
        launcher.set_system_prompt("You are an expert coder.")
        launcher.set_prompt("Review this code for bugs")

        prompts_dir = str(tmp_path / "prompts")
        file_path = launcher.prepare_role_prompt_file(prompts_dir)

        assert file_path.endswith("role_reviewer.md")
        assert os.path.isfile(file_path)

        cmd = launcher.build()
        assert cmd == [
            "codex", "exec",
            file_path,
        ]

        # Verify file contents include both system prompt and prompt
        with open(file_path, encoding="utf-8") as f:
            content = f.read()
        assert "You are an expert coder." in content
        assert "Review this code for bugs" in content

    def test_build_minimal(self):
        """Just a prompt — no capabilities set."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_CODEX)
        launcher.set_prompt("Do something")
        cmd = launcher.build()
        assert cmd == ["codex", "exec", "Do something"]

    def test_capability_gate_model(self):
        """model capability is false — set_model should not affect build."""
        launcher = HarnessLauncher.from_harness_row(FIXTURE_CODEX)
        launcher.set_model("gpt-4o")
        launcher.set_prompt("Task")
        cmd = launcher.build()
        assert "--model" not in cmd


# ── Cross-harness shape checks ─────────────────────────────────────

class TestCrossHarness:
    """Verify that all 4 harnesses produce valid command shapes."""

    HARNESSES = [
        ("opencode (openai)", FIXTURE_OPENCODE),
        ("opencode (anthropic)", FIXTURE_OPENCODE_ANTHROPIC),
        ("ollama", FIXTURE_OLLAMA),
        ("codex", FIXTURE_CODEX),
    ]

    def test_all_build_return_list_of_strings(self):
        """All harnesses should return list[str] from build()."""
        for name, fixture in self.HARNESSES:
            launcher = HarnessLauncher.from_harness_row(fixture)
            launcher.set_prompt("test")
            cmd = launcher.build()
            assert isinstance(cmd, list), f"{name}: build() did not return a list"
            assert len(cmd) >= 1, f"{name}: build() returned empty list"
            assert all(isinstance(part, str) for part in cmd), f"{name}: not all parts are strings"

    def test_all_binary_is_first_element(self):
        """First element of the command should always be the binary path."""
        for name, fixture in self.HARNESSES:
            launcher = HarnessLauncher.from_harness_row(fixture)
            launcher.set_prompt("test")
            cmd = launcher.build()
            expected_binary = json.loads(fixture["invocation_semantics"]).get("binary", "?")
            assert cmd[0] == expected_binary, f"{name}: first element should be {expected_binary!r}, got {cmd[0]!r}"

    def test_all_respect_capabilities(self):
        """Setting a disabled capability should not produce CLI args for it."""
        for name, fixture in self.HARNESSES:
            launcher = HarnessLauncher.from_harness_row(fixture)
            launcher.set_model("some-model")
            launcher.set_working_directory("/some/path")
            launcher.set_prompt("task")
            cmd = " ".join(launcher.build())

            caps = json.loads(fixture["invocation_semantics"]).get("capabilities", {})
            semantics = json.loads(fixture["invocation_semantics"]).get("semantics", {})

            for cap_key, enabled in caps.items():
                mapping = semantics.get(cap_key, {})
                flag = mapping.get("flag")
                if not enabled and flag:
                    assert flag not in cmd, (
                        f"{name}: flag {flag} for disabled capability {cap_key} found in command"
                    )
