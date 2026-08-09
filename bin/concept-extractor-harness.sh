#!/usr/bin/env bash
# bin/concept-extractor-harness.sh — Concept Extractor agent invocation harness
# =========================================================================
#
# Queries audit data (agent_records + implementation_plans) and invokes
# the Concept Extractor opencode agent to extract concepts, relationships,
# and evidence into the semantics schema.
#
# Architecture
# ------------
# Step 1: Query source_observations for agent_record / implementation_plan
#         rows created since --since (default: last 24h)
# Step 2: Fetch the actual agent_records and implementation_plans content
# Step 3: Feed them to the Concept Extractor agent (opencode run)
# Step 4: Agent inserts concepts → relationships → evidence
#
# Usage
# -----
#     bin/concept-extractor-harness.sh                          # last 24h
#     bin/concept-extractor-harness.sh --since 2026-08-01       # since date
#     bin/concept-extractor-harness.sh --days 7                 # last 7 days
#     bin/concept-extractor-harness.sh --limit 50               # latest 50 records
#     bin/concept-extractor-harness.sh --dry-run                # preview only
#
# Exit codes
# ----------
#   0 — extraction completed normally
#   1 — lock contention
#   2 — opencode not found
#   3 — cycle failed (all models exhausted)
#   4 — no records to process

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$BIN_DIR/.." && pwd)"
DEV_ROOT="$(cd "$NEXUS_ROOT/.." && pwd)"
STATE_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}/nexus-concept-extractor"
LOCK_FILE="$STATE_DIR/concept-extractor-harness.lock"
LOG_DIR="$NEXUS_ROOT/logs"
HARNESS_LOG="$LOG_DIR/concept-extractor-harness.log"
TEMP_DIR="${TEMP_DIR:-/tmp}"

# ── Config ──────────────────────────────────────────────────────────────

OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode 2>/dev/null || echo "$HOME/.opencode/bin/opencode")}"
OPENCODE_PROJECT="${OPENCODE_PROJECT:-$DEV_ROOT}"
OPENCODE_AGENT="${OPENCODE_AGENT:-concept-extractor}"
TIMEOUT_MINUTES="${TIMEOUT_MINUTES:-30}"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-pguser}"
PGPASSWORD="${PGPASSWORD:-pgpass}"
PGDATABASE="${PGDATABASE:-nexus}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

TACKLE_SRV_URL="${TACKLE_SRV_URL:-http://localhost:3410}"
ASSEMBLY_URL="${ASSEMBLY_URL:-http://localhost:3107}"
NEBULA_URL="${NEBULA_URL:-http://localhost:3101}"

# ── Record types to extract from ────────────────────────────────────────

AGENT_RECORD_TYPES="'report','analysis','decision','engineering_log'"

# ── Parse args ──────────────────────────────────────────────────────────

SINCE=""
DAYS=""
LIMIT=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --since) SINCE="$2"; shift 2 ;;
        --days)  DAYS="$2"; shift 2 ;;
        --limit) LIMIT="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        *) echo "Unknown flag: $1" >&2; exit 4 ;;
    esac
done

if [[ -z "$SINCE" && -z "$DAYS" && -z "$LIMIT" ]]; then
    SINCE="$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')"
fi

# ── Lock ────────────────────────────────────────────────────────────────

_acquire_lock() {
    mkdir -p "$STATE_DIR"
    exec {LOCK_FD}>"$LOCK_FILE"
    if ! flock -n "$LOCK_FD" 2>/dev/null; then
        echo "[concept-extractor] $(date '+%Y-%m-%d %H:%M:%S') [LOCK] Already running — deferring"
        exit 1
    fi
    echo "$$" > "$LOCK_FILE"
}

_release_lock() {
    exec {LOCK_FD}>&- 2>/dev/null || true
    rm -f "$LOCK_FILE" 2>/dev/null || true
}

# ── Helpers ─────────────────────────────────────────────────────────────

_log() {
    local level="$1"; shift
    local line="[concept-extractor] $(date '+%Y-%m-%d %H:%M:%S') [$level] $*"
    echo "$line" >&2
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    echo "$line" >> "$HARNESS_LOG" 2>/dev/null || true
}

_check_opencode() {
    if [[ ! -x "$OPENCODE_BIN" ]]; then
        _log "ERROR" "opencode not found at $OPENCODE_BIN"
        exit 2
    fi
}

opencode_model_for() {
    local id="$1"
    case "$id" in
        opencode/*)            echo "$id" ;;
        */*)                   echo "${id%%/*}/${id}" ;;
        big-pickle)            echo "opencode/big-pickle" ;;
        gemini-3.5-flash)      echo "opencode-go/gemini-3.5-flash" ;;
        *)                     echo "$id" ;;
    esac
}

