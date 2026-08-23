#!/bin/bash
# vd-ci-backup.sh — vanadium CI state backup (ruling V4, 2026-08-23)
#
# Scope per ruling: Jenkins JENKINS_HOME (config/jobs/credentials),
# sonar-db dumps, sonarqube conf. EXCLUDES workspaces/build artifacts
# (rebuildable) and plugin caches (re-downloadable via plugins.txt).
#
# Usage:
#   vd-ci-backup.sh              # create + verify local staging bundle
#   vd-ci-backup.sh --push      # additionally rsync newest bundle to $BACKUP_TARGET
#
# Env:
#   SONAR_DB_USER   (default sonar)     POSTGRES user inside vd-ci-sonar-db
#   BACKUP_ROOT     (default /home/codex/vd-ci-backups)
#   BACKUP_TARGET   (default codex@barium.attlocal.net:vd-ci-backups)
#   KEEP_DAILY      (default 7)

set -euo pipefail

JENKINS_HOME="${JENKINS_HOME:-/home/codex/vd-jenkins-home}"
SONAR_DB_CONTAINER="${SONAR_DB_CONTAINER:-vd-ci-sonar-db}"
SONAR_DB_USER="${SONAR_DB_USER:-sonar}"
CONF_FILE="${CONF_FILE:-/home/codex/dev/nexus/docker/vanadium-ci/conf-override.properties}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/codex/vd-ci-backups}"
BACKUP_TARGET="${BACKUP_TARGET:-codex@barium.attlocal.net:vd-ci-backups}"
KEEP_DAILY="${KEEP_DAILY:-7}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY_DIR="$BACKUP_ROOT/$STAMP"
MANIFEST="$DAY_DIR/SHA256SUMS"

log() { echo "[$(date -u +%H:%M:%SZ)] $*"; }

mkdir -p "$DAY_DIR"

# ── 1. Jenkins home tarball (excluding rebuildables) ─────────────────
if [ -d "$JENKINS_HOME" ]; then
  log "packing jenkins home..."
  tar czf "$DAY_DIR/jenkins-home.tar.gz" \
    --exclude='jenkins-home.tar.gz' \
    --exclude='workspace' \
    --exclude='builds' \
    --exclude='cache' \
    --exclude='caches' \
    --exclude='.m2' \
    --exclude='war' \
    --exclude='copy_reference_file.log' \
    -C "$(dirname "$JENKINS_HOME")" "$(basename "$JENKINS_HOME")"
else
  log "WARN: $JENKINS_HOME missing — skipping jenkins tarball"
fi

# ── 2. SonarDB dump ──────────────────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -qx "$SONAR_DB_CONTAINER"; then
  log "dumping sonar-db..."
  docker exec "$SONAR_DB_CONTAINER" \
    pg_dump -U "$SONAR_DB_USER" -d sonar --no-owner \
    | gzip > "$DAY_DIR/sonar-db.sql.gz"
else
  log "WARN: container $SONAR_DB_CONTAINER not running — skipping db dump"
fi

# ── 3. Sonar conf (repo-tracked copy as of backup time) ──────────────
[ -f "$CONF_FILE" ] && cp "$CONF_FILE" "$DAY_DIR/conf-override.properties" \
  || log "WARN: $CONF_FILE missing"

# ── 4. Verify ────────────────────────────────────────────────────────
log "verifying..."
tar tzf "$DAY_DIR"/jenkins-home.tar.gz >/dev/null 2>&1 \
  || { log "FAIL: jenkins tarball corrupt"; exit 1; }
[ -s "$DAY_DIR/sonar-db.sql.gz" ] \
  || { log "FAIL: sonar-db dump empty"; exit 1; }
gzip -t "$DAY_DIR/sonar-db.sql.gz" || { log "FAIL: db dump gzip corrupt"; exit 1; }

( cd "$DAY_DIR" && sha256sum ./*.gz ./*.properties > SHA256SUMS )
cat "$MANIFEST"

# ── 5. Retention (keep last N day-dirs) ──────────────────────────────
ls -1d "$BACKUP_ROOT"/20* 2>/dev/null | sort | head -n -"$KEEP_DAILY" \
  | while read -r old; do rm -rf "$old"; log "pruned $old"; done

SIZE=$(du -sh "$DAY_DIR" | cut -f1)
log "bundle complete: $DAY_DIR ($SIZE)"

# ── 6. Optional push leg (needs SSH key authorized on target) ────────
if [ "${1:-}" = "--push" ]; then
  log "pushing to $BACKUP_TARGET ..."
  rsync -az --partial "$DAY_DIR/" "$BACKUP_TARGET/$STAMP/"
  log "pushed."
fi
