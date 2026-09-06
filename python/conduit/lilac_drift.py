"""Lilac drift-fixture parity (C3 cutover prep, plan 8261639).

The architect's first C3 cutover-prep step. This module is the GOLDEN
FIXTURE that pins the legacy→canonical write transformation that the
shadow seam performs, plus a parity checker that classifies each legacy
receipt against its canonical twin:

    parity | missing_twin | kind_drift | payload_drift | unmapped_type

Three consistency layers:

1. FIXTURE vs ADAPTER CODE  — ``check_adapter_consistency`` proves the
   fixture still describes the merged ``lilac.py`` mapping. A silent edit
   to either side fails loudly here.
2. FIXTURE vs DATABASE      — ``check_db_registry`` proves the live
   producer seeds, kind grants, version ranges and the grant trigger
   still match the ratified contract v1 tuple.
3. LEGACY vs CANONICAL      — ``parity_row``/``check_legacy_surface``
   classify real rows (shadow evidence) against the fixture.

The fixture fingerprint (``fixture_fingerprint``) is recorded in C3
cutover evidence; any change to the transformation flips it and requires
an explicit contract-v2 discussion — never a silent edit.

Run as a CLI for the live, read-only report:
    CONDUIT_PG_DSN='...' python3 lilac_drift.py
"""
import hashlib
import json
import os
import sys

# ── The golden fixture ────────────────────────────────────────────────────
# Mirrors lilac.RECEIPT_KIND_BY_TYPE / LILAC_CONTRACT_VERSION /
# LIFECYCLE_KINDS and the channel→producer stamping of db_adapter. Values
# here are CONTRACT, not convenience: ratified as contract v1
# (resolution.contract_version, schema_hash bfd5874f…, decision 1b02c07c).

KIND_BY_TYPE = {
    "PLAN_CREATE": "plan_create", "PLANNING": "planning",
    "IMPLEMENTATION": "implementation", "REVIEW": "review",
    "REVIEW_PASS": "review_pass", "REVIEW_REJECT": "review_reject",
    "CRITIQUE": "critique", "CRITIQUE_PASS": "critique_pass",
    "CRITIQUE_REJECT": "critique_reject", "BLOCK": "block",
    "HOLD": "hold", "CCNF_EXECUTION": "ccnf_execution",
    "REQUEUED": "requeued", "API_LIMIT": "api_limit",
    "ABANDONED": "abandoned", "CANCELLED": "cancelled",
    "PLAN_BLOCK": "plan_block",
}

# Legacy-only types with NO ratified canonical kind. The shadow seam skips
# them by design; the parity checker classifies them "unmapped_type", NOT
# drift. PROPOSED is admitted by chk_vision_receipts_type but was never
# given a lifecycle kind in the ratified vocabulary.
UNMAPPED_LEGACY_TYPES = ("PROPOSED",)

# Channel → producer stamping (db_adapter provenance; Q3 authority model).
# Corrected at C3 cutover prep: the python-direct channel declares
# 'nexus-conduit-python' (db_adapter._receipt_provenance), NOT the worker
# lane identity — registered in V142. The shadow seam stamps the DECLARING
# producer (payload.producer_id), so parity holds across all channels.
PRODUCER_BY_CHANNEL = {
    "conduit-mcp-http": "conduit-mcp",            # TS front-door → kernel REST
    "conduit-mcp-stdio": "conduit-mcp",           # MCP tools direct inserts
    "conduit-python": "nexus-conduit-python",     # Python kernel process (V142)
    "python-direct": "nexus-conduit-python",      # in-process adapter callers
    "nexus-execution-worker": "nexus-execution-worker",
}

DEFAULT_CONTRACT_VERSION = 1

GRANT_KINDS = (
    "plan_create", "planning", "implementation", "review", "review_pass",
    "review_reject", "critique", "critique_pass", "critique_reject",
    "block", "hold", "ccnf_execution", "requeued", "api_limit",
    "abandoned", "cancelled", "plan_block",
)

PEB_ADMISSION_GRANT = ("admission",)  # Q3: PEB is the sole admission grantee

# Structural payload fields the parity checker compares between a legacy
# row and its canonical twin's payload blob.
PAYLOAD_IDENTITY_FIELDS = ("plan_id", "receipt_type", "agent_role",
                           "session_id", "ticket_id", "summary")


