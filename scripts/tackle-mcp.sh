#!/usr/bin/env bash
# ─── Tackle MCP management script ───
# Usage: ./scripts/tackle-mcp.sh {start|stop|restart|status|logs|enable|disable}

SERVICE="tackle-mcp.service"

case "${1:-help}" in
  start)
    echo "Starting tackle-mcp..."
    systemctl --user start "$SERVICE"
    sleep 2
    systemctl --user status "$SERVICE" --no-pager | head -5
    ;;
  stop)
    echo "Stopping tackle-mcp..."
    systemctl --user stop "$SERVICE"
    ;;
  restart)
    echo "Restarting tackle-mcp..."
    systemctl --user restart "$SERVICE"
    sleep 2
    systemctl --user status "$SERVICE" --no-pager | head -5
    ;;
  status)
    systemctl --user status "$SERVICE" --no-pager
    ;;
  logs)
    journalctl --user -u "$SERVICE" -n 50 --no-pager -f
    ;;
  enable)
    echo "Enabling tackle-mcp on boot..."
    systemctl --user enable "$SERVICE"
    ;;
  disable)
    echo "Disabling tackle-mcp on boot..."
    systemctl --user disable "$SERVICE"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|enable|disable}"
    echo ""
    echo "Commands:"
    echo "  start    Start the tackle-mcp service"
    echo "  stop     Stop the tackle-mcp service"
    echo "  restart  Restart the tackle-mcp service"
    echo "  status   Show service status"
    echo "  logs     Tail service logs (Ctrl+C to exit)"
    echo "  enable   Enable service to start on boot"
    echo "  disable  Disable service from starting on boot"
    ;;
esac
