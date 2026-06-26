"""Conduit: cron-driven WorkRequest pipeline.

Processes plans through a ticket/receipt lifecycle, dispatching
WorkRequests to model executors (opencode, ollama, codex) via
executor_cloud.py subprocesses.  AI config (providers, harnesses,
models, role routing) is owned by tackle-mcp on :3400.
"""

__version__ = "2.1.0"