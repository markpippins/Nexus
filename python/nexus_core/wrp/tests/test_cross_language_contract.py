"""
Cross-language contract tests for WRP state machine and receipt vocabulary.

DRIFT DETECTION per tester-role mandate:
  These tests FAIL at build time the moment the Python and TypeScript
  canonical sources diverge. The tester-role warns: "this project has
  already demonstrated this drift happens, so make the drift loud
  instead of something the next audit has to discover by hand."

Canonical sources compared:
  Python:
    nexus_core/wrp/states.py       — RECEIPT_TO_WRP_STATE, WRP_ADJACENCY_MATRIX
    cascade/event_store.py         — TRANSITION_MATRIX, WorkRequestState
  TypeScript:
    conduit-mcp/src/receipts.ts    — ALLOWED (receipt transition graph)
    conduit-mcp/src/types.ts       — ReceiptType union
    nebula-mcp/src/conduit-wrp-contract.ts — receiptToWrpState, WRP_ADJACENCY_MATRIX

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_cross_language_contract.py -v
"""

import os
import re
import sys
import unittest

# Make nexus_core importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from nexus_core.wrp.states import (
    RECEIPT_TO_WRP_STATE,
    WRP_ADJACENCY_MATRIX as PY_WRP_ADJACENCY_MATRIX,
    is_valid_transition as py_is_valid_transition,
)

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

CASCADE_DIR = os.path.join(NEXUS_ROOT, "python", "cascade")
sys.path.insert(0, CASCADE_DIR)
from event_store import TRANSITION_MATRIX as CASCADE_TRANSITION_MATRIX
from event_store import WorkRequestState as CascadeWRState


# ── File readers ────────────────────────────────────────────────────

def _read(relpath: str) -> str:
    with open(os.path.join(NEXUS_ROOT, relpath)) as f:
        return f.read()


# ══════════════════════════════════════════════════════════════════════
# Section 1: TS ReceiptType union extraction
# ══════════════════════════════════════════════════════════════════════

def extract_ts_receipt_types() -> set[str]:
    """Extract receipt types from types.ts ReceiptType union."""
    src = _read("typescript/conduit-mcp/src/types.ts")
    m = re.search(r"export type ReceiptType =\n((?:\s+\|.*\n)+)", src)
    if not m:
        return set()
    return set(re.findall(r'"(\w+)"', m.group(1)))


def extract_ts_conduit_receipt_types() -> set[str]:
    """Extract from conduit-wrp-contract.ts ConduitReceiptType union."""
    src = _read("typescript/nebula-mcp/src/conduit-wrp-contract.ts")
    m = re.search(r"export type ConduitReceiptType =\n((?:\s+\|.*\n)+)", src)
    if not m:
        return set()
    return set(re.findall(r'"(\w+)"', m.group(1)))


def extract_ts_allowed_keys() -> set[str]:
    """Extract receipt types from receipts.ts ALLOWED keys."""
    src = _read("typescript/conduit-mcp/src/receipts.ts")
    return set(re.findall(r'"?(\w+)"?\s*:\s*\[', src)) - {""}


# ══════════════════════════════════════════════════════════════════════
# Section 2: TS receiptToWrpState extraction
# ══════════════════════════════════════════════════════════════════════

def extract_ts_receipt_to_wrp_state() -> dict[str, str]:
    """Extract receipt → WRP state mapping from conduit-wrp-contract.ts.

    Scoped to ONLY the receiptToWrpState function body to avoid matching
    other switch statements (wrpStateCategory, determineAbstractionLevel).
    """
    src = _read("typescript/nebula-mcp/src/conduit-wrp-contract.ts")
    # Extract only the receiptToWrpState function body
    m = re.search(
        r"export function receiptToWrpState\(.*?\)\s*\{(.*?)\n\}",
        src, re.DOTALL,
    )
    if not m:
        return {}

    mapping: dict[str, str] = {}
    # Pattern: case "RECEIPT_TYPE": return "WRP_STATE";
    for receipt_type, wrp_state in re.findall(
        r'case\s+"(\w+)":\s+return\s+"(\w+)"',
        m.group(1),
    ):
        mapping[receipt_type] = wrp_state
    return mapping


