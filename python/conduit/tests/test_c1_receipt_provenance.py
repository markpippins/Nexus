"""C1 engineering gates (Lilac Wave 1, plan 8261639).

Verifies the engineer C1 ratification gates from the Analyst's executable
receipt-path inventory (record f987be73) and the C2 contract draft:

1. Gate 1 — receipt-write provenance: source-channel, producer identity,
   process/invocation identity, contract version, and correlation id are
   stamped on every write, on BOTH channels (Python direct + HTTP
   front-door).
2. Gate 2 — unified canonical identity/idempotency contract: the REST
   route delegates to DBAdapter.insert_receipt and honors the caller's
   receipt id verbatim; the direct path derives the same
   rec-<plan>-<type>-<hex> scheme. No duplicated INSERT policy.
3. Gate 3 — canary mode/namespace: env-gated, fail-closed enforcement on
   the frozen synthetic surface (vision.receipts), with an explicit
   declaration mechanism for canary writes.

Style note: these follow the repo's source-contract testing convention
(see tests/test_c2_validate_receipt.py) — no DB required, asserts bind the
Python and TypeScript write surfaces to the contract.
"""
import os
import re

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def _read(relpath):
    with open(os.path.join(NEXUS_ROOT, relpath)) as f:
        return f.read()


# ── Gate 1: provenance on every write ───────────────────────────────────

class TestGate1Provenance:
    def test_adapter_has_provenance_helper(self):
        src = _read("python/conduit/db_adapter.py")
        assert "_receipt_provenance" in src
        # Required provenance fields per C2 contract draft §2.5
        for field in (
            "producer_id",
            "source_channel",
            "source_system",
            "process_id",
            "invocation_id",
            "contract_version",
            "correlation_id",
        ):
            assert f'"{field}"' in src, f"provenance field {field} missing"

    def test_adapter_stamps_provenance_into_metadata(self):
        src = _read("python/conduit/db_adapter.py")
        m = re.search(r"def insert_receipt\(.*?(?=\n    def )", src, re.DOTALL)
        assert m, "insert_receipt not found in db_adapter.py"
        body = m.group(0)
        assert "metadata.update(provenance)" in body, (
            "insert_receipt must stamp provenance into metadata"
        )

    def test_invocation_id_captured_at_module_level(self):
        src = _read("python/conduit/db_adapter.py")
        assert "INVOCATION_ID" in src, (
            "invocation identity must come from the process environment"
        )

    def test_rest_route_declares_front_door_identity(self):
        src = _read("typescript/conduit-mcp/src/index.ts")
        m = re.search(r'app\.post\("/vision/receipts".*?\n\}\);', src, re.DOTALL)
        assert m, "POST /vision/receipts handler not found"
        body = m.group(0)
        assert 'source_channel: \'conduit-mcp-http\'' in body
        assert "producer_id: 'conduit-mcp'" in body
        assert "receiptProvenanceMetadata" in body

    def test_shared_provenance_helper_exists_in_ts(self):
        src = _read("typescript/conduit-mcp/src/receipts.ts")
        assert "export function receiptProvenanceMetadata" in src
        for field in ("producer_id", "source_channel", "contract_version", "correlation_id"):
            assert field in src

    def test_all_ts_insert_sites_pass_provenance(self):
        for relpath in ("typescript/conduit-mcp/src/tools.ts",
                        "typescript/conduit-mcp/src/watcher.ts"):
            src = _read(relpath)
            assert src.count("api.insertReceipt") == src.count('source_channel: "conduit-mcp-http"'), (
                f"{relpath}: every insertReceipt call must declare the front-door channel"
            )

    def test_conduit_client_forwards_provenance_fields(self):
        src = _read("typescript/conduit-mcp/src/conduit-client.ts")
        m = re.search(r"export async function insertReceipt\(r: \{.*?\n\}", src, re.DOTALL)
        assert m, "insertReceipt client fn not found"
        body = m.group(0)
        for field in ("producer_id", "source_channel", "correlation_id"):
            assert field in body

    def test_rest_request_model_accepts_provenance(self):
        src = _read("python/conduit/app/api/routes_receipts.py")
        m = re.search(r"class ReceiptInsertRequest\(BaseModel\):.*?\n\n\nclass", src, re.DOTALL)
        assert m, "ReceiptInsertRequest not found"
        for field in ("producer_id", "source_channel", "correlation_id"):
            assert field in m.group(0)


