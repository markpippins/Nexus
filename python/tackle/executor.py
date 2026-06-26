"""executor.py — Constants and small utilities shared by the agent_chat server.

Mirrors a subset of ``python/conduit/executor_cloud.py`` — only the parts
that agent_chat needs: the opencode binary path, timeout constant, and
the prompt builder alias (the real implementation is in prompt_renderer).
"""

import os

# ── OpenCode binary path ─────────────────────────────────────────────

OPENCODE_BIN = os.environ.get("OPENCODE_BIN", "/home/codex/.opencode/bin/opencode")

# ── Timeout for external harness invocations (30 min default) ────
# This is a last-resort safety valve — the conduit watchdog
# handles the primary timeout, but this ensures agent_chat itself
# doesn't hang forever even when invoked outside the conduit.
OPENCODE_TIMEOUT_SECONDS = int(os.environ.get("PIPELINE_EXECUTOR_TIMEOUT", "1800"))


# Re-export the prompt builder so agent_chat can import it from here.
# The real implementation lives in tackle.prompt_renderer.
from tackle.prompt_renderer import build_opencode_prompt as _build_opencode_prompt  # noqa: E402, F401
