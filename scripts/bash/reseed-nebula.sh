#!/usr/bin/env bash
# reseed-nebula.sh — Scan nexus filesystem and populate nebula with all
# projects that have documentation (README.md, ARCHITECTURE.md, etc.)
#
# Usage: bash reseed-nebula.sh
# Requires: nebula-srv running on localhost:3101, jq installed

set -euo pipefail

API="http://localhost:3101/api"
NEXUS_ROOT="/home/codex/dev/nexus"
SYSTEMS_CREATED=0
SUBS_CREATED=0
WORKSPACES_CREATED=0

# ── helpers ────────────────────────────────────────────────────────

api_post() {
  local url="$1" data="$2"
  curl -sf -X POST "$url" -H 'Content-Type: application/json' -d "$data" > /dev/null
}

api_post_capture() {
  local url="$1" data="$2"
  curl -sf -X POST "$url" -H 'Content-Type: application/json' -d "$data"
}

# Read first 3000 chars of a file, return as JSON string or null
read_doc() {
  local fpath="$1"
  if [ -f "$fpath" ]; then
    head -c 3000 "$fpath" | jq -Rs .
  else
    echo 'null'
  fi
}

# Read first heading line as description, return as JSON string or ""
read_desc() {
  local fpath="$1"
  if [ -f "$fpath" ]; then
    head -1 "$fpath" | sed 's/^#\+\s*//' | tr -d '\n' | jq -Rs .
  else
    echo '""'
  fi
}

# ── create system ──────────────────────────────────────────────────
create_system() {
  local name="$1" desc="$2" readme_file="$3" arch_file="$4"
  local readme_val="null" arch_val="null"

  [ -n "$readme_file" ] && [ -f "$NEXUS_ROOT/$readme_file" ] && readme_val=$(read_doc "$NEXUS_ROOT/$readme_file")
  [ -n "$arch_file" ] && [ -f "$NEXUS_ROOT/$arch_file" ] && arch_val=$(read_doc "$NEXUS_ROOT/$arch_file")

  local data
  data=$(jq -n --arg name "$name" \
               --argjson desc "$desc" \
               --argjson readme "$readme_val" \
               --argjson arch "$arch_val" \
    '{name: $name, description: $desc, readme: $readme, architecture: $arch}')

  local result
  result=$(api_post_capture "$API/systems" "$data")

  local sys_id
  sys_id=$(echo "$result" | jq -r '.id // empty')
  if [ -n "$sys_id" ]; then
    SYSTEMS_CREATED=$((SYSTEMS_CREATED + 1))
    echo "  ✓ System: $name ($sys_id)" >&2
  fi
  echo "$sys_id"
}

# ── create subsystem ───────────────────────────────────────────────
create_subsystem() {
  local system_id="$1" name="$2" desc="$3" readme_file="$4"
  local readme_val="null"
  [ -n "$readme_file" ] && [ -f "$NEXUS_ROOT/$readme_file" ] && readme_val=$(read_doc "$NEXUS_ROOT/$readme_file")

  local data
  data=$(jq -n --arg systemId "$system_id" \
               --arg name "$name" \
               --argjson desc "$desc" \
               --argjson readme "$readme_val" \
    '{systemId: $systemId, name: $name, description: $desc, readme: $readme}')

  local result
  result=$(api_post_capture "$API/subsystems" "$data")

  local sub_id
  sub_id=$(echo "$result" | jq -r '.id // empty')
  if [ -n "$sub_id" ]; then
    SUBS_CREATED=$((SUBS_CREATED + 1))
    echo "    ✓ Subsystem: $name ($sub_id)" >&2
  fi
  echo "$sub_id"
}

# ── create workspace ───────────────────────────────────────────────
create_workspace() {
  local system_id="$1" subsystem_id="$2" workspace_path="$3"

  local data
  if [ -z "$subsystem_id" ]; then
    data=$(jq -n --arg sysId "$system_id" --arg wp "$workspace_path" \
      '{systemId: $sysId, subsystemId: null, workspacePath: $wp}')
  else
    data=$(jq -n --arg sysId "$system_id" --arg subId "$subsystem_id" --arg wp "$workspace_path" \
      '{systemId: $sysId, subsystemId: $subId, workspacePath: $wp}')
  fi

  if api_post "$API/workspaces" "$data"; then
    WORKSPACES_CREATED=$((WORKSPACES_CREATED + 1))
    echo "      + workspace: $workspace_path" >&2
  fi
}