# ══════════════════════════════════════════════════════════════════════
# Section 3: TS WRP adjacency matrix extraction
# ══════════════════════════════════════════════════════════════════════

def extract_ts_wrp_adjacency() -> dict[str, set[str]]:
    """Extract WRP adjacency matrix from conduit-wrp-contract.ts."""
    src = _read("typescript/nebula-mcp/src/conduit-wrp-contract.ts")
    # The matrix is declared as:
    # const WRP_ADJACENCY_MATRIX: Record<WRPState, Record<WRPState, boolean>> = {
    #   CREATED: { CREATED: false, INTAKE: true, ... },
    #   ...
    # }
    m = re.search(
        r"WRP_ADJACENCY_MATRIX.*?= \{(.*?)\n\};",
        src, re.DOTALL,
    )
    if not m:
        return {}

    matrix: dict[str, set[str]] = {}
    # Each line: STATE: { STATE: BOOL, STATE: BOOL, ... },
    for line in m.group(1).split("\n"):
        line = line.strip()
        if not line or ":" not in line:
            continue
        # Extract state name before the colon
        state_match = re.match(r'(\w+)\s*:', line)
        if not state_match:
            continue
        from_state = state_match.group(1)
        # Extract all TARGET: true pairs
        targets = set(re.findall(r'(\w+)\s*:\s*true', line))
        matrix[from_state] = targets
    return matrix


def extract_ts_wrp_states() -> set[str]:
    """Extract WRPState type values from conduit-wrp-contract.ts."""
    src = _read("typescript/nebula-mcp/src/conduit-wrp-contract.ts")
    m = re.search(r"export type WRPState =\n((?:\s+\|.*\n)+)", src)
    if not m:
        return set()
    return set(re.findall(r'"(\w+)"', m.group(1)))


# ══════════════════════════════════════════════════════════════════════
# Section 4: TS ALLOWED transitions extraction
# ══════════════════════════════════════════════════════════════════════

def extract_ts_allowed_transitions() -> dict[str, set[str]]:
    """Extract the ALLOWED transition map from receipts.ts."""
    src = _read("typescript/conduit-mcp/src/receipts.ts")
    m = re.search(r"const ALLOWED.*?= \{((?:.*\n)+?)\};", src)
    if not m:
        return {}

    transitions: dict[str, set[str]] = {}
    for line in m.group(1).split("\n"):
        line = line.strip()
        if not line or ":" not in line:
            continue
        # Handle both quoted and unquoted keys
        key_match = re.match(r'"?(\w*)"?\s*:', line)
        if not key_match:
            continue
        from_type = key_match.group(1) or ""  # empty string key
        targets_raw = re.findall(r'"(\w+)"', line)
        transitions[from_type] = set(targets_raw)
    return transitions


# ══════════════════════════════════════════════════════════════════════
# TESTS
# ══════════════════════════════════════════════════════════════════════


