"""Tackle: AI config registry and inference routing for Nexus.

Provides harness-based CLI command building, role->model routing, and
the agent_chat server that dispatches prompts to opencode subprocesses.

Schema: tackle.* in PostgreSQL (managed by tackle-mcp TypeScript server).
"""
