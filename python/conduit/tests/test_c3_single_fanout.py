"""C3 source contract: exactly ONE live receipt-to-ticket fan-out (plan 8261639).

The C3 to-do requires "one receipt-to-ticket fan-out". Binding rulings:

- Architect decision (2026-09-05, plan 0016): the MCP advanceTicketsOnReceipt
  path is the live position-aware fan-out; DBAdapter.create_next_tickets'
  critic fan-out is DEPRECATED and unreachable (live caller is the execution
  worker as builder only — and even its fan-out branch must not gain new
  callers).
- Q3 (a515667d): resolution.fanout_transition (V139) is THE canonical ledger;
  while STAGED, no producer may route through it in write capacity until C2
  ratification (shadow mode records evidence, spawns nothing).

This test binds the source tree to that contract so a second fan-out cannot
silently appear.
"""
import os
import re

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def _read(relpath):
    with open(os.path.join(NEXUS_ROOT, relpath)) as f:
        return f.read()


class TestSingleLiveFanout:
    def test_mcp_advance_is_the_live_fanout(self):
        src = _read("typescript/conduit-mcp/src/db.ts")
        assert "export async function advanceTicketsOnReceipt" in src, (
            "advanceTicketsOnReceipt (position-aware) must exist as the live fan-out"
        )

    def test_adapter_critic_fanout_marked_deprecated(self):
        src = _read("python/conduit/db_adapter.py")
        m = re.search(r"def create_next_tickets\(.*?(?=\n    def )", src, re.DOTALL)
        assert m, "create_next_tickets not found"
        body = m.group(0)
        assert "DEPRECATION" in body, (
            "create_next_tickets must carry the architect deprecation note"
        )
        assert "do NOT wire new callers" in body

    def test_worker_does_not_call_critic_fanout_branch(self):
        # The only live worker caller passes ROLE="builder"; the critic/
        # planner branches are unreachable. Bind the worker source to that.
        src = _read("python/conduit/execution_worker.py")
        assert 'ROLE = "builder"' in src or "ROLE='builder'" in src or 'ROLE="builder"' in src, (
            "execution worker must run as builder (critic fan-out stays unreachable)"
        )

    def test_lilac_fanout_is_staged_not_called(self):
        """While C3 is staged, apply_fanout must have no production callers."""
        lilac_src = _read("python/conduit/lilac.py")
        assert "def apply_fanout" in lilac_src
        # Search every production python module for live callers.
        prod_dir = os.path.join(NEXUS_ROOT, "python", "conduit")
        callers = []
        for root, _dirs, files in os.walk(prod_dir):
            if "tests" in root or "_archived" in root:
                continue
            for fn in files:
                if not fn.endswith(".py") or fn == "lilac.py":
                    continue
                p = os.path.join(root, fn)
                with open(p) as f:
                    body = f.read()
                if ".apply_fanout(" in body or "apply_fanout(" in body and "def apply_fanout" not in body:
                    callers.append(os.path.relpath(p, NEXUS_ROOT))
        assert callers == [], (
            f"C3 is STAGED: apply_fanout must have no production callers until C2 "
            f"ratification — found: {callers}"
        )

    def test_shadow_mode_spawns_no_tickets(self):
        src = _read("python/conduit/lilac.py")
        m = re.search(r"def shadow_record_receipt\(.*?(?=\nclass |\ndef [a-z_]+\(|\Z)", src, re.DOTALL)
        assert m, "shadow_record_receipt not found"
        body = m.group(0)
        assert "apply_fanout" not in body and "issue_ticket" not in body, (
            "shadow mode records receipts only — it must never spawn tickets"
        )