class TestReceiptTypeSetConsistency(unittest.TestCase):
    """All 4 canonical sources must agree on the set of receipt types."""

    @classmethod
    def setUpClass(cls):
        cls.ts_receipt_types = extract_ts_receipt_types()
        cls.ts_conduit_types = extract_ts_conduit_receipt_types()
        cls.ts_allowed_keys = extract_ts_allowed_keys()
        cls.py_receipt_keys = set(RECEIPT_TO_WRP_STATE.keys())

    def test_python_has_all_ts_receipt_types(self):
        """Every TS ReceiptType must be in Python RECEIPT_TO_WRP_STATE."""
        missing = self.ts_receipt_types - self.py_receipt_keys
        self.assertEqual(
            missing, set(),
            f"Receipt types in TS ReceiptType but missing from Python "
            f"RECEIPT_TO_WRP_STATE: {sorted(missing)}",
        )

    def test_python_has_all_ts_conduit_types(self):
        """Every TS ConduitReceiptType must be in Python."""
        missing = self.ts_conduit_types - self.py_receipt_keys
        self.assertEqual(
            missing, set(),
            f"Receipt types in TS ConduitReceiptType but missing from "
            f"Python: {sorted(missing)}",
        )

    def test_python_has_no_extra_types_vs_conduit(self):
        """Python must not have receipt types absent from ConduitReceiptType."""
        extra = self.py_receipt_keys - self.ts_conduit_types
        self.assertEqual(
            extra, set(),
            f"Receipt types in Python RECEIPT_TO_WRP_STATE but not in "
            f"TS ConduitReceiptType: {sorted(extra)}",
        )

    def test_ts_receipt_type_matches_conduit_type(self):
        """TS ReceiptType and ConduitReceiptType must be identical."""
        diff = self.ts_receipt_types ^ self.ts_conduit_types
        self.assertEqual(
            diff, set(),
            f"Mismatch between TS ReceiptType and ConduitReceiptType: "
            f"{sorted(diff)}",
        )

    def test_allowed_keys_are_subset_of_conduit_types(self):
        """Every key in ALLOWED must be in ConduitReceiptType (except "")."""
        extra = self.ts_allowed_keys - self.ts_conduit_types - {""}
        self.assertEqual(
            extra, set(),
            f"ALLOWED keys not in ConduitReceiptType: {sorted(extra)}",
        )

    def test_conduit_types_are_subset_of_allowed_keys(self):
        """Every ConduitReceiptType should appear in ALLOWED keys.

        Terminal states (REVIEW_PASS, API_LIMIT) may have empty target lists
        but should still appear as keys.
        """
        missing = self.ts_conduit_types - self.ts_allowed_keys
        self.assertEqual(
            missing, set(),
            f"ConduitReceiptType values missing from ALLOWED keys: "
            f"{sorted(missing)}",
        )


class TestReceiptToWrpStateMapping(unittest.TestCase):
    """Every receipt type must map to the same WRP state in Python and TS."""

    @classmethod
    def setUpClass(cls):
        cls.ts_mapping = extract_ts_receipt_to_wrp_state()
        cls.py_mapping = RECEIPT_TO_WRP_STATE

    def test_mapping_coverage_same_keys(self):
        """Both mappings must have the same set of receipt types."""
        py_keys = set(self.py_mapping.keys())
        ts_keys = set(self.ts_mapping.keys())
        missing_in_py = ts_keys - py_keys
        missing_in_ts = py_keys - ts_keys
        self.assertEqual(
            missing_in_py, set(),
            f"In TS receiptToWrpState but not Python: {sorted(missing_in_py)}",
        )
        self.assertEqual(
            missing_in_ts, set(),
            f"In Python RECEIPT_TO_WRP_STATE but not TS: {sorted(missing_in_ts)}",
        )

    def test_every_receipt_maps_to_same_wrp_state(self):
        """For every shared receipt type, the WRP state must match."""
        mismatches = []
        for receipt_type in sorted(set(self.py_mapping) & set(self.ts_mapping)):
            py_state = self.py_mapping[receipt_type]
            ts_state = self.ts_mapping[receipt_type]
            if py_state != ts_state:
                mismatches.append(
                    f"  {receipt_type}: Python={py_state} TS={ts_state}"
                )
        self.assertEqual(
            len(mismatches), 0,
            f"Receipt → WRP state mismatches between Python and TS:\n"
            + "\n".join(mismatches),
        )


