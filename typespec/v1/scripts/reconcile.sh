#!/usr/bin/env bash
# ==============================================================================
# reconcile.sh — TypeSpec ↔ JVM compilation diff workflow
#
# Compiles all TypeSpec contracts to staging, then compares the generated
# model stubs against the real JVM implementations. Produces a reconciliation
# report highlighting:
#   - MISSING: fields in JVM entity but not in TypeSpec model
#   - EXTRA: fields in TypeSpec model but not in JVM entity
#   - TYPE_MISMATCH: fields with different types between the two
#   - OK: fields match
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TYPESPEC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING_DIR="$TYPESPEC_DIR/staging/jvm"
JVM_DIR="$(cd "$TYPESPEC_DIR/../../jvm" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  TypeSpec ↔ JVM Reconciliation Report${NC}"
echo -e "${CYAN}  $(date -u '+%Y-%m-%dT%H:%M:%SZ')${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ==============================================================================
# Step 1: Compile all services to staging
# ==============================================================================
echo -e "${YELLOW}[1/3] Compiling all TypeSpec services to staging...${NC}"

SERVICES=(
  "core:shared/core"
  "service-registry/spring:spring/service-registry"
  "service-broker/spring:spring/service-broker"
  "terrain/spring:spring/terrain"
  "peb-kernel/spring:spring/peb-kernel"
)

for entry in "${SERVICES[@]}"; do
  spec_dir="${entry%%:*}"
  staging_target="${entry##*:}"
  staging_path="$STAGING_DIR/$staging_target"
  tsp_dir="$TYPESPEC_DIR/$spec_dir"

  if [ ! -d "$tsp_dir" ]; then
    echo -e "  ${YELLOW}⚠  Skipping $spec_dir (directory not found)${NC}"
    continue
  fi

  echo -n "  Compiling $spec_dir → $staging_target ... "
  mkdir -p "$staging_path"
  if (cd "$tsp_dir" && npx tsp compile . 2>/dev/null); then
    echo -e "${GREEN}✔${NC}"
  else
    echo -e "${RED}✘ FAILED${NC}"
  fi
done

echo ""

# ==============================================================================
# Step 2: Compare generated model fields against JVM entities
# ==============================================================================
echo -e "${YELLOW}[2/3] Comparing model fields against JVM entities...${NC}"
echo ""

compare_fields() {
  local service_name="$1"
  local model_name="$2"
  local jvm_dir="$3"
  local tsp_gen_dir="$4"
  local entity_file="$jvm_dir/${model_name}.java"
  local stub_file="$tsp_gen_dir/${model_name}.java"

  echo -e "  ${CYAN}── ${service_name}: ${model_name}${NC}"

  if [ ! -f "$entity_file" ] && [ ! -f "$stub_file" ]; then
    echo -e "    ${YELLOW}⚠  Neither JVM nor TypeSpec stub found${NC}"
    return
  fi

  if [ ! -f "$entity_file" ]; then
    echo -e "    ${RED}✘ MISSING: JVM entity not found (TypeSpec-only)${NC}"
    return
  fi

  if [ ! -f "$stub_file" ]; then
    # Check if model exists in TypeSpec source — type-defined but not
    # exposed as a direct API return type (common for nested entities)
    local model_exists=0
    local tsp_sources
    tsp_sources=$(grep -rl "model ${model_name}\b" "$TYPESPEC_DIR" --include="*.tsp" 2>/dev/null || true)
    if [ -n "$tsp_sources" ]; then
      model_exists=1
    fi

    if [ "$model_exists" -eq 1 ]; then
      echo -e "    ${YELLOW}ℹ  INFO:     ${model_name} defined in TypeSpec source but no direct API stub — nested type only${NC}"
    else
      echo -e "    ${RED}✘ MISSING:  ${model_name} — JVM entity exists but no TypeSpec model found${NC}"
    fi
    return
  fi

  # Extract field declarations from JVM entity
  # Matches: private Type name; or private Type name = value;
  local jvm_fields
  jvm_fields=$(grep -E '^\s+private\s+\S+\s+\w+\s*(=\s*[^;]*)?\s*;' "$entity_file" \
    | sed 's/.*private\s\+//;s/\s*=\s*[^;]*\s*;\s*$//;s/\s*;\s*$//' \
    | sed 's/\s\+/:/' || true)

  # Extract field declarations from TypeSpec-generated stub
  # Matches: private final Type name; or private Type name;
  local tsp_fields
  tsp_fields=$(grep -E '^\s+private\s+(final\s+)?\S+\s+\w+\s*;' "$stub_file" \
    | sed 's/.*private\s\+//;s/final\s\+//;s/\s*;\s*$//' \
    | sed 's/\s\+/:/' || true)

  # Build associative arrays of field→type
  declare -A jvm_map
  declare -A tsp_map

  while IFS=':' read -r ftype fname; do
    [ -n "$fname" ] && jvm_map["$fname"]="$ftype"
  done <<< "$jvm_fields"

  while IFS=':' read -r ftype fname; do
    [ -n "$fname" ] && tsp_map["$fname"]="$ftype"
  done <<< "$tsp_fields"

  # Compare: JVM fields vs TypeSpec fields
  local all_fields
  all_fields=$( (echo "${!jvm_map[@]}" "${!tsp_map[@]}") | tr ' ' '\n' | sort -u | grep -v '^$')
  local match_count=0
  local mismatch_count=0
  local missing_count=0
  local extra_count=0

  # Normalize types for comparison: strip generics, normalize primitives vs wrappers
  normalize_type() {
    local t="$1"
    t="${t%%<*}"  # strip generics
    # normalize primitives vs wrappers
    case "$t" in
      long|Long) echo "long";;
      int|Integer) echo "int";;
      boolean|Boolean) echo "boolean";;
      double|Double) echo "double";;
      float|Float) echo "float";;
      *) echo "$t";;
    esac
  }

  for fname in $all_fields; do
    local jtype_raw="${jvm_map[$fname]:-}"
    local ttype_raw="${tsp_map[$fname]:-}"
    local jtype
    jtype=$(normalize_type "$jtype_raw")
    local ttype
    ttype=$(normalize_type "$ttype_raw")

    if [ -z "$jtype" ]; then
      # Extra field in TypeSpec but not in JVM
      echo -e "    ${YELLOW}⚡ EXTRA:    ${fname} (${ttype_raw}) — TypeSpec model only${NC}"
      extra_count=$((extra_count + 1))
    elif [ -z "$ttype" ]; then
      # Missing field in TypeSpec but in JVM
      echo -e "    ${RED}✘ MISSING:  ${fname} (${jtype_raw}) — JVM entity only${NC}"
      missing_count=$((missing_count + 1))
    elif [ "$jtype" != "$ttype" ]; then
      # Type mismatch
      echo -e "    ${RED}✘ TYPE:     ${fname} — JVM:${jtype_raw} vs TypeSpec:${ttype_raw}${NC}"
      mismatch_count=$((mismatch_count + 1))
    else
      match_count=$((match_count + 1))
    fi
  done

  if [ "$match_count" -gt 0 ]; then
    echo -e "    ${GREEN}✔ ${match_count} fields match${NC}"
  fi
  if [ "$missing_count" -gt 0 ] || [ "$mismatch_count" -gt 0 ] || [ "$extra_count" -gt 0 ]; then
    echo -e "    ${RED}  ${missing_count} missing, ${mismatch_count} type mismatch, ${extra_count} extra${NC}"
  fi
  echo ""
}

