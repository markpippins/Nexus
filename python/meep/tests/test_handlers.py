"""Tests for the handler registry."""

from meep.handlers import (
    execute_handler,
    register_handler,
    reset_registry,
)


class TestRegistry:
    def test_all_builtin_handlers_execute(self):
        """Every pre-registered handler returns a result without error."""
        names = [
            "specify_handler", "construct_handler", "verify_handler",
            "prepare_handler", "execute_handler", "collect_results_handler",
            "gather_context_handler", "analyze_handler", "report_findings_handler",
            "identify_conflicts_handler", "propose_resolution_handler",
            "apply_reconciliation_handler",
            "identify_issue_handler", "plan_change_handler", "apply_change_handler",
            "verify_fix_handler",
            "define_scenario_handler", "explore_alternative_handler",
            "compare_outcomes_handler",
            "collect_evidence_handler", "evaluate_compliance_handler",
            "report_audit_findings_handler",
            "scan_input_handler", "extract_key_points_handler",
            "produce_summary_handler",
            "analyze_constraints_handler", "modify_behavior_handler",
            "validate_constraints_handler",
            "clarify_intent_handler", "generic_handler",
        ]
        for name in names:
            result = execute_handler(name, "node-1", {})
            assert result["status"] == "ok", f"{name} failed"
            assert result["node_id"] == "node-1"

    def test_result_contains_handler_tag(self):
        """Simulated handlers mark themselves in the result."""
        result = execute_handler("execute_handler", "n1")
        assert result["handler"] == "simulated"

    def test_unknown_handler_raises_keyerror(self):
        """Unregistered handler name raises KeyError."""
        import pytest
        with pytest.raises(KeyError):
            execute_handler("nonexistent_handler", "n1")

    def test_register_custom_handler(self):
        """Custom handlers can be registered and override defaults."""
        def my_handler(node_id, config):
            return {"status": "custom", "node_id": node_id}

        register_handler("execute_handler", my_handler)
        result = execute_handler("execute_handler", "n1")
        assert result["status"] == "custom"

        # Reset for other tests
        reset_registry()

    def test_reset_registry_restores_defaults(self):
        """After reset, overridden handlers return to simulated behavior."""
        def my_handler(node_id, config):
            return {"status": "custom"}

        register_handler("execute_handler", my_handler)
        reset_registry()
        result = execute_handler("execute_handler", "n1")
        assert result["handler"] == "simulated"

    def test_handler_receives_config(self):
        """Handler receives the config dict from the ExecNode."""
        def capture_config(node_id, config):
            return {"config": config}

        register_handler("test_config", capture_config)
        result = execute_handler("test_config", "n1", {"key": "val"})
        assert result["config"] == {"key": "val"}
        reset_registry()
