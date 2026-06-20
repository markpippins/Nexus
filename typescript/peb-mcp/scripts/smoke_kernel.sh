#!/usr/bin/env bash
# Self-contained MCP-facade -> PEB-Kernel end-to-end smoke.
# Single-shot: cleans leftovers, relaunches kernel, polls for ready,
# cleans DB rows from prior runs, runs the real PebApiClient smoke.ts,
# captures stdout/stderr to /tmp for raw inspection, queries DB for the
# resulting rows, kills the kernel.
set +e

cd /home/codex/dev/nexus

echo "=== STEP 1: clean leftovers ==="
pkill -9 -f 'spring-boot:run' 2>/dev/null
pkill -9 -f 'org.nexus.peb' 2>/dev/null
pkill -9 -f 'ts-node' 2>/dev/null
sleep 2
echo "  ok"

echo
echo "=== STEP 2: relaunch kernel ==="
rm -f /tmp/peb_run15.log /tmp/peb_mvn15.pid
cd /home/codex/dev/nexus/jvm/spring/peb-kernel/peb-bootstrap
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
PATH=/usr/lib/jvm/java-21-openjdk-amd64/bin:$PATH \
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/nexus \
SPRING_DATASOURCE_USERNAME=pguser \
SPRING_DATASOURCE_PASSWORD=pgpass \
nohup mvn spring-boot:run -B -ntp -Dspring-boot.run.fork=false > /tmp/peb_run15.log 2>&1 &
KERNEL_PID=$!
echo "$KERNEL_PID" > /tmp/peb_mvn15.pid
echo "  PID=$KERNEL_PID"

echo
echo "=== STEP 3: poll for kernel startup (up to 60s) ==="
STARTED=0
for i in $(seq 1 30); do
  if grep -q "Started PebApplication" /tmp/peb_run15.log 2>/dev/null; then
    echo "  Started PebApplication after ${i} polls (~$(($i*2))s)"
    STARTED=1
    break
  fi
  if ! ps -p $KERNEL_PID > /dev/null 2>&1; then
    echo "  ERROR: mvn spring-boot:run terminated early after ~$(($i*2))s"
    break
  fi
  sleep 2
done
if [ $STARTED -eq 0 ]; then
  echo "  ERROR: kernel did not start within 60s"
fi
echo "  port 8080 check: $(ss -tlnp 2>&1 | grep ':8080\b' || echo 'free')"

echo
echo "=== STEP 4: clean DB rows from prior MCP smoke runs ==="
docker exec pgvector_db psql -U pguser -d nexus -c \
  "DELETE FROM peb_violations WHERE entity_id IN ('mcp-smoke-agent','agent-mcp');" 2>&1
docker exec pgvector_db psql -U pguser -d nexus -c \
  "DELETE FROM peb_transactions WHERE entity_id IN ('mcp-smoke-agent','agent-mcp');" 2>&1

echo
echo "=== STEP 5: run PebApiClient smoke.ts (real TS MCP client code) ==="
cd /home/codex/dev/nexus/typescript/peb-mcp
PEB_KERNEL_URL=http://localhost:8080/api/v1/peb \
  timeout 60 npx ts-node smoke.ts > /tmp/peb_mcp_smoke_stdout.out \
                                  2> /tmp/peb_mcp_smoke_stderr.out
SMOKE_EXIT=$?
echo "  ts-node exit code = $SMOKE_EXIT"
echo
echo "--- STDOUT (raw) ---"
cat /tmp/peb_mcp_smoke_stdout.out
echo
echo "--- STDERR (raw) ---"
cat /tmp/peb_mcp_smoke_stderr.out

echo
echo "=== STEP 6: DB verification ==="
echo "--- peb_transactions rows from MCP smoke ---"
docker exec pgvector_db psql -U pguser -d nexus -c \
  "SELECT id, tool_name, admission_result, entity_id, idempotency_key FROM peb_transactions WHERE entity_id IN ('mcp-smoke-agent','agent-mcp') ORDER BY created_at;"
echo
echo "--- peb_violations rows from MCP smoke ---"
docker exec pgvector_db psql -U pguser -d nexus -c \
  "SELECT id, transaction_id, violation_type, severity, entity_id, capability_attempted, resolution FROM peb_violations WHERE entity_id IN ('mcp-smoke-agent','agent-mcp') ORDER BY created_at;"
echo
echo "--- counts ---"
docker exec pgvector_db psql -U pguser -d nexus -c \
  "SELECT (SELECT count(*) FROM peb_transactions WHERE entity_id IN ('mcp-smoke-agent','agent-mcp')) AS audit_rows, (SELECT count(*) FROM peb_violations WHERE entity_id IN ('mcp-smoke-agent','agent-mcp')) AS violation_rows;"

echo
echo "=== STEP 7: kill kernel ==="
kill -TERM $KERNEL_PID 2>&1 || true
sleep 2
pkill -9 -f 'spring-boot:run' 2>/dev/null
pkill -9 -f 'org.nexus.peb' 2>/dev/null
echo "  kernel killed"

echo
echo "=== DONE ==="