class TestWrpAdjacencyMatrixConsistency(unittest.TestCase):
    """The WRP adjacency matrix must match across Python and TypeScript."""

    @classmethod
    def setUpClass(cls):
        cls.ts_matrix = extract_ts_wrp_adjacency()
        cls.py_matrix = PY_WRP_ADJACENCY_MATRIX
        cls.ts_states = extract_ts_wrp_states()

    # ── State set identity ──

    def test_same_11_states(self):
        """Both must define exactly 11 WRP states."""
        py_states = set(self.py_matrix.keys())
        self.assertEqual(
            py_states, self.ts_states,
            f"State set mismatch:\n"
            f"  Python only: {sorted(py_states - self.ts_states)}\n"
            f"  TS only:     {sorted(self.ts_states - py_states)}",
        )

    def test_matrix_keys_match_state_type(self):
        """Every key in the TS matrix must be a valid WRPState value."""
        extra = set(self.ts_matrix.keys()) - self.ts_states
        self.assertEqual(
            extra, set(),
            f"TS matrix keys not in WRPState type: {sorted(extra)}",
        )

    # ── Transition identity ──

    def test_every_valid_transition_matches(self):
        """For every (from, to) pair, both matrices must agree."""
        py_states = set(self.py_matrix.keys())
        ts_states = self.ts_states
        common = py_states & ts_states

        only_py = []
        only_ts = []
        for from_state in sorted(common):
            py_targets = self.py_matrix.get(from_state, set())
            ts_targets = self.ts_matrix.get(from_state, set())
            for to_state in sorted(common):
                in_py = to_state in py_targets
                in_ts = to_state in ts_targets
                if in_py and not in_ts:
                    only_py.append(f"  {from_state} → {to_state}")
                elif in_ts and not in_py:
                    only_ts.append(f"  {from_state} → {to_state}")

        msg = []
        if only_py:
            msg.append(f"Transitions in Python but not TS ({len(only_py)}):")
            msg.extend(only_py[:10])
        if only_ts:
            msg.append(f"Transitions in TS but not Python ({len(only_ts)}):")
            msg.extend(only_ts[:10])

        self.assertEqual(
            len(only_py) + len(only_ts), 0,
            "\n".join(msg) if msg else "",
        )

    # ── Terminal state consistency ──

    def test_terminal_states_match(self):
        """Terminal states (no outgoing edges) must match."""
        py_terminal = {s for s, t in self.py_matrix.items() if not t}
        ts_terminal = {s for s, t in self.ts_matrix.items() if not t}
        self.assertEqual(
            py_terminal, ts_terminal,
            f"Terminal state mismatch:\n"
            f"  Python terminal: {sorted(py_terminal)}\n"
            f"  TS terminal:     {sorted(ts_terminal)}",
        )

    def test_failed_is_terminal_in_both(self):
        self.assertEqual(PY_WRP_ADJACENCY_MATRIX.get("FAILED", None), set())
        self.assertEqual(extract_ts_wrp_adjacency().get("FAILED", None), set())


class TestCascadeTransitionMatrixAlignment(unittest.TestCase):
    """Cascade's WorkRequestState TRANSITION_MATRIX must align with
    TS receipts.ts ALLOWED transitions.

    Cascade states (WorkRequestState): PROPOSED, PLANNING, PENDING,
    IMPLEMENTING, REVIEW, COMPLETED, FAILED, CANCELLED

    TS ALLOWED receipt types: PLAN_CREATE, IMPLEMENTATION, REVIEW_PASS,
    REVIEW_REJECT, BLOCK, PLANNING, HOLD, REVIEW, CRITIQUE, ...
    """

    @classmethod
    def setUpClass(cls):
        cls.ts_allowed = extract_ts_allowed_transitions()
        cls.cascade_states = {s.value for s in CascadeWRState}

    def test_cascade_states_exist_in_allowed(self):
        """Cascade state names that overlap with TS ALLOWED keys.

        Not all cascade states have direct TS equivalents (PROPOSED, PENDING).
        This test verifies the overlap is consistent.
        """
        # Cascade states that ARE receipt types: PLANNING, IMPLEMENTING,
        # REVIEW, COMPLETED, FAILED, CANCELLED.
        # Direct overlap: PLANNING, IMPLEMENTING, REVIEW, CANCELLED
        overlap = self.cascade_states & set(self.ts_allowed.keys())
        # Should have at least PLANNING, REVIEW, CANCELLED
        expected_overlap = {"PLANNING", "REVIEW", "CANCELLED"}
        self.assertTrue(
            expected_overlap <= overlap,
            f"Cascade → TS overlap missing: {sorted(expected_overlap - overlap)}",
        )

    def test_allowed_has_all_cascade_receipt_types(self):
        """TS ALLOWED should contain all receipt types cascade emits.

        Cascade issues: PLANNING, PLAN_CREATE, IMPLEMENTATION, REVIEW_PASS,
        REVIEW_REJECT, BLOCK, REVIEW, CRITIQUE, CRITIQUE_PASS,
        CRITIQUE_REJECT, PLAN_BLOCK, CANCELLED, ABANDONED, API_LIMIT.
        """
        cascade_receipts = {
            "PLANNING", "PLAN_CREATE", "IMPLEMENTATION", "REVIEW_PASS",
            "REVIEW_REJECT", "BLOCK", "REVIEW", "CRITIQUE", "CRITIQUE_PASS",
            "CRITIQUE_REJECT", "PLAN_BLOCK", "CANCELLED", "ABANDONED",
            "API_LIMIT",
        }
        missing = cascade_receipts - set(self.ts_allowed.keys())
        self.assertEqual(
            missing, set(),
            f"Cascade receipt types absent from ALLOWED keys: "
            f"{sorted(missing)}",
        )

    def test_proposed_not_in_allowed(self):
        """PROPOSED is a lifecycle pre-receipt state, not in ALLOWED."""
        self.assertNotIn("PROPOSED", self.ts_allowed)

    def test_pending_not_in_allowed(self):
        """PENDING is an intermediate cascade state, not in ALLOWED."""
        self.assertNotIn("PENDING", self.ts_allowed)


