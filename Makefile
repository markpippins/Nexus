.PHONY: cir1 cir1-scan cir1-lint cir1-fix cir1-validate \
        cir2-lint cir2-validate cir3-lint cir3-validate cir4-lint cir4-validate \
        cir5-lint cir5-validate \
        cir-arl cir-verify install-hooks

# ─── CIR-1: Full pipeline (read-only) ─────────────────────────────────────────

cir1:
	@echo "Running CIR-1 full pipeline (read-only)..."
	@$(MAKE) cir1-scan
	@$(MAKE) cir1-lint
	@$(MAKE) cir1-validate

cir1-scan:
	@echo "[CIR-1] scanning references..."
	@rg -n "intent_source|\.pipeline/|PIPELINE_|ExecutionState|ExecutorRegistry" . -g '!.git' -g '!*.lock' || true

cir1-lint:
	@echo "[CIR-1] AST linting JSON..."
	@python3 tools/cir1/lint.py

cir1-fix:
	@echo "[CIR-1] WARNING: patch.py is opt-in. Use 'make cir1-apply' or run patch.py --apply directly."
	@python3 tools/cir1/patch.py --dry-run

cir1-apply:
	@echo "[CIR-1] applying deterministic patches..."
	@python3 tools/cir1/patch.py --apply

cir1-validate:
	@echo "[CIR-1] validation gate..."
	@python3 tools/cir1/lint.py --strict

# ─── CIR-2: Cross-layer isolation ────────────────────────────────────────────

cir2-lint:
	@echo "[CIR-2] checking cross-layer isolation..."
	@python3 tools/cir1/lint.py --cir2

cir2-validate:
	@echo "[CIR-2] strict gate..."
	@python3 tools/cir1/lint.py --cir2 --strict

# ─── CIR-3: Execution semantics contract ─────────────────────────────────────

cir3-lint:
	@echo "[CIR-3] execution semantics check..."
	@python3 tools/cir1/lint.py --cir3

cir3-validate:
	@echo "[CIR-3] strict execution gate..."
	@python3 tools/cir1/lint.py --cir3 --strict

# ─── CIR-4: Static derived state ─────────────────────────────────────────────

cir4-lint:
	@echo "[CIR-4] derived state integrity check..."
	@python3 tools/cir1/lint.py --cir4

cir4-validate:
	@echo "[CIR-4] strict derived-state gate..."
	@python3 tools/cir1/lint.py --cir4 --strict

# ─── CIR-5: Single Canonical Authority Rule ──────────────────────────────────

cir5-lint:
	@echo "[CIR-5] authority consistency check..."
	@python3 tools/cir1/lint.py --cir5

cir5-validate:
	@echo "[CIR-5] strict authority gate..."
	@python3 tools/cir1/lint.py --cir5 --strict

# ─── CIR v2: Anti-Recursion Linter ────────────────────────────────────────────

cir-arl:
	@echo "[CIR-ARL] running Anti-Recursion Linter..."
	@python3 tools/arl_linter.py

cir-arl-json:
	@echo "[CIR-ARL] running Anti-Recursion Linter (JSON output)..."
	@python3 tools/arl_linter.py --json

# ─── CIR v2: Full verification suite ─────────────────────────────────────────

cir-verify:
	@echo "Running full CIR verification suite..."
	@$(MAKE) cir1-lint
	@$(MAKE) cir2-lint
	@$(MAKE) cir3-lint
	@$(MAKE) cir4-lint
	@$(MAKE) cir5-lint
	@$(MAKE) cir-arl

cir-validate:
	@echo "Running full CIR validation suite..."
	@$(MAKE) cir1-validate
	@$(MAKE) cir2-validate
	@$(MAKE) cir3-validate
	@$(MAKE) cir4-validate
	@$(MAKE) cir5-validate
	@$(MAKE) cir-arl

# ─── Git hooks ────────────────────────────────────────────────────────────────

install-hooks:
	@echo "Installing CIR pre-commit hook..."
	@cp .githooks/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "Done."
