#!/bin/bash
# bin/restart_peb.sh — restart the PEB Kernel service
#
# Supports both JVM and Python runtimes via the PEB_KERNEL_RUNTIME env var:
#   PEB_KERNEL_RUNTIME=jvm     (default) — restart the Spring Boot kernel
#   PEB_KERNEL_RUNTIME=python            — restart the Python FastAPI kernel
#
# The readiness wait uses a curl loop on /actuator/health for both runtimes
# (both serve the Spring-actuator-compatible health path deliberately).
set -e
echo "=== Restarting PEB Kernel ==="

RUNTIME="${PEB_KERNEL_RUNTIME:-jvm}"
PEB_PORT="${PEB_PORT:-8080}"
HEALTH_URL="http://localhost:${PEB_PORT}/actuator/health"

# ── Kill any existing PEB process ──────────────────────────────────────
if [ "$RUNTIME" = "python" ]; then
    pkill -9 -f "peb_kernel.main" 2>/dev/null || true
else
    pkill -9 -f "spring-boot:run" 2>/dev/null || true
    pkill -9 -f "PebApplication" 2>/dev/null || true
fi
sleep 2

# Clear old log
rm -f /tmp/peb_boot.log

echo "Starting peb-kernel (${RUNTIME}) on port ${PEB_PORT}..."

if [ "$RUNTIME" = "python" ]; then
    # ── Python runtime ────────────────────────────────────────────────
    export PEB_PORT="$PEB_PORT"
    export PEB_HOST="0.0.0.0"
    export PEB_STORE="postgres"
    export PEB_DATABASE_URL="${PEB_DATABASE_URL:-postgresql://pguser:pgpass@localhost:5432/nexus}"
    export PYTHONPATH="/home/codex/dev/nexus/python/peb-kernel/src"

    cd /home/codex/dev/nexus/python/peb-kernel
    nohup ./run-peb-kernel.sh > /tmp/peb_boot.log 2>&1 &
else
    # ── JVM runtime (original path) ──────────────────────────────────
    export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
    export PATH=$JAVA_HOME/bin:$PATH
    export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/nexus
    export SPRING_DATASOURCE_USERNAME=pguser
    export SPRING_DATASOURCE_PASSWORD=pgpass

    cd /home/codex/dev/nexus/jvm/spring/peb-kernel/peb-bootstrap
    nohup mvn spring-boot:run -B -ntp -Dspring-boot.run.fork=false > /tmp/peb_boot.log 2>&1 &
fi

KERNEL_PID=$!
echo "Kernel PID: $KERNEL_PID"
echo "Log: /tmp/peb_boot.log"

# ── Wait for health endpoint (up to 90s) ────────────────────────────────
# Both JVM and Python serve GET /actuator/health.  This replaces the old
# grep-for-"Started PebApplication" approach, which only worked for the JVM.
echo -n "Waiting for startup..."
for i in $(seq 1 45); do
  if curl -s --max-time 2 "$HEALTH_URL" 2>/dev/null | head -3 | grep -q .; then
    echo " STARTED!"
    curl -s "$HEALTH_URL" 2>/dev/null | head -3
    echo ""
    echo "Peb-kernel (${RUNTIME}) is running on port ${PEB_PORT}"
    exit 0
  fi
  # Check for early failure
  if [ "$RUNTIME" = "jvm" ] && grep -q "BUILD FAILURE" /tmp/peb_boot.log 2>/dev/null; then
    echo " FAILED"
    echo "Error:"
    grep -A1 "Caused by" /tmp/peb_boot.log | tail -5
    exit 1
  fi
  if [ "$RUNTIME" = "python" ] && grep -q "ERROR" /tmp/peb_boot.log 2>/dev/null; then
    echo " FAILED"
    echo "Error:"
    tail -10 /tmp/peb_boot.log
    exit 1
  fi
  sleep 2
  echo -n "."
done
echo " TIMEOUT (90s)"
tail -20 /tmp/peb_boot.log
exit 1