# ══════════════════════════════════════════════════════════════════════
# Section 5: WRP kernel engine state machine alignment
# ══════════════════════════════════════════════════════════════════════

class TestWrpKernelEngineAlignment(unittest.TestCase):
    """The conduit wrp_kernel/engine.py WRP_ADJACENCY_MATRIX must match
    the nexus_core/wrp/states.py canonical matrix.

    These are two Python copies of the same state machine — drift between
    them would mean the kernel engine accepts different transitions than
    the canonical definition.
    """

    @classmethod
    def setUpClass(cls):
        cls.canonical = PY_WRP_ADJACENCY_MATRIX

        # Import the kernel engine's WRP_ADJACENCY_MATRIX
        conduit_dir = os.path.join(NEXUS_ROOT, "python", "conduit")
        sys.path.insert(0, conduit_dir)
        try:
            from wrp_kernel.engine import (
                WRP_ADJACENCY_MATRIX as KERNEL_WRP_ADJACENCY_MATRIX,
            )
        except ImportError:
            cls.kernel_matrix = None
            return
        cls.kernel_matrix = KERNEL_WRP_ADJACENCY_MATRIX

    def test_kernel_engine_importable(self):
        """Ensure the kernel engine module is importable."""
        self.assertIsNotNone(
            self.kernel_matrix,
            "Could not import wrp_kernel.engine.WRP_ADJACENCY_MATRIX",
        )

    def test_kernel_matrix_has_same_states(self):
        if self.kernel_matrix is None:
            self.skipTest("kernel engine not importable")
        py_states = set(self.canonical.keys())
        kernel_states = set(self.kernel_matrix.keys())
        self.assertEqual(
            py_states, kernel_states,
            f"State mismatch:\n  nexus_core only: {sorted(py_states - kernel_states)}\n"
            f"  kernel only: {sorted(kernel_states - py_states)}",
        )

    def test_kernel_matrix_has_same_transitions(self):
        if self.kernel_matrix is None:
            self.skipTest("kernel engine not importable")
        mismatches = []
        for state in self.canonical:
            py_targets = self.canonical.get(state, set())
            kernel_targets = self.kernel_matrix.get(state, set())
            if py_targets != kernel_targets:
                mismatches.append(
                    f"  {state}: canonical={sorted(py_targets)} "
                    f"kernel={sorted(kernel_targets)}"
                )
        self.assertEqual(
            len(mismatches), 0,
            f"Transition mismatches:\n" + "\n".join(mismatches),
        )


if __name__ == "__main__":
    unittest.main()