# ════════════════════════════════════════════════════════════════════
echo "╔════════════════════════════════════════════╗"
echo "║     NEBULA RESEED — Filesystem Scan       ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# ── Angular Apps ───────────────────────────────────────────────────
echo "── Angular Apps ──"
ANG_ID=$(create_system "Angular Apps" '"Angular frontend applications"' "angular/README.md" "")
[ -n "$ANG_ID" ] && {
  create_subsystem "$ANG_ID" "Conduit UI" '"Pipeline management Angular UI"' "angular/conduit-ui/README.md"
  create_workspace "$ANG_ID" "" "angular/conduit-ui"

  create_subsystem "$ANG_ID" "Nebula UI" '"RMS Angular application"' "angular/nebula-ui/README.md"
  create_workspace "$ANG_ID" "" "angular/nebula-ui"

  create_subsystem "$ANG_ID" "Nexus Console" '"Main developer console"' "angular/nexus-console/README.md"
  create_workspace "$ANG_ID" "" "angular/nexus-console"

  create_subsystem "$ANG_ID" "Duality UI" '"Dual-pane interface"' "angular/duality-ui/README.md"
  create_workspace "$ANG_ID" "" "angular/duality-ui"

  create_subsystem "$ANG_ID" "Plurality UI" '"Multi-agent view"' "angular/plurality-ui/README.md"
  create_workspace "$ANG_ID" "" "angular/plurality-ui"

  create_subsystem "$ANG_ID" "Nexus Orb" '"Orb visualization component"' "angular/nexus-orb/README.md"
  create_workspace "$ANG_ID" "" "angular/nexus-orb"

  create_subsystem "$ANG_ID" "Prompt Architect" '"Prompt crafting interface"' "angular/prompt-architect/README.md"
  create_workspace "$ANG_ID" "" "angular/prompt-architect"
}

# ── TypeScript Services ────────────────────────────────────────────
echo "── TypeScript Services ──"
TS_ID=$(create_system "TypeScript Services" '"Backend services and utilities in TypeScript"' "typescript/README.md" "typescript/ARCHITECTURE.md")
[ -n "$TS_ID" ] && {
  create_subsystem "$TS_ID" "Conduit MCP" '"MCP server with SSE and watcher"' "typescript/conduit-mcp/README.md"
  create_workspace "$TS_ID" "" "typescript/conduit-mcp"

  create_subsystem "$TS_ID" "Nebula SRV" '"RMS Express API server"' "typescript/nebula-srv/README.md"
  create_workspace "$TS_ID" "" "typescript/nebula-srv"

  create_subsystem "$TS_ID" "Broker Client" '"Service broker client library"' "typescript/broker-client/README.md"
  create_workspace "$TS_ID" "" "typescript/broker-client"

  create_subsystem "$TS_ID" "Broker Gateway Proxy" '"Gateway proxy service"' "typescript/broker-gateway-proxy/README.md"
  create_workspace "$TS_ID" "" "typescript/broker-gateway-proxy"

  create_subsystem "$TS_ID" "Broker Service Proxy" '"Service proxy layer"' "typescript/broker-service-proxy/README.md"
  create_workspace "$TS_ID" "" "typescript/broker-service-proxy"

  create_subsystem "$TS_ID" "File System Server" '"Virtual filesystem service"' "typescript/file-system-server/README.md"
  create_workspace "$TS_ID" "" "typescript/file-system-server"

  create_subsystem "$TS_ID" "Image Server" '"Image processing service"' "typescript/image-server/README.md"
  create_workspace "$TS_ID" "" "typescript/image-server"

  create_subsystem "$TS_ID" "Mock Broker Service" '"Mock broker for testing"' "typescript/mock-broker-service/README.md"
  create_workspace "$TS_ID" "" "typescript/mock-broker-service"

  create_subsystem "$TS_ID" "Unsplash" '"Unsplash image integration"' "typescript/unsplash/README.md"
  create_workspace "$TS_ID" "" "typescript/unsplash"

  create_subsystem "$TS_ID" "Google Integration" '"Google services integration"' "typescript/google/README.md"
  create_workspace "$TS_ID" "" "typescript/google"
}