# ── Gate 2: one identity/idempotency contract ────────────────────────────

class TestGate2UnifiedIdentity:
    def test_rest_route_delegates_to_adapter(self):
        src = _read("python/conduit/app/api/routes_receipts.py")
        m = re.search(r'def insert_receipt\(body: ReceiptInsertRequest\):.*?(?=\n@router|\Z)', src, re.DOTALL)
        assert m, "REST insert_receipt route not found"
        body = m.group(0)
        # The route must delegate to the adapter — no direct SQL inserts left.
        assert "db.insert_receipt(" in body, (
            "REST route must delegate to DBAdapter.insert_receipt (C1 gate 2)"
        )
        assert "INSERT INTO execution.receipts" not in body, (
            "REST route must not carry its own execution.receipts INSERT policy"
        )
        assert "INSERT INTO vision.receipts" not in body, (
            "REST route must not carry its own vision.receipts INSERT policy"
        )

    def test_rest_route_passes_caller_id_verbatim(self):
        src = _read("python/conduit/app/api/routes_receipts.py")
        m = re.search(r'def insert_receipt\(body: ReceiptInsertRequest\):.*?(?=\n@router|\Z)', src, re.DOTALL)
        body = m.group(0)
        assert "receipt_id=body.id" in body, (
            "caller-supplied receipt id must be honored verbatim (C1 canary finding)"
        )

    def test_adapter_honors_caller_receipt_id(self):
        src = _read("python/conduit/db_adapter.py")
        m = re.search(r"def insert_receipt\(.*?(?=\n    def )", src, re.DOTALL)
        body = m.group(0)
        assert "receipt_id: Optional[str] = None" in body
        assert "receipt_id = receipt_id or f\"rec-" in body, (
            "adapter must honor caller id, else derive the canonical rec- scheme"
        )
        # Same scheme shape as the old HTTP contract: rec-<plan>-<type>-<hex>
        assert 'f"rec-{plan_id}-{receipt_type}-' in body


# ── Gate 3: canary mode / namespace enforcement ──────────────────────────

class TestGate3CanaryPolicy:
    def test_adapter_has_canary_policy(self):
        src = _read("python/conduit/db_adapter.py")
        assert "_enforce_canary_policy" in src
        assert "CONDUIT_CANARY_ENFORCEMENT" in src

    def test_policy_is_fail_closed_in_enforce_mode(self):
        src = _read("python/conduit/db_adapter.py")
        m = re.search(r"def _enforce_canary_policy\(.*?(?=\n    def )", src, re.DOTALL)
        assert m, "_enforce_canary_policy not found"
        body = m.group(0)
        assert "PermissionError" in body, (
            "enforce mode must raise (fail closed) on undeclared synthetic writes"
        )

    def test_declaration_mechanism_present(self):
        src = _read("python/conduit/db_adapter.py")
        assert '"canary"' in src and '"canary_correlation_id"' in src, (
            "canary declaration mechanism (metadata canary + canary_correlation_id) required"
        )

    def test_policy_applies_to_fallback_branch_only(self):
        src = _read("python/conduit/db_adapter.py")
        m = re.search(r"def insert_receipt\(.*?(?=\n    def )", src, re.DOTALL)
        body = m.group(0)
        # fallback=True only on the vision.receipts branch
        assert "fallback=True" in body and "fallback=False" in body


# ── Gate 4: vision.receipts fallback reconciliation documentation ────────

class TestGate4FallbackDocumentation:
    def test_fallback_docstring_references_lilac_reconciliation(self):
        src = _read("python/conduit/db_adapter.py")
        m = re.search(r"def insert_receipt\(.*?(?=\n    def )", src, re.DOTALL)
        body = m.group(0)
        assert "resolution.receipt" in body, (
            "insert_receipt docstring must document the Lilac reconciliation "
            "path for the vision.receipts fallback (C1 gate 4)"
        )
        assert "resolution.migration_disposition" in body, (
            "fallback rows must carry an explicit migration disposition (R5: no silent joins)"
        )
