"""agent_scheduler_runner.py — DEPRECATED compatibility shim.

The scheduler runner moved to the Tackle-owned module in T14/T15
(decision 85ae61af + thread 4d2b90b9): ``python/tackle/agent_scheduler_runner.py``
implements the single evaluation tick (``evaluate_tick``), launch
construction via ``nexus_core.harness.launcher``, and cron/event matching.

This module is kept ONLY so the paused cron line / any stale references that
invoke ``python -m conduit.agent_scheduler_runner`` keep working. It re-exports
the canonical implementation; new code should import from ``tackle``.
"""

import logging
import sys

from tackle.agent_scheduler_runner import (  # noqa: F401  (re-export)
    Runner,
    cron_matches_window,
    parse_cron,
)

_log = logging.getLogger("agent-scheduler")
_log.warning(
    "conduit.agent_scheduler_runner is deprecated — use tackle.agent_scheduler_runner "
    "(canonical T14/T15 module)."
)


def main():
    from tackle.agent_scheduler_runner import main as _tackle_main
    _tackle_main()


if __name__ == "__main__":
    sys.exit(main())
