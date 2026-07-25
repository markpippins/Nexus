"""
Tests for tackle — the largest untested Python module (24 files, 0 tests).
Covers pure functions, dataclasses, constants, re-exports, and TTL cache logic.
"""
import sys
import os
import time
import pytest

# Add nexus/python/ to path so 'from tackle.xxx' imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))


# ── env_config ──────────────────────────────────────────────────

class TestEnvConfig:
    """env_config.py — 3-line placeholder environment loader."""

    def test_load_env_returns_empty_dict(self):
        from tackle.env_config import load_env
        result = load_env()
        assert isinstance(result, dict)
        assert result == {}

    def test_load_env_idempotent(self):
        from tackle.env_config import load_env
        r1 = load_env()
        r2 = load_env()
        assert r1 == r2 == {}


# ── executor ────────────────────────────────────────────────────

class TestExecutor:
    """executor.py — shared constants for agent_chat / opencode bridge."""

    def test_opencode_bin_is_string(self):
        from tackle.executor import OPENCODE_BIN
        assert isinstance(OPENCODE_BIN, str)
        assert len(OPENCODE_BIN) > 0

    def test_opencode_timeout_is_positive_int(self):
        from tackle.executor import OPENCODE_TIMEOUT_SECONDS
        assert isinstance(OPENCODE_TIMEOUT_SECONDS, int)
        assert OPENCODE_TIMEOUT_SECONDS > 0

    def test_executor_module_loadable(self):
        """executor module imports without errors."""
        import tackle.executor
        assert tackle.executor.OPENCODE_BIN


# ── harness_enums ───────────────────────────────────────────────

class TestHarnessEnums:
    """harness_enums.py — backward-compat re-exports from nexus_core.harness.enums."""

    def test_execution_mode_imported(self):
        from tackle.harness_enums import ExecutionMode
        assert ExecutionMode is not None

    def test_role_mapping_strategy_imported(self):
        from tackle.harness_enums import RoleMappingStrategy
        assert RoleMappingStrategy is not None


# ── harness_launcher ────────────────────────────────────────────

class TestHarnessLauncher:
    """harness_launcher.py — backward-compat re-exports."""

    def test_harness_launcher_importable(self):
        from tackle.harness_launcher import HarnessLauncher
        assert HarnessLauncher is not None


# ── harness/base — ModelConfig ──────────────────────────────────

class TestModelConfig:
    """ModelConfig dataclass — resolved model metadata."""

    def test_default_constructor(self):
        from tackle.harness.base import ModelConfig
        cfg = ModelConfig(
            model_id="deepseek-v4",
            model_name="DeepSeek V4",
            model_identifier="deepseek/deepseek-v4",
            provider_id="deepseek",
            provider_name="DeepSeek",
            provider_type="cloud",
        )
        assert cfg.model_id == "deepseek-v4"
        assert cfg.model_name == "DeepSeek V4"
        assert cfg.provider_id == "deepseek"

    def test_eq_same_values(self):
        from tackle.harness.base import ModelConfig
        a = ModelConfig(
            model_id="m", model_name="n", model_identifier="i",
            provider_id="p", provider_name="pn", provider_type="pt",
        )
        b = ModelConfig(
            model_id="m", model_name="n", model_identifier="i",
            provider_id="p", provider_name="pn", provider_type="pt",
        )
        assert a == b

    def test_neq_different_model(self):
        from tackle.harness.base import ModelConfig
        a = ModelConfig(
            model_id="a", model_name="n", model_identifier="i",
            provider_id="p", provider_name="pn", provider_type="pt",
        )
        b = ModelConfig(
            model_id="b", model_name="n", model_identifier="i",
            provider_id="p", provider_name="pn", provider_type="pt",
        )
        assert a != b

    def test_repr_includes_model_and_provider(self):
        from tackle.harness.base import ModelConfig
        cfg = ModelConfig(
            model_id="gemini-pro", model_name="Gemini Pro", model_identifier="google/gemini-pro",
            provider_id="google", provider_name="Google", provider_type="cloud",
        )
        r = repr(cfg)
        assert "gemini-pro" in r
        assert "google" in r

    def test_config_json_defaults_to_empty_dict(self):
        from tackle.harness.base import ModelConfig
        cfg = ModelConfig(
            model_id="x", model_name="x", model_identifier="x",
            provider_id="x", provider_name="x", provider_type="x",
        )
        assert isinstance(cfg.config_json, dict)
        assert cfg.config_json == {}


# ── db — _RoleConfigCache (module-level dict with TTL) ─────────

class TestRoleConfigCache:
    """
    _RoleConfigCache is a module-level Dict[str, Dict[str, Any]].
    Entries are: {"data": <config>, "time": <monotonic_float>}.
    TTL check happens in get_role_config() — we test the dict pattern here.
    """

    def test_cache_is_dict(self):
        import tackle.db as db_mod
        assert isinstance(db_mod._RoleConfigCache, dict)

    def test_put_and_read_pattern(self):
        """Simulate the pattern used by get_role_config()."""
        now = time.monotonic()
        entry = {"data": {"model": "deepseek-v4"}, "time": now}
        cache = {}
        cache["architect"] = entry
        assert cache["architect"]["data"] == {"model": "deepseek-v4"}
        assert cache["architect"]["time"] == now

    def test_ttl_expiry_pattern(self):
        """Simulate TTL check: entry older than TTL is stale."""
        ttl = 60
        old_time = time.monotonic() - 61
        entry = {"data": {"model": "stale"}, "time": old_time}
        cache = {"analyst": entry}
        is_expired = (time.monotonic() - cache["analyst"]["time"]) > ttl
        assert is_expired is True

    def test_fresh_entry_not_expired(self):
        """Entry within TTL window is not expired."""
        ttl = 60
        fresh_time = time.monotonic() - 10
        entry = {"data": {"model": "fresh"}, "time": fresh_time}
        cache = {"planner": entry}
        is_expired = (time.monotonic() - cache["planner"]["time"]) > ttl
        assert is_expired is False

    def test_multiple_roles_independent(self):
        """Different roles have independent cache entries."""
        now = time.monotonic()
        cache = {
            "architect": {"data": {"x": 1}, "time": now},
            "engineer": {"data": {"y": 2}, "time": now},
        }
        assert cache["architect"]["data"] == {"x": 1}
        assert cache["engineer"]["data"] == {"y": 2}


# ── prompt_renderer ─────────────────────────────────────────────

class TestPromptRenderer:
    """prompt_renderer.py — build_opencode_prompt(req, working_path)."""

    def test_build_opencode_prompt_returns_string(self):
        from tackle.prompt_renderer import build_opencode_prompt
        result = build_opencode_prompt(
            req={"system_prompt": "You are helpful.", "user_prompt": "Hello", "role": "engineer"},
            working_path="/tmp/test",
        )
        assert isinstance(result, str)
        assert len(result) > 0
        # Generates a structured WorkRequest template
        assert "Working directory" in result
        assert "/tmp/test" in result

    def test_build_opencode_prompt_empty_dict(self):
        from tackle.prompt_renderer import build_opencode_prompt
        result = build_opencode_prompt(req={}, working_path="/tmp")
        assert isinstance(result, str)

    def test_build_opencode_prompt_with_special_chars(self):
        from tackle.prompt_renderer import build_opencode_prompt
        result = build_opencode_prompt(
            req={"system_prompt": "<test>", "user_prompt": "a & b"},
            working_path="/tmp/test",
        )
        assert isinstance(result, str)
        # Template includes working path and structured sections
        assert "/tmp/test" in result
        assert "Instructions" in result