resolve_models() {
    local role="$1" list="" primary="" fb_raw=""
    local data
    data=$(curl -s --max-time 10 "$TACKLE_SRV_URL/config/ai/resolve/$role" 2>/dev/null) || true
    primary=$(printf '%s' "$data" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('model_identifier') or '')" 2>/dev/null || true)
    fb_raw=$(printf '%s' "$data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for f in (d.get('fallback_models') or []):
        mid = f.get('model_identifier')
        if mid: print(mid)
except Exception:
    pass
" 2>/dev/null || true)
    _log "INFO" "tackle resolve role=$role primary=${primary:-<none>}"

    [[ -n "$primary" ]] && list="$primary"
    local m
    while IFS= read -r m; do
        [[ -n "$m" ]] && list="${list:+$list
}$m"
    done <<< "$fb_raw"
    if ! grep -qx 'opencode/big-pickle' <<< "$list"; then
        list="${list:+$list
}opencode/big-pickle"
    fi

    local out=""
    while IFS= read -r m; do
        [[ -n "$m" ]] || continue
        local om; om=$(opencode_model_for "$m")
        if ! grep -qx "$om" <<< "$out"; then
            out="${out:+$out
}$om"
        fi
    done <<< "$list"
    printf '%s\n' "$out"
}

resolve_agent_user_id() {
    local role="$1"
    curl -s --max-time 10 "$ASSEMBLY_URL/api/users" 2>/dev/null \
        | python3 -c "
import sys, json
try:
    users = json.load(sys.stdin)
    for u in users:
        if (u.get('name') or '').lower() == sys.argv[1].lower():
            print(u.get('id') or '')
            break
except Exception:
    pass
" "$role" 2>/dev/null || true
}

# ── Query audit data ────────────────────────────────────────────────────

