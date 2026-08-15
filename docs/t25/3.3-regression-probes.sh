#!/bin/bash
# 3.3 — T25 regression probes (health + resolution)
#
# Baseline run:    bash docs/t25/3.3-regression-probes.sh
# Re-run during/after cutover and diff the PASS/FAIL lines.
#
# Probes:
#   (a) service-registry :8085  health + core endpoints
#   (b) terrain          :8084  health + core endpoints
#   (c) lookup resolution        (the endpoints barbie/console depend on)

set -u
REG=${REGISTRY_URL:-http://localhost:8085}
TER=${TERRAIN_URL:-http://localhost:8084}
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FAIL=0

probe() {
  local label="$1" url="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null)"
  if [ "$code" = "200" ]; then
    echo "PASS  $code  $label"
  else
    echo "FAIL  ${code:-ERR}  $label"
    FAIL=$((FAIL+1))
  fi
}

echo "=== T25 regression probe baseline @ $STAMP ==="

echo "--- service-registry :8085 ---"
probe "registry actuator health"        "$REG/actuator/health"
probe "registry services"               "$REG/api/v1/services?page=0"
probe "registry servers"                "$REG/api/v1/servers?page=0"
probe "registry frameworks"             "$REG/api/v1/frameworks?page=0"
probe "registry libraries"              "$REG/api/v1/libraries?page=0"
probe "registry aggregate"              "$REG/api/v1/registry/aggregate"
probe "registry systems (raw array)"    "$REG/api/v1/registry/systems"
probe "registry status"                 "$REG/api/v1/status"

echo "--- lookup resolution (registry) ---"
for t in service-types server-types environments operating-systems \
         framework-categories framework-languages library-categories; do
  probe "lookup $t" "$REG/api/v1/$t"
done

echo "--- terrain :8084 ---"
probe "terrain actuator health"         "$TER/actuator/health"
probe "terrain platform health"         "$TER/api/v1/platform/health"
probe "terrain servers"                 "$TER/api/v1/servers"
probe "terrain runnable-services"       "$TER/api/v1/runnable-services"
probe "terrain mcp-servers"             "$TER/api/v1/mcp-servers"
probe "terrain service-dependencies"    "$TER/api/v1/service-dependencies"

echo "---"
echo "RESULT: $([ "$FAIL" -eq 0 ] && echo ALL_PASS || echo "${FAIL}_FAILURES")"
exit "$FAIL"
