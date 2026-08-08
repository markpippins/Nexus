.PHONY: cir1 cir1-scan cir1-lint cir1-fix cir1-validate \
        cir2-lint cir2-validate cir3-lint cir3-validate cir4-lint cir4-validate \
        cir5-lint cir5-validate \
        cir-arl cir-verify install-hooks \
        test-db-setup test-db-reset test \
        mesh-test \
        apidocs-extract apidocs-gen apidocs-validate apidocs-regen \
        mcp-start mcp-stop mcp-restart mcp-status mcp-watch

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

# ─── Test database ────────────────────────────────────────────────────────────

test-db-setup:
	@echo "Setting up conduit test database..."
	@CONDUIT_PG_DSN="$$(grep '^CONDUIT_PG_DSN=' legacy/python/conduit/.env | cut -d= -f2-)" ; \
		export CONDUIT_PG_DSN ; \
		cd legacy/python/conduit && python3 setup_test_db.py

test-db-reset:
	@echo "Resetting conduit test database..."
	@CONDUIT_PG_DSN="$$(grep '^CONDUIT_PG_DSN=' legacy/python/conduit/.env | cut -d= -f2-)" ; \
		export CONDUIT_PG_DSN ; \
		cd legacy/python/conduit && python3 setup_test_db.py --drop

test:
	@echo "Running conduit tests..."
	@cd legacy/python/conduit && \
		test -f .env.test && \
			CONDUIT_PG_DSN="$$(grep '^CONDUIT_PG_DSN=' .env.test | cut -d= -f2-)" \
			CONDUIT_PG_SCHEMA="$$(grep '^CONDUIT_PG_SCHEMA=' .env.test | cut -d= -f2-)" \
		|| CONDUIT_PG_DSN="$$(grep '^CONDUIT_PG_DSN=' .env | cut -d= -f2-)" \
			CONDUIT_PG_SCHEMA="$$(grep '^CONDUIT_PG_SCHEMA=' .env | cut -d= -f2-)" ; \
		export CONDUIT_PG_DSN CONDUIT_PG_SCHEMA ; \
		python3 -m pytest test_guard.py tests/test_lifecycle.py \
			tests/test_dispatch_integration.py tests/test_db_adapter_pg_init.py \
			tests/test_e2e_pipeline.py tests/test_e2e_pipeline_v2.py -v

# ─── MCP Server Management ───────────────────────────────────────────────────
# The daemon auto-restarts the server on crash.  Use `mcp-restart` after
# making code changes to pick up the new build.  Use `mcp-watch` during
# development to auto-restart on every file save.

MCP_DAEMON := typescript/conduit-mcp/scripts/mcp-daemon.sh

mcp-start:
	@bash $(MCP_DAEMON) start

mcp-stop:
	@bash $(MCP_DAEMON) stop

mcp-restart:
	@bash $(MCP_DAEMON) restart

mcp-status:
	@bash $(MCP_DAEMON) status

mcp-watch:
	@echo "Starting MCP server in watch mode — auto-restarts on file changes."
	@echo "Kill with Ctrl-C."
	@cd typescript/conduit-mcp && npx tsx watch src/index.ts

# ─── mesh-register probe tests (Python pytest) ────────────────────────────────
# Backed by nexus/.github/workflows/mesh-pytest.yml — same command locally
# and in CI. Keeps the vendor-extension regression locked in (see commit
# history for context).
#
# `mesh-test` only RUNS pytest; it does NOT install it. First-time setup
# is `pip install -r requirements-dev.txt` (the same file CI uses).

mesh-test:
	@echo "[mesh-test] running mesh-register probe tests..."
	@python3 -m pytest bin/tests/test_mesh_register_probe.py -v

# ─── API docs (tools/api-docs) ───────────────────────────────────────────────
# Backed by nexus/.github/workflows/apidocs.yml — same commands locally and
# in CI. Extracts the live route inventory from source and verifies every
# committed *-srv openapi.yaml still matches it.
#
#   make apidocs-validate   # CI gate: exit 1 on drift
#   make apidocs-regen      # refresh openapi.yaml + API.md after route changes
#   make apidocs-gen        # generate only (SKIP_FASTAPI=1 avoids the live
#                           #   vision-srv /openapi.json fetch, for CI)

APIDOCS_INV := /tmp/api_inventory.json

apidocs-extract:
	@echo "[apidocs] extracting route inventory..."
	@python3 tools/api-docs/extract_routes.py --out $(APIDOCS_INV)

apidocs-gen:
	@echo "[apidocs] generating openapi.yaml + API.md..."
	@python3 tools/api-docs/gen_openapi.py --inventory $(APIDOCS_INV) $(if $(SKIP_FASTAPI),--skip-fastapi,)

apidocs-validate:
	@$(MAKE) apidocs-extract
	@echo "[apidocs] drift check..."
	@python3 tools/api-docs/check_drift.py

apidocs-regen:
	@$(MAKE) apidocs-extract
	@$(MAKE) apidocs-gen

# ─── Git hooks ────────────────────────────────────────────────────────────────

install-hooks:
	@echo "Installing CIR pre-commit hook..."
	@cp .githooks/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "Done."
