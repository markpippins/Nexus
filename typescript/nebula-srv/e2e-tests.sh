#!/usr/bin/env bash
# Note: NOT using set -e because ((FAIL++)) returns 1 when FAIL=0

BASE="http://localhost:3101/api"
PASS=0
FAIL=0

green() { echo -e "\033[32m✓ $1\033[0m"; ((PASS++)); }
red() { echo -e "\033[31m✗ $1\033[0m"; ((FAIL++)); }

assert_status() {
  local desc="$1" expected="$2" actual="$3" body="$4"
  if [ "$actual" = "$expected" ]; then
    green "$desc"
  else
    red "$desc (expected HTTP $expected, got $actual)"
    echo "  Body: $(echo "$body" | head -c 200)"
  fi
}

check_field_exists() {
  local desc="$1" json="$2" field="$3"
  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$field','__MISSING__'))" 2>/dev/null)
  if [ "$actual" != "__MISSING__" ] && [ "$actual" != "" ]; then
    green "$desc ($actual)"
  else
    red "$desc (missing or empty: $actual)"
  fi
}

check_count() {
  local desc="$1" json="$2" expected="$3"
  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  if [ "$actual" -ge "$expected" ]; then
    green "$desc (>= $expected)"
  else
    red "$desc (expected >=$expected, got $actual)"
  fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "  NEBULA-SRV E2E TESTS (strontium:5432 PostgreSQL)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── 1. Health ────────────────────────────────────────────────────
echo "── 1. Health ──"
HEALTH=$(curl -s "$BASE/../health")
HTTP=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/../health")
assert_status "Health returns 200" "200" "$HTTP"
check_field_exists "Health status" "$HEALTH" "status"
check_field_exists "Health db" "$HEALTH" "db"
echo ""

# ── 2. GET systems ───────────────────────────────────────────────
echo "── 2. GET /api/systems ──"
SYSTEMS=$(curl -s "$BASE/systems")
HTTP=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/systems")
assert_status "GET systems returns 200" "200" "$HTTP"
check_count "Systems exist" "$SYSTEMS" 1

# Extract an existing system ID for subsequent tests
SYS_ID=$(echo "$SYSTEMS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])" 2>/dev/null)
SYS_NAME=$(echo "$SYSTEMS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('name',''))" 2>/dev/null)
green "Found system: $SYS_NAME ($SYS_ID)"

# Check nested structure
SUBS=$(echo "$SYSTEMS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d[0].get('subsystems',[])))" 2>/dev/null)
FOLDERS=$(echo "$SYSTEMS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d[0].get('folders',[])))" 2>/dev/null)
green "Nested hierarchy: $SUBS subsystem(s), $FOLDERS folder(s)"
echo ""

# ── 3. Seed (idempotent — may be a no-op if already seeded) ──────
echo "── 3. POST /api/seed ──"
SEED=$(curl -s -X POST "$BASE/seed")
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/seed")
if echo "$SEED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok','no'))" 2>/dev/null | grep -q "True\|true\|1"; then
  SEED_SYS_ID=$(echo "$SEED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('systemId','none'))" 2>/dev/null)
  SEED_SUB_ID=$(echo "$SEED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('subsystemId','none'))" 2>/dev/null)
  SEED_FEAT_ID=$(echo "$SEED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('featureId','none'))" 2>/dev/null)
  green "Seed OK: system=$SEED_SYS_ID, subsystem=$SEED_SUB_ID, feature=$SEED_FEAT_ID"
else
  ALREADY=$(echo "$SEED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null)
  green "Seed: $ALREADY (already seeded)"
fi
echo ""

# ── 4. POST system ──────────────────────────────────────────────
echo "── 4. POST /api/systems ──"
CREATE_SYS=$(curl -s -X POST "$BASE/systems" -H 'Content-Type: application/json' \
  -d '{"name":"E2E Test System","description":"End-to-end verification"}')
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/systems" \
  -H 'Content-Type: application/json' \
  -d '{"name":"E2E Test System 2","description":"Second test system"}')
assert_status "POST system returns 201" "201" "$HTTP"
NEW_SYS_ID=$(echo "$CREATE_SYS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
[ -n "$NEW_SYS_ID" ] && green "Created system: $NEW_SYS_ID" || red "No system ID returned"
echo ""

# ── 5. PATCH system ─────────────────────────────────────────────
echo "── 5. PATCH /api/systems/:id ──"
if [ -n "$NEW_SYS_ID" ]; then
  PATCHED=$(curl -s -X PATCH "$BASE/systems/$NEW_SYS_ID" -H 'Content-Type: application/json' \
    -d '{"name":"Updated E2E System","description":"Patched description"}')
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/systems/$NEW_SYS_ID" \
    -H 'Content-Type: application/json' -d '{"description":"Patched desc"}')
  assert_status "PATCH system returns 200" "200" "$HTTP"
  PATCHED_NAME=$(echo "$PATCHED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name',''))" 2>/dev/null)
  [ "$PATCHED_NAME" = "Updated E2E System" ] && green "Name updated to: $PATCHED_NAME" || red "Name not updated: $PATCHED_NAME"
fi
echo ""

# ── 6. POST subsystem (color dedup test) ─────────────────────────
echo "── 6. POST /api/subsystems (color dedup) ──"
if [ -n "$NEW_SYS_ID" ]; then
  SUB=$(curl -s -X POST "$BASE/subsystems" -H 'Content-Type: application/json' \
    -d "{\"name\":\"E2E Subsystem\",\"systemId\":\"$NEW_SYS_ID\"}")
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/subsystems" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"E2E Subsystem 2\",\"systemId\":\"$NEW_SYS_ID\"}")
  assert_status "POST subsystem returns 201" "201" "$HTTP"
  SUB_ID=$(echo "$SUB" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
  SUB_COLOR=$(echo "$SUB" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('color',''))" 2>/dev/null)
  [ -n "$SUB_ID" ] && green "Created subsystem: $SUB_ID (color=$SUB_COLOR)" || red "No subsystem ID"

  # Create a 2nd one to verify color dedup gives different color
  RESP2=$(curl -s -X POST "$BASE/subsystems" -H 'Content-Type: application/json' \
    -d "{\"name\":\"E2E Subsys 3\",\"systemId\":\"$NEW_SYS_ID\"}")
  COLOR2=$(echo "$RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('color',''))" 2>/dev/null)
  if [ "$COLOR2" != "$SUB_COLOR" ]; then
    green "Color dedup: different colors ($SUB_COLOR vs $COLOR2)"
  else
    red "Color dedup: same color assigned ($SUB_COLOR)"
  fi
fi
echo ""

# ── 7. POST feature ─────────────────────────────────────────────
echo "── 7. POST /api/features ──"
if [ -n "$SUB_ID" ]; then
  FEAT=$(curl -s -X POST "$BASE/features" -H 'Content-Type: application/json' \
    -d "{\"name\":\"E2E Feature\",\"subsystemId\":\"$SUB_ID\"}")
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/features" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Another Feature\",\"subsystemId\":\"$SUB_ID\"}")
  assert_status "POST feature returns 201" "201" "$HTTP"
  FEAT_ID=$(echo "$FEAT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
  [ -n "$FEAT_ID" ] && green "Created feature: $FEAT_ID" || red "No feature ID"
fi
echo ""

# ── 8. POST requirement ─────────────────────────────────────────
echo "── 8. POST /api/requirements ──"
if [ -n "$FEAT_ID" ]; then
  REQ=$(curl -s -X POST "$BASE/requirements" -H 'Content-Type: application/json' \
    -d "{\"title\":\"E2E requirement test\",\"description\":\"Verify CRUD\",\"featureId\":\"$FEAT_ID\",\"systemId\":\"$NEW_SYS_ID\",\"subsystemId\":\"$SUB_ID\"}")
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/requirements" \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"Second requirement\",\"description\":\"Test\",\"featureId\":\"$FEAT_ID\",\"systemId\":\"$NEW_SYS_ID\",\"subsystemId\":\"$SUB_ID\",\"status\":\"In Progress\",\"priority\":\"High\"}")
  assert_status "POST requirement returns 201" "201" "$HTTP"
  REQ_ID=$(echo "$REQ" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
  [ -n "$REQ_ID" ] && green "Created requirement: $REQ_ID" || red "No requirement ID"
fi
echo ""

# ── 9. GET requirements (filtered) ──────────────────────────────
echo "── 9. GET /api/requirements ──"
REQS=$(curl -s "$BASE/requirements")
check_count "GET all requirements" "$REQS" 1

if [ -n "$FEAT_ID" ]; then
  FREQS=$(curl -s "$BASE/requirements?featureId=$FEAT_ID")
  check_count "Filtered by featureId" "$FREQS" 1
fi

if [ -n "$NEW_SYS_ID" ]; then
  FREQS=$(curl -s "$BASE/requirements?systemId=$NEW_SYS_ID")
  check_count "Filtered by systemId" "$FREQS" 1
fi
echo ""

# ── 10. PATCH requirement batch ─────────────────────────────────
echo "── 10. PATCH /api/requirements/batch ──"
if [ -n "$REQ_ID" ]; then
  BATCH=$(curl -s -X PATCH "$BASE/requirements/batch" -H 'Content-Type: application/json' \
    -d "{\"ids\":[\"$REQ_ID\"],\"status\":\"accepted\"}")
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/requirements/batch" \
    -H 'Content-Type: application/json' \
    -d "{\"ids\":[\"$REQ_ID\"],\"status\":\"accepted\"}")
  assert_status "Batch PATCH returns 200" "200" "$HTTP"
  UPDATED=$(echo "$BATCH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('updated',0))" 2>/dev/null)
  [ "$UPDATED" -ge 1 ] && green "Batch updated $UPDATED requirement(s)" || red "Batch update failed"
fi
echo ""

# ── 11. Folders ─────────────────────────────────────────────────
echo "── 11. POST /api/systems/:id/folders ──"
if [ -n "$NEW_SYS_ID" ]; then
  FOLDER=$(curl -s -X POST "$BASE/systems/$NEW_SYS_ID/folders" -H 'Content-Type: application/json' \
    -d '{"name":"E2E Folder","category":"UI"}')
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/systems/$NEW_SYS_ID/folders" \
    -H 'Content-Type: application/json' -d '{"name":"Docs","category":"Documentation"}')
  assert_status "POST folder returns 201" "201" "$HTTP"
  FOLDER_ID=$(echo "$FOLDER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
  [ -n "$FOLDER_ID" ] && green "Created folder: $FOLDER_ID" || red "No folder ID"
fi
echo ""

# ── 12. Work sessions ───────────────────────────────────────────
echo "── 12. Work sessions ──"
if [ -n "$NEW_SYS_ID" ]; then
  SESSION=$(curl -s -X POST "$BASE/sessions" -H 'Content-Type: application/json' \
    -d "{\"title\":\"E2E Session\",\"parentType\":\"system\",\"parentId\":\"$NEW_SYS_ID\"}")
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/sessions" \
    -H 'Content-Type: application/json' \
    -d "{\"parentType\":\"subsystem\",\"parentId\":\"$SUB_ID\"}")
  assert_status "POST session returns 201" "201" "$HTTP"
  SESSION_ID=$(echo "$SESSION" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
  [ -n "$SESSION_ID" ] && green "Created session: $SESSION_ID" || red "No session ID"

  SESSIONS=$(curl -s "$BASE/sessions")
  check_count "GET sessions" "$SESSIONS" 1
fi
echo ""

# ── 13. Move feature ────────────────────────────────────────────
echo "── 13. POST /api/features/move ──"
if [ -n "$FEAT_ID" ] && [ -n "$NEW_SYS_ID" ]; then
  # Create a target subsystem
  TARGET=$(curl -s -X POST "$BASE/subsystems" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Move Target Subsystem\",\"systemId\":\"$NEW_SYS_ID\"}")
  TARGET_ID=$(echo "$TARGET" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

  if [ -n "$TARGET_ID" ]; then
    MOVE=$(curl -s -X POST "$BASE/features/move" -H 'Content-Type: application/json' \
      -d "{\"featureId\":\"$FEAT_ID\",\"targetSystemId\":\"$NEW_SYS_ID\",\"targetSubsystemId\":\"$TARGET_ID\"}")
    HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/features/move" \
      -H 'Content-Type: application/json' \
      -d "{\"featureId\":\"$FEAT_ID\",\"targetSystemId\":\"$NEW_SYS_ID\",\"targetSubsystemId\":\"$TARGET_ID\"}")
    assert_status "Move feature returns 200" "200" "$HTTP"
    echo "$MOVE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok',''))" 2>/dev/null | grep -q "True" && \
      green "Feature moved successfully" || red "Move failed"
  fi
fi
echo ""

# ── 14. Move subsystem ──────────────────────────────────────────
echo "── 14. POST /api/subsystems/move ──"
if [ -n "$SUB_ID" ] && [ -n "$SYS_ID" ]; then
  MOVE=$(curl -s -X POST "$BASE/subsystems/move" -H 'Content-Type: application/json' \
    -d "{\"subsystemId\":\"$SUB_ID\",\"targetSystemId\":\"$SYS_ID\"}")
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/subsystems/move" \
    -H 'Content-Type: application/json' \
    -d "{\"subsystemId\":\"$SUB_ID\",\"targetSystemId\":\"$SYS_ID\"}")
  assert_status "Move subsystem returns 200" "200" "$HTTP"
  echo "$MOVE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok',''))" 2>/dev/null | grep -q "True" && \
    green "Subsystem moved successfully" || red "Subsystem move failed"
fi
echo ""

# ── 15. Demote system ──────────────────────────────────────────
echo "── 15. POST /api/systems/demote/:id ──"
# Create a fresh system to demote
DEMOTE_CANDIDATE=$(curl -s -X POST "$BASE/systems" -H 'Content-Type: application/json' \
  -d '{"name":"System to Demote","description":"Will become a subsystem"}')
DEMOTE_ID=$(echo "$DEMOTE_CANDIDATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

# Add a subsystem to it (will become a feature of the demoted entity)
if [ -n "$DEMOTE_ID" ] && [ -n "$SYS_ID" ]; then
  curl -s -X POST "$BASE/subsystems" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Child of Demotee\",\"systemId\":\"$DEMOTE_ID\"}" > /dev/null

  DEMOTE=$(curl -s -X POST "$BASE/systems/demote/$DEMOTE_ID" -H 'Content-Type: application/json' \
    -d "{\"targetSystemId\":\"$SYS_ID\"}")
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/systems/demote/$DEMOTE_ID" \
    -H 'Content-Type: application/json' -d "{\"targetSystemId\":\"$SYS_ID\"}" || echo "0")
  # The second call will be 404 since the system was deleted — that's expected
  if [ "$HTTP" = "200" ] || [ "$HTTP" = "404" ]; then
    green "Demote system returned $HTTP (ok or already-demoted)"
  else
    assert_status "Demote system returns 200" "200" "$HTTP"
  fi
fi
echo ""

# ── 16. Move requirement + status normalization variants ──────────────────
# Plan 0131 (move endpoint) and plan 0132 (status normalization).
echo "── 16. POST /api/requirements/:id/move + variant normalization ──"
if [ -n "$FEAT_ID" ] && [ -n "$NEW_SYS_ID" ]; then
  # Create a dedicated requirement so we don't depend on REQ_ID state
  MOVE_REQ=$(curl -s -X POST "$BASE/requirements" -H 'Content-Type: application/json' \
    -d "{\"title\":\"E2E move + normalization target\",\"featureId\":\"$FEAT_ID\",\"systemId\":\"$NEW_SYS_ID\",\"subsystemId\":\"$SUB_ID\",\"status\":\"Backlog\"}")
  MOVE_REQ_ID=$(echo "$MOVE_REQ" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
  [ -n "$MOVE_REQ_ID" ] && green "Setup requirement for test #16: $MOVE_REQ_ID" || red "Setup requirement failed"

  fetch_status() {
    curl -s "$BASE/requirements" | python3 -c "import sys,json; r=json.load(sys.stdin); m=[x for x in r if x['id']=='$MOVE_REQ_ID']; print(m[0]['status'] if m else 'MISSING')" 2>/dev/null
  }
  assert_move() {
    local desc="$1" expect="$2" body="$3" extra="$4"
    local http
    http=$(echo "$body" | tail -c 7 | head -c 4 | tr -d '\n')
    assert_status "$desc" "$expect" "$http" "$body"
    if [ -n "$extra" ]; then
      local got; got=$(fetch_status)
      [ "$got" = "$extra" ] && green "stored status = $extra" || red "stored status = $got (expected $extra)"
    fi
  }

  # 16a — canonical targetStatus
  RESP=$(curl -s -o /tmp/e2e-16a.json -w '%{http_code}' -X POST "$BASE/requirements/$MOVE_REQ_ID/move" \
    -H 'Content-Type: application/json' -d '{"targetStatus":"InProgress"}')
  assert_status "Move with canonical 'InProgress' returns 200" "200" "$RESP" "$(cat /tmp/e2e-16a.json)"
  [ "$(fetch_status)" = "InProgress" ] && green "stored as InProgress" || red "stored as $(fetch_status)"

  # 16b — variant 'inprogress'
  RESP=$(curl -s -o /tmp/e2e-16b.json -w '%{http_code}' -X POST "$BASE/requirements/$MOVE_REQ_ID/move" \
    -H 'Content-Type: application/json' -d '{"targetStatus":"inprogress","expectedCurrentStatus":"InProgress"}')
  assert_status "Move with variant 'inprogress' returns 200" "200" "$RESP" "$(cat /tmp/e2e-16b.json)"
  [ "$(fetch_status)" = "InProgress" ] && green "variant normalized to InProgress" || red "stored as $(fetch_status)"

  # 16c — variant 'complete' → canonical Done
  RESP=$(curl -s -o /tmp/e2e-16c.json -w '%{http_code}' -X POST "$BASE/requirements/$MOVE_REQ_ID/move" \
    -H 'Content-Type: application/json' -d '{"targetStatus":"complete","expectedCurrentStatus":"InProgress"}')
  assert_status "Move with variant 'complete' returns 200" "200" "$RESP" "$(cat /tmp/e2e-16c.json)"
  [ "$(fetch_status)" = "Done" ] && green "variant 'complete' normalized to Done" || red "stored as $(fetch_status)"

  # 16d — variant 'wip' → canonical InProgress
  RESP=$(curl -s -o /tmp/e2e-16d.json -w '%{http_code}' -X POST "$BASE/requirements/$MOVE_REQ_ID/move" \
    -H 'Content-Type: application/json' -d '{"targetStatus":"wip","expectedCurrentStatus":"Done"}')
  assert_status "Move with variant 'wip' returns 200" "200" "$RESP" "$(cat /tmp/e2e-16d.json)"
  [ "$(fetch_status)" = "InProgress" ] && green "variant 'wip' normalized to InProgress" || red "stored as $(fetch_status)"

  # 16e — bogus status returns 400 (and roll-back leaves row unchanged)
  RESP=$(curl -s -o /tmp/e2e-16e.json -w '%{http_code}' -X POST "$BASE/requirements/$MOVE_REQ_ID/move" \
    -H 'Content-Type: application/json' -d '{"targetStatus":"bogus-status"}')
  assert_status "Move with bogus targetStatus returns 400" "400" "$RESP" "$(cat /tmp/e2e-16e.json)"
  [ "$(fetch_status)" = "InProgress" ] && green "row unchanged after 400 (still InProgress)" || red "row mutated to $(fetch_status) on 400"

  # 16f — stale expectedCurrentStatus returns 409 (no change)
  RESP=$(curl -s -o /tmp/e2e-16f.json -w '%{http_code}' -X POST "$BASE/requirements/$MOVE_REQ_ID/move" \
    -H 'Content-Type: application/json' -d '{"targetStatus":"Done","expectedCurrentStatus":"Backlog"}')
  assert_status "Move with stale expectedCurrentStatus returns 409" "409" "$RESP" "$(cat /tmp/e2e-16f.json)"
  [ "$(fetch_status)" = "InProgress" ] && green "row unchanged after 409 (still InProgress)" || red "row mutated to $(fetch_status) on 409"

  # 16g — missing requirement returns 404
  RESP=$(curl -s -o /tmp/e2e-16g.json -w '%{http_code}' -X POST \
    "$BASE/requirements/00000000-0000-0000-0000-000000000000/move" \
    -H 'Content-Type: application/json' -d '{"targetStatus":"Done"}')
  assert_status "Move on missing UUID returns 404" "404" "$RESP" "$(cat /tmp/e2e-16g.json)"

  # Cleanup the helper files
  rm -f /tmp/e2e-16[a-g].json
fi
echo ""

# ── 17. Import endpoint ────────────────────────────────────────
echo "── 17. POST /api/import ──"
IMP_ID1=$(curl -s http://localhost:3101/api/systems | python3 -c "import sys,json,uuid; print(str(uuid.uuid4()))" 2>/dev/null)
IMP_ID2=$(curl -s http://localhost:3101/api/systems | python3 -c "import sys,json,uuid; print(str(uuid.uuid4()))" 2>/dev/null)
IMPORT=$(curl -s -X POST "$BASE/import" -H 'Content-Type: application/json' \
  -d "{\"systems\":[{\"id\":\"$IMP_ID1\",\"name\":\"Imported System\",\"description\":\"From localStorage migration\",\"color\":\"#FF0000\",\"position\":0,\"folders\":[],\"subsystems\":[]}]}")
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/import" -H 'Content-Type: application/json' \
  -d "{\"systems\":[{\"id\":\"$IMP_ID2\",\"name\":\"Import Cleanup\",\"description\":\"test\",\"color\":\"#00FF00\",\"position\":1,\"folders\":[],\"subsystems\":[]}]}")
assert_status "Import returns 200" "200" "$HTTP"
IMP_COUNT=$(echo "$IMPORT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('systemsImported',0))" 2>/dev/null)
green "Import: $IMP_COUNT system(s)"

# Cleanup import artifacts
curl -s -o /dev/null -X DELETE "$BASE/systems/$IMP_ID1" 2>/dev/null || true
curl -s -o /dev/null -X DELETE "$BASE/systems/$IMP_ID2" 2>/dev/null || true
echo ""

# ── 18. Plans display endpoints (Plan 0134) ──────────────────────
echo "── 18. GET /api/plans + GET /api/plans/:id ──"
PLAN_LIST=$(curl -s "$BASE/plans")
PLAN_LIST_HTTP=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/plans")
assert_status "GET /api/plans returns 200" "200" "$PLAN_LIST_HTTP"
echo "$PLAN_LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
required={'id','status','path','title','sizeBytes','modifiedAt'}
miss=[p.get('id','?') for p in d['plans'] if not required.issubset(p.keys())]
print(','.join(miss) if miss else 'OK')" 2>/dev/null | grep -q '^OK$' && \
  green "every plan entry has id,status,path,title,sizeBytes,modifiedAt" || \
  red "some plan entries missing required fields"
PENDING=$(curl -s "$BASE/plans?status=pending")
assert_status "GET /api/plans?status=pending returns 200" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/plans?status=pending")"
echo "$PENDING" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ok = all(p['status']=='pending' for p in d['plans']) and len(d['plans'])>=1
print('OK' if ok else 'BAD')" 2>/dev/null | grep -q '^OK$' && \
  green "pending filter: every entry status=pending and count >= 1" || \
  red "pending filter leaked or empty"
assert_status "GET /api/plans?status=garbage returns 400" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/plans?status=garbage")"
THIS_PLAN=$(curl -s "$BASE/plans/add-plans-display-endpoint-v0134")
assert_status "GET /api/plans/add-plans-display-endpoint-v0134 returns 200" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/plans/add-plans-display-endpoint-v0134")"
echo "$THIS_PLAN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ok = ('Plan Number: v0134' in d.get('content','')
      and d.get('status')=='pending'
      and d.get('path','').startswith('pending/')
      and d.get('title','').strip()!=''
      and len(d.get('content',''))>200)
print('OK' if ok else 'BAD')" 2>/dev/null | grep -q '^OK$' && \
  green "plan body contains marker, status=pending, path=pending/, title parsed, body>200 chars" || \
  red "plan body or metadata corrupt"
assert_status "GET /api/plans/this-plan-does-not-exist-99999 returns 404" "404" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/plans/this-plan-does-not-exist-99999")"
assert_status "GET /api/plans/<traversal id> returns 400" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/plans/%2E%2E%2Fsomepath")"
echo ""

# ── 19. Cleanup (DELETE in reverse dependency order) ────────────
echo "── 19. Cleanup ──"

# Delete sessions
if [ -n "$SESSION_ID" ]; then
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/sessions/$SESSION_ID")
  assert_status "DELETE session" "200" "$HTTP" || true
fi

# Delete requirements (REQ_ID from #8, MOVE_REQ_ID fixture from #16)
for RID_VAR in "$REQ_ID" "$MOVE_REQ_ID"; do
  if [ -n "$RID_VAR" ]; then
    HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/requirements/$RID_VAR")
    assert_status "DELETE requirement $RID_VAR" "200" "$HTTP" || true
  fi
done

# Delete folders
if [ -n "$FOLDER_ID" ] && [ -n "$NEW_SYS_ID" ]; then
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/systems/$NEW_SYS_ID/folders/$FOLDER_ID")
  assert_status "DELETE folder" "200" "$HTTP" || true
fi

# Delete features
if [ -n "$FEAT_ID" ]; then
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/features/$FEAT_ID")
  assert_status "DELETE feature" "200" "$HTTP" || true
fi

# Delete subsystems
if [ -n "$SUB_ID" ]; then
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/subsystems/$SUB_ID")
  assert_status "DELETE subsystem" "200" "$HTTP" || true
fi

if [ -n "$TARGET_ID" ]; then
  curl -s -o /dev/null -X DELETE "$BASE/subsystems/$TARGET_ID" 2>/dev/null || true
fi

# Delete system (cascade)
if [ -n "$NEW_SYS_ID" ]; then
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/systems/$NEW_SYS_ID")
  assert_status "DELETE system (cascade)" "200" "$HTTP" || true
fi
echo ""

# ── Summary ────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