# --- Service Registry ---
echo -e "  ${CYAN}━━━ Service Registry ━━━${NC}"
compare_fields "service-registry" "FrameworkVendor" \
  "$JVM_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/spring/serviceregistry/entity" \
  "$STAGING_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/serviceregistry"

compare_fields "service-registry" "Framework" \
  "$JVM_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/spring/serviceregistry/entity" \
  "$STAGING_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/serviceregistry"

compare_fields "service-registry" "Service" \
  "$JVM_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/spring/serviceregistry/entity" \
  "$STAGING_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/serviceregistry"

compare_fields "service-registry" "Host" \
  "$JVM_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/spring/serviceregistry/entity" \
  "$STAGING_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/serviceregistry"

compare_fields "service-registry" "Deployment" \
  "$JVM_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/spring/serviceregistry/entity" \
  "$STAGING_DIR/spring/service-registry/src/main/java/com/aibizarchitect/nexus/v1/serviceregistry"

# --- Terrain ---
echo -e "  ${CYAN}━━━ Terrain ━━━${NC}"
for entity in Server McpServer RunnableService CliTool ServiceDependency ServiceType BrokerProfile RegistryServerProfile; do
  compare_fields "terrain" "$entity" \
    "$JVM_DIR/spring/terrain/src/main/java/com/aibizarchitect/nexus/v1/spring/topology/entity" \
    "$STAGING_DIR/spring/terrain/src/main/java/com/aibizarchitect/nexus/v1/topology"
done

# --- PEB Kernel ---
echo -e "  ${CYAN}━━━ PEB Kernel ━━━${NC}"
for entity in PebTransaction PebViolation PebDecision PebState PebTrace PebCapability; do
  compare_fields "peb-kernel" "$entity" \
    "$JVM_DIR/spring/peb-kernel/peb-domain/src/main/java/org/nexus/peb/domain/entity" \
    "$STAGING_DIR/spring/peb-kernel/src/main/java/org/nexus/peb"
done

# ==============================================================================
# Step 3: Summary
# ==============================================================================
echo -e "${YELLOW}[3/3] Reconcilation complete${NC}"
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  NEXT STEPS${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo "  • Review any MISSING / TYPE / EXTRA findings above"
echo "  • For MISSING: add the field to the TypeSpec model"
echo "  • For EXTRA: add the field to the JVM entity or remove from TypeSpec"
echo "  • For TYPE: align the TypeSpec type with JVM"
echo "  • Re-run this script to verify fixes"
echo ""

# Auto-clean staging output (regenerated on next run)
find "$STAGING_DIR" -type f ! -name '.gitkeep' -delete 2>/dev/null || true
echo -e "${GREEN}Staging output cleaned (will be regenerated on next run)${NC}"
echo ""
