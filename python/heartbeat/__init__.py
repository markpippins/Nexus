# nexus-heartbeat — lightweight Python client for service-registry heartbeats
#
# Usage:
#   from heartbeat import start_heartbeat, stop_heartbeat
#   start_heartbeat(service_id=20, service_name="conduit-mcp")
#   # ... service runs ...
#   stop_heartbeat()
#
# Or as a context manager:
#   with Heartbeat(service_id=20, service_name="conduit-mcp"):
#       pass  # service runs
#
# Or from CLI for testing:
#   python -m heartbeat --service-id 20 --service-name conduit-mcp