fetch_records() {
    local since="$1" days="$2" limit="$3"
    local where_clause=""
    local limit_clause=""

    if [[ -n "$since" ]]; then
        where_clause="AND created_at >= '$since'::timestamptz"
    elif [[ -n "$days" ]]; then
        where_clause="AND created_at >= NOW() - INTERVAL '$days days'"
    fi
    if [[ -n "$limit" ]]; then
        limit_clause="ORDER BY created_at DESC LIMIT $limit"
    fi

    _log "INFO" "Querying audit data with: since=$since days=$days limit=$limit"

    # Count agent_records of target types
    local ar_count
    ar_count=$(docker exec pgvector_db psql -U "$PGUSER" -d "$PGDATABASE" -tAc "
        SELECT count(*)
        FROM nebula.agent_records
        WHERE record_type IN ($AGENT_RECORD_TYPES)
        $where_clause
    " 2>&1) || ar_count=0

    # Count implementation_plans
    local ip_count
    ip_count=$(docker exec pgvector_db psql -U "$PGUSER" -d "$PGDATABASE" -tAc "
        SELECT count(*)
        FROM nebula.implementation_plans
        WHERE 1=1 $where_clause
    " 2>&1) || ip_count=0

    local total=$(( ${ar_count:-0} + ${ip_count:-0} ))
    if [[ "$total" -eq 0 ]]; then
        _log "INFO" "No records to process"
        exit 0
    fi

    _log "INFO" "Found $ar_count agent_records + $ip_count implementation_plans"

    # Fetch agent_records (restricted to target record types, content truncated to 8KB each)
    local agent_records_json
    agent_records_json=$(docker exec pgvector_db psql -U "$PGUSER" -d "$PGDATABASE" -tAc "
        SELECT json_agg(row_to_json(t))
        FROM (
            SELECT id, record_type, title,
                   left(content, 8192) AS content,
                   created_at
            FROM nebula.agent_records
            WHERE record_type IN ($AGENT_RECORD_TYPES)
            $where_clause
            $limit_clause
        ) t
    " 2>&1) || agent_records_json="[]"

    # Fetch implementation_plans (content truncated to 8KB each)
    local plans_json
    plans_json=$(docker exec pgvector_db psql -U "$PGUSER" -d "$PGDATABASE" -tAc "
        SELECT json_agg(row_to_json(t))
        FROM (
            SELECT id, plan_number, title, goal,
                   left(content, 8192) AS content,
                   files_affected, acceptance_criteria,
                   created_at
            FROM nebula.implementation_plans
            WHERE 1=1 $where_clause
            $limit_clause
        ) t
    " 2>&1) || plans_json="[]"

    # Write JSON to temp files to avoid bash heredoc escaping issues
    local ar_file="$TEMP_DIR/concept-extractor-ar.json"
    local pl_file="$TEMP_DIR/concept-extractor-pl.json"
    echo "$agent_records_json" > "$ar_file"
    echo "$plans_json" > "$pl_file"

    # Combine into payload
    local payload_file="$TEMP_DIR/concept-extractor-input.json"
    python3 -c "
import json
ar = json.load(open('$ar_file')) or []
pl = json.load(open('$pl_file')) or []
payload = {
    'agent_records': ar,
    'implementation_plans': pl,
    'total_records': len(ar) + len(pl),
    'query': {'since': '$since', 'days': '$days', 'limit': '$limit'}
}
with open('$payload_file', 'w') as f:
    json.dump(payload, f, indent=2, default=str)
print(json.dumps({'agent_records': len(ar), 'plans': len(pl)}))
" >&2

    echo "$payload_file"
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    _check_opencode
    _acquire_lock
    trap _release_lock EXIT

    _log "INFO" "Starting concept extraction (since=$SINCE days=$DAYS limit=$LIMIT)"

    local payload_file
    payload_file=$(fetch_records "$SINCE" "$DAYS" "$LIMIT")
    local total_count
    total_count=$(python3 -c "import json; d=json.load(open('$payload_file')); print(d['total_records'])" 2>/dev/null)

    if [[ "$total_count" -eq 0 ]]; then
        _log "INFO" "No records to process. Done."
        exit 0
    fi

    if [[ "$DRY_RUN" == true ]]; then
        _log "INFO" "DRY RUN — input written to $payload_file"
        python3 << PYEOF
import json
d = json.load(open('$payload_file'))
print(f"Agent records: {len(d['agent_records'])}")
print(f"Implementation plans: {len(d['implementation_plans'])}")
print(f"Total: {d['total_records']}")
for ar in d['agent_records'][:5]:
    print(f"  [{ar['record_type']}] {ar['title'][:80]}")
PYEOF
        exit 0
    fi

    # ── Build extraction message ────────────────────────────────────
    local extraction_msg="You are the Concept Extractor. Read the audit
data below and extract concepts, relationships, and evidence into the
semantics schema. Follow your system prompt
(nexus/docs/concept-extractor-role-prompt.md).

The data below contains agent records and implementation plans from the
Nexus audit trail. For each artifact:

1. Identify the concepts it describes.
2. Map them onto the existing ontology (13 seeded concepts).
3. Propose new concepts ONLY when no existing concept fits.
4. Create concept_relationship rows with the 31 seeded relationship types.
5. Create statement_evidence links back to each agent_record / implementation_plan (statement_type = 'agent_record' or 'implementation_plan', statement_id = the record UUID).

=== AUDIT DATA ===

$(cat "$payload_file")

=== END AUDIT DATA ===

Steps:
1. Read the audit data above.
2. Query semantics.concept and semantics.relationship_type to see the
   existing ontology.
3. For each artifact, identify concepts → map to existing → create new if
   needed → create relationships → link evidence.
4. Write your agent record (recordType: analysis, role: concept-extractor,
   tags: [\"type:concept-extraction\", \"status:complete\"]).
5. Post a summary to the Assembly change-log forum."

    # Deterministic identity
    export NEXUS_AGENT_ROLE="$OPENCODE_AGENT"
    local agent_user_id
    agent_user_id=$(resolve_agent_user_id "$OPENCODE_AGENT")
    if [[ -n "$agent_user_id" ]]; then
        export NEXUS_AGENT_USER_ID="$agent_user_id"
    else
        unset NEXUS_AGENT_USER_ID
        _log "WARN" "Could not resolve Assembly user UUID for role $OPENCODE_AGENT"
    fi

    extraction_msg="${extraction_msg}

Your identity (injected by harness): role=$NEXUS_AGENT_ROLE, Assembly user UUID=${NEXUS_AGENT_USER_ID:-<unresolved>}, model=\$NEXUS_AGENT_MODEL (env, set per attempt). Every Assembly post MUST include role and model in the JSON."

    # ── Model chain ─────────────────────────────────────────────────
    local model_list
    if [[ -n "${MODEL_OVERRIDE:-}" ]]; then
        model_list="$MODEL_OVERRIDE"
        _log "INFO" "Model override: $MODEL_OVERRIDE"
    else
        model_list=$(resolve_models "$OPENCODE_AGENT")
    fi
    _log "INFO" "Model chain: $(printf '%s' "$model_list" | tr '\n' ' > ')"

    local start_ts exit_code=1 attempt=1 model="" last_fail=0
    start_ts=$(date +%s)

    while IFS= read -r model; do
        [[ -n "$model" ]] || continue
        _log "INFO" "Attempt $attempt: running with model $model (timeout=${TIMEOUT_MINUTES}m)"
        export NEXUS_AGENT_MODEL="$model"
        timeout "${TIMEOUT_MINUTES}m" "$OPENCODE_BIN" run \
            --agent "$OPENCODE_AGENT" \
            --model "$model" \
            --dir "$OPENCODE_PROJECT" \
            --format json \
            --dangerously-skip-permissions \
            "$extraction_msg" \
            </dev/null 2>&1 && { exit_code=0; break; } || last_fail=$?

        _log "WARN" "Model $model failed (exit=$last_fail) — advancing to next candidate"
        attempt=$((attempt + 1))
    done <<< "$model_list"

    local end_ts elapsed
    end_ts=$(date +%s)
    elapsed=$((end_ts - start_ts))

    if [[ "$exit_code" -eq 0 ]]; then
        _log "INFO" "Extraction completed in ${elapsed}s (model=$model, attempt=$attempt)"
    else
        _log "ERROR" "Extraction failed after $((attempt-1)) attempt(s) in ${elapsed}s"
    fi

    return $exit_code
}

main "$@"
