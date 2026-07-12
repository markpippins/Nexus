#!/usr/bin/env bash
# bin/start-address-tts.sh
# ==========================
# Start the Address TTS speech service stack via systemd.
#
# Brings up two systemd user services:
#   1. address-tts     — Python TTS server (Piper + NATS subscriber, port 8600)
#   2. address-tts-mcp — TypeScript MCP server (agent interface, port 3105)
#
# Idempotent: safe to run repeatedly; systemctl start is a no-op
# when the service is already running.
#
# Usage:
#   bin/start-address-tts.sh          # start both services
#   bin/start-address-tts.sh status   # print status of both services
#   bin/start-address-tts.sh stop     # stop both services

set -euo pipefail

# ── Helpers ─────────────────────────────────────────────────────────

green()  { printf '\033[32m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }

banner() {
  echo ""
  echo "══════════════════════════════════════════════"
  echo "  Address TTS — Speech Service Stack (systemd)"
  echo "══════════════════════════════════════════════"
  echo ""
}

svc_status() {
  local unit="$1"
  if systemctl --user is-active --quiet "$unit" 2>/dev/null; then
    echo "  active"
  else
    echo "  inactive"
  fi
}

# ── Commands ────────────────────────────────────────────────────────

cmd_start() {
  banner

  echo "▶ address-tts.service (port 8600)"
  systemctl --user start address-tts.service 2>/dev/null && \
    green "  started" || red "  FAILED"

  echo ""
  echo "▶ address-tts-mcp.service (port 3105)"
  systemctl --user start address-tts-mcp.service 2>/dev/null && \
    green "  started" || red "  FAILED"

  echo ""
  green "✓ TTS stack started"
}

cmd_status() {
  echo ""
  echo "Address TTS Service Stack Status (systemd)"
  echo "──────────────────────────────────────────"

  echo ""
  echo "▶ address-tts.service (port 8600):$(svc_status address-tts.service)"
  systemctl --user status address-tts.service --no-pager -l 2>/dev/null | head -6 || echo "  not found"

  echo ""
  echo "▶ address-tts-mcp.service (port 3105):$(svc_status address-tts-mcp.service)"
  systemctl --user status address-tts-mcp.service --no-pager -l 2>/dev/null | head -6 || echo "  not found"

  echo ""
}

cmd_stop() {
  echo ""
  echo "Stopping Address TTS stack..."

  systemctl --user stop address-tts-mcp.service 2>/dev/null || true
  systemctl --user stop address-tts.service 2>/dev/null || true

  green "✓ TTS stack stopped"
}

# ── Main ────────────────────────────────────────────────────────────

case "${1:-start}" in
  start)  cmd_start ;;
  status) cmd_status ;;
  stop)   cmd_stop ;;
  *)
    echo "Usage: $0 {start|status|stop}"
    exit 1
    ;;
esac
