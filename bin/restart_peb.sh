#!/bin/bash
set -e
echo "=== Restarting PEB Kernel ==="

# Kill any existing processes
pkill -9 -f "spring-boot:run" 2>/dev/null || true
pkill -9 -f "PebApplication" 2>/dev/null || true
sleep 2

# Clear old log
rm -f /tmp/peb_boot.log

echo "Starting peb-kernel on port 8080..."
cd /home/codex/dev/nexus/jvm/spring/peb-kernel/peb-bootstrap

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/nexus
export SPRING_DATASOURCE_USERNAME=pguser
export SPRING_DATASOURCE_PASSWORD=pgpass

nohup mvn spring-boot:run -B -ntp -Dspring-boot.run.fork=false > /tmp/peb_boot.log 2>&1 &
KERNEL_PID=$!
echo "Kernel PID: $KERNEL_PID"
echo "Log: /tmp/peb_boot.log"

# Wait for startup (up to 90s)
echo -n "Waiting for startup..."
for i in $(seq 1 45); do
  if grep -q "Started PebApplication" /tmp/peb_boot.log 2>/dev/null; then
    echo " STARTED!"
    curl -s http://localhost:8080/actuator/health 2>/dev/null | head -3
    echo ""
    echo "Peb-kernel is running on port 8080"
    exit 0
  fi
  if grep -q "BUILD FAILURE" /tmp/peb_boot.log 2>/dev/null; then
    echo " FAILED"
    echo "Error:"
    grep -A1 "Caused by" /tmp/peb_boot.log | tail -5
    exit 1
  fi
  sleep 2
  echo -n "."
done
echo " TIMEOUT (90s)"
tail -20 /tmp/peb_boot.log
exit 1
