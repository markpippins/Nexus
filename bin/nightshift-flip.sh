#!/usr/bin/env bash
#
# Night-shift DB flip drill (receipt-isolation Option A) — scripted form of
# python/conduit/DEPLOY_DB_CONFIG.md for the FULL agent-facing surface.
#
# The nightshift scheduler unit (nexus-nightshift-scheduler.service) already
# carries its own CONDUIT_PG_DSN -> nexus_nightshift, so the runner itself
# reads/writes the test DB. BUT the agents it launches connect to the MCP
# servers via their own tools (conduit-mcp :3100, nebula-mcp :3102,
# nebula-srv :3101, wrp-bridge-daemon bridge events) — and those services
# resolve their DB from THEIR OWN environment, which defaults to the live
# `nexus` DB. Without flipping them too, night-shift receipts would land in
# the live pipeline (the exact leak Option A exists to prevent).
#
# Flip surface (systemd --user units; all restarted on flip):
#   conduit-mcp.service       CONDUIT_PG_DSN   (unset -> db.ts default nexus)
#   nebula-mcp.service        PG_DB_NAME       (unset -> index.ts default nexus)
#   nebula-srv.service        PG_DB_NAME       (unset -> index.ts default nexus)
#   wrp-bridge-daemon.service CONDUIT_PG_DSN   (unit hardcodes nexus)
#
# Mechanics: systemd DROP-IN overrides (~/.config/systemd/user/<svc>.service.d/
# nightshift.conf). Drop-ins are additive env overrides — `off` removes the
# drop-in and DAEMON-RELOADS + restarts, so the canonical unit files (and the
# live default) are never modified.
#
# Usage:
#   nightshift-flip.sh status            # show effective DB target per service
#   nightshift-flip.sh on                # flip MCP surface -> nexus_nightshift
#   nightshift-flip.sh off               # roll back -> live nexus (default)
#
# Safe to run repeatedly — `on`/`off` are idempotent and every command is
# guarded. Never flips the scheduler unit (it is permanently isolated).

set -euo pipefail

DB_TARGET="nexus_nightshift"
DB_LIVE="nexus"
CONDUIT_DSN_LIVE="postgresql://pguser:pgpass@localhost:5432/${DB_LIVE}"
CONDUIT_DSN_TARGET="postgresql://pguser:pgpass@localhost:5432/${DB_TARGET}"

# services that resolve via CONDUIT_PG_DSN
CONDUIT_SERVICES=(conduit-mcp wrp-bridge-daemon)
# services that resolve via PG_DB_NAME
NEBULA_SERVICES=(nebula-mcp nebula-srv)

USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
DROPIN_EXT="nightshift.conf"
# Marker file: the scheduler SERVICE requires this to actually launch agents
# (ConditionPathExists). `on` creates it, `off` removes it, so an enabled
# timer is a no-op while the MCP surface is not flipped to the test DB.
MARKER="${XDG_RUNTIME_DIR:-$HOME/.cache}/nightshift-flip.active"

log()  { printf '[nightshift-flip] %s\n' "$*"; }
die()  { log "ERROR: $*" >&2; exit 1; }

ensure_ctl() { command -v systemctl >/dev/null || die "systemctl not found"; }

write_dropins() {
  local svc dsn k
  for svc in "${CONDUIT_SERVICES[@]}"; do
    dsn="$1"
    mkdir -p "${USER_UNIT_DIR}/${svc}.service.d"
    cat > "${USER_UNIT_DIR}/${svc}.service.d/${DROPIN_EXT}" <<EOF
[Service]
Environment=CONDUIT_PG_DSN=${dsn}
EOF
    log "drop-in: ${svc}.service.d/${DROPIN_EXT} -> CONDUIT_PG_DSN=${dsn}"
  done
  for svc in "${NEBULA_SERVICES[@]}"; do
    k="$1"   # db name for PG_DB_NAME services
    mkdir -p "${USER_UNIT_DIR}/${svc}.service.d"
    cat > "${USER_UNIT_DIR}/${svc}.service.d/${DROPIN_EXT}" <<EOF
[Service]
Environment=PG_DB_NAME=${k}
EOF
    log "drop-in: ${svc}.service.d/${DROPIN_EXT} -> PG_DB_NAME=${k}"
  done
  systemctl --user daemon-reload
}

remove_dropins() {
  local svc any=0
  for svc in "${CONDUIT_SERVICES[@]}" "${NEBULA_SERVICES[@]}"; do
    local d="${USER_UNIT_DIR}/${svc}.service.d/${DROPIN_EXT}"
    if [ -f "$d" ]; then
      rm -f "$d"; any=1; log "removed ${svc}.service.d/${DROPIN_EXT}"
    fi
  done
  [ "$any" = 1 ] && systemctl --user daemon-reload || log "no drop-ins to remove"
}

restart_services() {
  local svc
  for svc in "${CONDUIT_SERVICES[@]}" "${NEBULA_SERVICES[@]}"; do
    if systemctl --user is-enabled "$svc" >/dev/null 2>&1; then
      log "restart ${svc}..."
      systemctl --user restart "$svc"
    else
      log "skip ${svc} (not enabled)"
    fi
  done
}

effective_target() {
  # Report the resolved DB each service would use: env override else default.
  local svc db
  for svc in "${CONDUIT_SERVICES[@]}" "${NEBULA_SERVICES[@]}"; do
    db="$DB_LIVE"
    if systemctl --user show -p Environment "$svc" 2>/dev/null | grep -q "CONDUIT_PG_DSN=.*dbname=${DB_TARGET}"; then
      db="$DB_TARGET"
    elif systemctl --user show -p Environment "$svc" 2>/dev/null | grep -q "PG_DB_NAME=${DB_TARGET}"; then
      db="$DB_TARGET"
    fi
    # also honor override-conf files present but not yet applied
    local odf="${USER_UNIT_DIR}/${svc}.service.d/${DROPIN_EXT}"
    if [ -f "$odf" ] && grep -q "${DB_TARGET}" "$odf"; then db="${DB_TARGET} (drop-in present)"; fi
    printf '  %-24s -> %s\n' "$svc" "$db"
  done
  printf '  %-24s -> %s (permanently isolated)\n' "nexus-nightshift-scheduler" "$DB_TARGET"
}

cmd="${1:-status}"
case "$cmd" in
  status)
    ensure_ctl
    log "effective DB target (MCP surface):"
    effective_target
    ;;
  on)
    ensure_ctl
    log "flipping MCP surface -> ${DB_TARGET}"
    write_dropins "$CONDUIT_DSN_TARGET" "$DB_TARGET"
    restart_services
    mkdir -p "$(dirname "$MARKER")"
    : > "$MARKER"
    log "marker created: ${MARKER} (nightshift scheduler may launch agents)"
    log "flip ON complete."
    ;;
  off)
    ensure_ctl
    log "rolling back MCP surface -> ${DB_LIVE}"
    rm -f "$MARKER"
    log "marker removed: ${MARKER} (nightshift scheduler launches blocked)"
    remove_dropins
    restart_services
    log "flip OFF complete."
    ;;
  *)
    die "usage: $0 {status|on|off}"
    ;;
esac