#!/usr/bin/env bash
# restore-nebula.sh — Restore nebula database from a pg_dump backup file.
#
# Usage:
#   bash restore-nebula.sh [backup-file]
#
# If no file is specified, uses the latest backup in scripts/sql/.
#
# Requires: Docker container pgvector_db running on localhost:5432

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/../sql"

FORCE_MODE=false
BACKUP_FILE=""

for arg in "$@"; do
  case "$arg" in
    -y|--yes) FORCE_MODE=true ;;
    -*) echo "Unknown flag: $arg"; exit 1 ;;
    *) BACKUP_FILE="$arg" ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE=$(ls -t "$SQL_DIR"/nebula-backup-*.sql 2>/dev/null | head -1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "ERROR: No backup file found in $SQL_DIR"
    echo "Usage: $0 [backup-file]"
    exit 1
  fi
  echo "Using latest backup: $(basename "$BACKUP_FILE")"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║     NEBULA DATABASE RESTORE                ║"
echo "╠════════════════════════════════════════════╣"
echo "║  File: $(basename "$BACKUP_FILE")"
echo "║  Size: $(du -h "$BACKUP_FILE" | cut -f1)"
echo "╚════════════════════════════════════════════╝"
echo ""

# ── Warn and confirm ──────────────────────────────────────────────
if [ "$FORCE_MODE" = true ]; then
  echo "⚠  Skipping confirmation (--yes flag set)"
else
  echo "⚠  This will TRUNCATE all nebula tables and reload from backup."
  echo ""
  read -r -p "Proceed? [y/N] " response || true
  case "${response,,}" in
    y|yes) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

# ── Truncate all nebula tables ────────────────────────────────────
echo ""
echo "Truncating nebula tables..."
docker exec -i pgvector_db psql -U pguser -d nexus -c "TRUNCATE TABLE nebula.systems CASCADE" 2>&1
echo "  ✓ Tables truncated (systems CASCADE handles all dependent tables)"

# ── Load backup ───────────────────────────────────────────────────
echo ""
echo "Loading backup..."
docker exec -i pgvector_db psql -U pguser -d nexus < "$BACKUP_FILE" 2>&1
echo "  ✓ Backup loaded"

# ── Verify ─────────────────────────────────────────────────────────
echo ""
echo "Verifying row counts..."
docker exec pgvector_db psql -U pguser -d nexus -t -c "
SELECT 'systems: ' || count(*) FROM nebula.systems
UNION ALL SELECT 'subsystems: ' || count(*) FROM nebula.subsystems
UNION ALL SELECT 'features: ' || count(*) FROM nebula.features
UNION ALL SELECT 'workspaces: ' || count(*) FROM nebula.system_workspaces
UNION ALL SELECT 'folders: ' || count(*) FROM nebula.system_folders
UNION ALL SELECT 'requirements: ' || count(*) FROM nebula.requirements
ORDER BY 1;" 2>/dev/null | tr -s ' ' | sed 's/^ *//'

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║           RESTORE COMPLETE                 ║"
echo "╚════════════════════════════════════════════╝"