def fixture_fingerprint() -> str:
    """SHA256 over the canonical JSON of the fixture.

    Recorded in C3 cutover evidence. Any fixture change flips this value —
    the source-contract test pins it, forcing an explicit contract review
    instead of a silent transformation change.
    """
    blob = json.dumps({
        "contract_version": DEFAULT_CONTRACT_VERSION,
        "grant_kinds": list(GRANT_KINDS),
        "kind_by_type": KIND_BY_TYPE,
        "peb_admission_grant": list(PEB_ADMISSION_GRANT),
        "producer_by_channel": PRODUCER_BY_CHANNEL,
        "unmapped_legacy_types": list(UNMAPPED_LEGACY_TYPES),
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# ── Layer 1: fixture vs adapter code ─────────────────────────────────────

def check_adapter_consistency(lilac_mod) -> list:
    """Return drift strings when the merged adapter mapping != fixture."""
    drift = []
    if dict(getattr(lilac_mod, "RECEIPT_KIND_BY_TYPE", {})) != dict(KIND_BY_TYPE):
        drift.append("lilac.RECEIPT_KIND_BY_TYPE no longer matches fixture KIND_BY_TYPE")
    if getattr(lilac_mod, "LILAC_CONTRACT_VERSION", None) != DEFAULT_CONTRACT_VERSION:
        drift.append("lilac.LILAC_CONTRACT_VERSION != fixture contract_version")
    if tuple(getattr(lilac_mod, "LIFECYCLE_KINDS", ())) != tuple(GRANT_KINDS):
        drift.append("lilac.LIFECYCLE_KINDS != fixture GRANT_KINDS")
    if getattr(lilac_mod, "PRODUCER_CONDUIT_MCP", "") != PRODUCER_BY_CHANNEL["conduit-mcp-http"]:
        drift.append("lilac.PRODUCER_CONDUIT_MCP != fixture producer for conduit-mcp-http")
    # PRODUCER_EXECUTION_WORKER is the adapter's lane-default (shadow
    # fallback), not the declared python-direct producer — it must equal
    # the registered worker identity, nothing else.
    if getattr(lilac_mod, "PRODUCER_EXECUTION_WORKER", "") != PRODUCER_BY_CHANNEL["nexus-execution-worker"]:
        drift.append("lilac.PRODUCER_EXECUTION_WORKER != registered worker identity")
    return drift


# ── Layer 2: fixture vs database registry ────────────────────────────────

def check_db_registry(cur, schema: str = "resolution") -> list:
    """Producer seeds / grants / trigger must match the ratified fixture."""
    drift = []
    cur.execute(
        f"SELECT producer_id, allowed_kinds, contract_version_min, "
        f"contract_version_max, state FROM {schema}.producer_registry "
        f"ORDER BY producer_id"
    )
    rows = {r[0]: r for r in cur.fetchall()}

    for producer in (PRODUCER_BY_CHANNEL["conduit-mcp-http"],
                     PRODUCER_BY_CHANNEL["python-direct"],
                     PRODUCER_BY_CHANNEL["nexus-execution-worker"]):
        row = rows.get(producer)
        if row is None:
            drift.append(f"producer_registry missing seed: {producer}")
            continue
        _, allowed, vmin, vmax, state = row
        if state != "active":
            drift.append(f"producer {producer} not active (state={state})")
        if sorted(allowed or []) != sorted(GRANT_KINDS):
            drift.append(f"producer {producer} allowed_kinds != fixture GRANT_KINDS")
        if (vmin, vmax) != (DEFAULT_CONTRACT_VERSION, DEFAULT_CONTRACT_VERSION):
            drift.append(
                f"producer {producer} version range ({vmin},{vmax}) != fixture "
                f"({DEFAULT_CONTRACT_VERSION},{DEFAULT_CONTRACT_VERSION})"
            )

    peb = rows.get("peb-srv")
    if peb is None:
        drift.append("producer_registry missing seed: peb-srv")
    elif sorted(peb[1] or []) != sorted(PEB_ADMISSION_GRANT):
        drift.append("peb-srv grants != ['admission'] (Q3 authority violated)")

    cur.execute(
        "SELECT count(*) FROM pg_trigger WHERE tgrelid = %s::regclass "
        "AND NOT tgisinternal AND tgname = 'trg_resolution_receipt_grant'",
        (f"{schema}.receipt",),
    )
    if cur.fetchone()[0] == 0:
        drift.append("grant trigger trg_resolution_receipt_grant missing")
    return drift


# ── Layer 3: legacy rows vs canonical twins ──────────────────────────────

def parity_row(conn, schema: str, legacy: dict) -> dict:
    """Classify one legacy receipt row against its canonical twin.

    ``legacy`` keys: id, type, plan_id, agent_role, session_id, ticket_id,
    summary, tokens_used. Read-only; never mutates either store.
    """
    legacy_id = legacy["id"]
    legacy_type = legacy["type"]
    cur = conn.cursor()

    if legacy_type in UNMAPPED_LEGACY_TYPES or legacy_type not in KIND_BY_TYPE:
        return {"source_receipt_id": legacy_id, "class": "unmapped_type",
                "legacy_type": legacy_type}

    expected_kind = KIND_BY_TYPE[legacy_type]
    cur.execute(
        f"SELECT kind, payload, contract_version FROM {schema}.receipt "
        f"WHERE source_receipt_id=%s ORDER BY created_at ASC LIMIT 1",
        (legacy_id,),
    )
    twin = cur.fetchone()
    if twin is None:
        return {"source_receipt_id": legacy_id, "class": "missing_twin",
                "legacy_type": legacy_type, "expected_kind": expected_kind}

    c_kind, c_payload, c_version = twin
    if c_kind != expected_kind:
        return {"source_receipt_id": legacy_id, "class": "kind_drift",
                "legacy_type": legacy_type, "expected_kind": expected_kind,
                "actual_kind": c_kind}

    payload = c_payload if isinstance(c_payload, dict) else json.loads(c_payload or "{}")
    mismatches = []
    for field in PAYLOAD_IDENTITY_FIELDS:
        # The legacy surface names the type column "type"; the canonical
        # payload names it "receipt_type" (shadow-seam payload contract).
        want = legacy.get("type") if field == "receipt_type" else legacy.get(field)
        got = payload.get(field)
        if want is not None and got is not None and want != got:
            mismatches.append(field)
    if c_version != DEFAULT_CONTRACT_VERSION:
        mismatches.append("contract_version")
    if mismatches:
        return {"source_receipt_id": legacy_id, "class": "payload_drift",
                "fields": mismatches}

    return {"source_receipt_id": legacy_id, "class": "parity"}


def check_legacy_surface(conn, schema: str = "resolution",
                         legacy_schema: str = "vision") -> dict:
    """Scan the legacy fallback surface (vision.receipts) for parity.

    Read-only. The execution-domain surface is scanned via the V140
    identity (COALESCE(lineage_original_id, id::text)) when present.

    Q-B observability (review F2): ``legacy_shadow_failed`` events
    recorded by the adapter are surfaced from the V141 soak surface and
    reported as their own class — a clean legacy scan must never mask a
    chronic courtesy-copy failure in enforce mode.
    """
    report = {"scanned": 0, "classes": {}, "rows": []}
    cur = conn.cursor()
    cur.execute(
        f"SELECT id, type, plan_id, agent_role, session_id, ticket_id, "
        f"summary, tokens_used FROM {legacy_schema}.receipts "
        f"WHERE type IN (SELECT unnest(%s::text[])) ORDER BY created_at ASC",
        (list(KIND_BY_TYPE),),
    )
    for row in cur.fetchall():
        legacy = dict(zip(
            ("id", "type", "plan_id", "agent_role", "session_id",
             "ticket_id", "summary", "tokens_used"), row))
        result = parity_row(conn, schema, legacy)
        report["scanned"] += 1
        report["classes"][result["class"]] = (
            report["classes"].get(result["class"], 0) + 1)
        if result["class"] != "parity":
            report["rows"].append(result)

    # Q-B (F2): surface the enforce-mode legacy_shadow_failed events. The
    # soak table is V141 — absent pre-V141, so absence is not an error.
    try:
        cur.execute(
            f"SELECT report->'legacy_shadow_failed' FROM {schema}.soak_evidence "
            f"WHERE report ? 'legacy_shadow_failed'"
        )
        events = []
        for (blob,) in cur.fetchall():
            if isinstance(blob, str):
                blob = json.loads(blob or "[]")
            events.extend(blob or [])
        if events:
            report["classes"]["legacy_shadow_failed"] = (
                report["classes"].get("legacy_shadow_failed", 0) + len(events))
            report["rows"].extend(
                {"class": "legacy_shadow_failed", **e} for e in events)
    except Exception:  # noqa: BLE001 — soak surface optional (pre-V141)
        pass
    return report


def full_report(conn, schema: str = "resolution",
                legacy_schema: str = "vision") -> dict:
    """All three layers in one read-only report (CLI / live evidence)."""
    import lilac
    report = {
        "fixture_fingerprint": fixture_fingerprint(),
        "adapter_consistency": check_adapter_consistency(lilac),
    }
    cur = conn.cursor()
    registry_ok = True
    try:
        registry_drift = check_db_registry(cur, schema)
        registry_ok = not registry_drift
        report["db_registry"] = registry_drift
    except Exception as exc:  # noqa: BLE001 — report, never crash the CLI
        registry_ok = False
        report["db_registry"] = [f"registry check failed: {exc}"]
    if registry_ok:
        try:
            report["legacy_parity"] = check_legacy_surface(conn, schema,
                                                           legacy_schema)
        except Exception as exc:  # noqa: BLE001
            report["legacy_parity"] = {"error": str(exc)}
    conn.rollback()  # read-only: discard any snapshot state
    return report


if __name__ == "__main__":
    import psycopg2

    dsn = os.environ.get("CONDUIT_PG_DSN", "")
    if not dsn:
        print("CONDUIT_PG_DSN must be set", file=sys.stderr)
        raise SystemExit(2)
    raw = psycopg2.connect(dsn)
    print(json.dumps(full_report(raw), indent=2, default=str))