# ── Python Services ────────────────────────────────────────────────
echo "── Python Services ──"
PY_ID=$(create_system "Python Services" '"Python backend services and pipelines"' "" "")
[ -n "$PY_ID" ] && {
  create_subsystem "$PY_ID" "Cascade" '"NATS-based event pipeline orchestrator"' "python/cascade/README.md"
  create_workspace "$PY_ID" "" "python/cascade"

  create_subsystem "$PY_ID" "Conduit (Legacy)" '"Legacy Python conduit service"' "legacy/python/conduit/README.md"
  create_workspace "$PY_ID" "" "legacy/python/conduit"

  create_subsystem "$PY_ID" "Harvest Pipeline" '"Chat transcript ingestion and candidate extraction pipeline"' "python/rover/README.md"
  create_workspace "$PY_ID" "" "python/rover"

  create_subsystem "$PY_ID" "FS Crawler" '"Filesystem crawler and watcher"' "python/fs/fs-crawler/README.md"
  create_workspace "$PY_ID" "" "python/fs/fs-crawler"

  create_subsystem "$PY_ID" "FS Crawler Adapter" '"Crawler adapter layer"' "python/fs/fs-crawler-adapter/README.md"
  create_workspace "$PY_ID" "" "python/fs/fs-crawler-adapter"

  create_subsystem "$PY_ID" "Vision (LOSM Kernel)" '"LOSM vision analysis kernel"' "python/vision/losm-kernel/README.md"
  create_workspace "$PY_ID" "" "python/vision/losm-kernel"
}

# ── JVM Services ───────────────────────────────────────────────────
echo "── JVM Services ──"
JVM_ID=$(create_system "JVM Services" '"Java/Kotlin service broker and registry implementations"' "jvm/README.md" "")
[ -n "$JVM_ID" ] && {
  create_subsystem "$JVM_ID" "Spring Service Broker" '"Spring-based service broker"' "jvm/spring/service-broker/README.md"
  create_workspace "$JVM_ID" "" "jvm/spring/service-broker"

  create_subsystem "$JVM_ID" "Spring Service Registry" '"Service registry with Spring"' "jvm/spring/service-registry/README.md"
  create_workspace "$JVM_ID" "" "jvm/spring/service-registry"

  create_subsystem "$JVM_ID" "Spring PEB Kernel" '"PEB kernel implementation"' "jvm/spring/peb-kernel/README.md"
  create_workspace "$JVM_ID" "" "jvm/spring/peb-kernel"

  create_subsystem "$JVM_ID" "Terrain Server" '"Infrastructure topology registry"' "jvm/spring/terrain/README.md"
  create_workspace "$JVM_ID" "" "jvm/spring/terrain"

  create_subsystem "$JVM_ID" "Helidon" '"Helidon microservice stack"' "jvm/helidon/README.md"
  create_workspace "$JVM_ID" "" "jvm/helidon"

  create_subsystem "$JVM_ID" "Helidon User Access Service" '"User access service on Helidon"' "jvm/helidon/user-access-service/README.md"
  create_workspace "$JVM_ID" "" "jvm/helidon/user-access-service"

  create_subsystem "$JVM_ID" "Quarkus" '"Quarkus service implementation"' "jvm/quarkus/README.md"
  create_workspace "$JVM_ID" "" "jvm/quarkus"

  create_subsystem "$JVM_ID" "Quarkus Broker Gateway" '"Broker gateway on Quarkus"' "jvm/quarkus/broker-gateway/README.md"
  create_workspace "$JVM_ID" "" "jvm/quarkus/broker-gateway"

  create_subsystem "$JVM_ID" "Shared Core" '"Shared core library for JVM services"' "jvm/shared/core/README.md"
  create_workspace "$JVM_ID" "" "jvm/shared/core"

  # Ballerina moved out of the JVM tier to nexus/ballerina (2026-08-22,
  # admin decision) — it is its own moat layer now, not a JVM concern.
}

