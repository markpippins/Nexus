.PHONY: cir1 cir1-scan cir1-lint cir1-fix cir1-validate \
        cir2-lint cir2-validate cir3-lint cir3-validate cir4-lint cir4-validate \
        cir5-lint cir5-validate

# ─── CIR-1: Full pipeline ─────────────────────────────────────────────────────

cir1:
	@echo "Running CIR-1 full pipeline..."
	@$(MAKE) cir1-scan
	@$(MAKE) cir1-lint
	@$(MAKE) cir1-fix
	@$(MAKE) cir1-validate

cir1-scan:
	@echo "[CIR-1] scanning references..."
	@rg -n "intent_source|\.pipeline/|PIPELINE_|ExecutionState|ExecutorRegistry" . -g '!.git' -g '!*.lock' || true

cir1-lint:
	@echo "[CIR-1] AST linting JSON..."
	@python3 tools/cir1/lint.py

cir1-fix:
	@echo "[CIR-1] applying deterministic patches..."
	@python3 tools/cir1/patch.py

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