# ── Go Services ────────────────────────────────────────────────────
echo "── Go Services ──"
GO_ID=$(create_system "Go Services" '"Go-based CCNF and WRP implementations"' "" "")
[ -n "$GO_ID" ] && {
  create_subsystem "$GO_ID" "CCNF Reference" '"Canonical normalization reference implementation"' "go/wrp/ccnf-ref/README.md"
  create_workspace "$GO_ID" "" "go/wrp/ccnf-ref"
}

# ── Rust Services ──────────────────────────────────────────────────
echo "── Rust Services ──"
RUST_ID=$(create_system "Rust Services" '"Rust-based CCNF verifier"' "" "")
[ -n "$RUST_ID" ] && {
  create_subsystem "$RUST_ID" "CCNF Verifier" '"Rust CCNF verification engine"' "rust/wrp/ccnf-verifier/README.md"
  create_workspace "$RUST_ID" "" "rust/wrp/ccnf-verifier"
}

# ── Moleculer ──────────────────────────────────────────────────────
echo "── Moleculer ──"
MOL_ID=$(create_system "Moleculer Services" '"Moleculer microservices framework projects"' "moleculer/README.md" "")
[ -n "$MOL_ID" ] && {
  create_subsystem "$MOL_ID" "Search Service" '"Moleculer-based search service"' "moleculer/search/README.md"
  create_workspace "$MOL_ID" "" "moleculer/search"
}

# ── AdonisJS ───────────────────────────────────────────────────────
echo "── AdonisJS ──"
ADO_ID=$(create_system "AdonisJS Services" '"AdonisJS-based broker gateway"' "" "")
[ -n "$ADO_ID" ] && {
  create_subsystem "$ADO_ID" "Broker Gateway Proxy" '"AdonisJS broker gateway proxy"' "adonisjs/broker-gateway-proxy/README.md"
  create_workspace "$ADO_ID" "" "adonisjs/broker-gateway-proxy"
}

# ── Tools & Scripts ────────────────────────────────────────────────
echo "── Tools & Scripts ──"
TOOLS_ID=$(create_system "Tools & Scripts" '"Utility scripts, tools, and agent configurations"' "tools/README.md" "")
[ -n "$TOOLS_ID" ] && {
  create_subsystem "$TOOLS_ID" "Bash Scripts" '"Shell automation scripts"' "scripts/bash/README.md"
  create_workspace "$TOOLS_ID" "" "scripts/bash"

  create_subsystem "$TOOLS_ID" "PowerShell Scripts" '"PowerShell automation scripts"' "scripts/pwsh/README.md"
  create_workspace "$TOOLS_ID" "" "scripts/pwsh"

  create_subsystem "$TOOLS_ID" "Agent Docs" '"Agent architecture and operating model docs"' ".agents/docs/README.md"
  create_workspace "$TOOLS_ID" "" ".agents/docs"

  create_subsystem "$TOOLS_ID" "CER/CCNF Conformance Tests" '"Conformance test suite for CCNF"' ".agents/tests/cer-ccnf-conformance/README.md"
  create_workspace "$TOOLS_ID" "" ".agents/tests/cer-ccnf-conformance"
}

# ── Root-level Nexus docs ──────────────────────────────────────────
echo "── Root Nexus ──"
NEXUS_DESC=$(read_desc "$NEXUS_ROOT/README.md")
NX_ID=$(create_system "Nexus Root" "$NEXUS_DESC" "README.md" "ARCHITECTURE.md")
[ -n "$NX_ID" ] && {
  create_workspace "$NX_ID" "" "."
}

# ════════════════════════════════════════════════════════════════════
echo ""
echo "╔════════════════════════════════════════════╗"
echo "║              RESEED COMPLETE               ║"
echo "╠════════════════════════════════════════════╣"
printf "║  Systems:    %-30s ║\n" "$SYSTEMS_CREATED"
printf "║  Subsystems: %-30s ║\n" "$SUBS_CREATED"
printf "║  Workspaces: %-30s ║\n" "$WORKSPACES_CREATED"
echo "╚════════════════════════════════════════════╝"
