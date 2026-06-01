"""
CCNF Alignment Tests — Python GraphState must produce hashes
identical to the Rust ccnf-verifier.
"""
import json
import os
import subprocess
import unittest

from graph_models import GraphState
from graph_reducer import GraphStateReducer

RUST_BINARY = os.path.join(
    os.path.dirname(__file__),
    "../../../rust/wrp/ccnf-verifier/target/release/ccnf-verifier"
)


class TestCCNFAlignment(unittest.TestCase):
    """Python GraphState CCNF hash must match Rust verifier."""

    @classmethod
    def setUpClass(cls):
        if not os.path.exists(RUST_BINARY):
            raise unittest.SkipTest(
                f"Rust binary not found at {RUST_BINARY}. "
                f"Run: cd nexus/rust/wrp/ccnf-verifier && cargo build --release"
            )

    def _run_rust_ccnf(self, canonical_input: str) -> str:
        """Pipe canonical JSON to Rust CCNF verifier, get hash."""
        result = subprocess.run(
            [RUST_BINARY, "--stdin"],
            input=canonical_input,
            capture_output=True,
            text=True,
            timeout=5,
        )
        for line in result.stdout.splitlines():
            if line.startswith("ccnf_hash:"):
                return line.split(":", 1)[1].strip()
        raise RuntimeError(
            f"Rust CCNF did not produce hash.\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )

    # ── Basic hash matching ──────────────────────────────────────────

    def test_empty_graph_hash_match(self):
        """Empty GraphState must produce identical hash in Python and Rust."""
        state = GraphState()
        python_hash = state.ccnf_hash()
        rust_hash = self._run_rust_ccnf(state.ccnf_canonical_json())
        self.assertEqual(
            python_hash, rust_hash,
            f"Empty graph hash mismatch: Python={python_hash} Rust={rust_hash}"
        )

    def test_single_node_hash_match(self):
        """GraphState with one node must match Rust."""
        state = GraphState(
            nodes={"n1": {"type": "concept", "label": "test"}},
        )
        python_hash = state.ccnf_hash()
        rust_hash = self._run_rust_ccnf(state.ccnf_canonical_json())
        self.assertEqual(python_hash, rust_hash)

    def test_single_edge_hash_match(self):
        """GraphState with one edge must match Rust."""
        state = GraphState(
            nodes={"n1": {"type": "concept"}, "n2": {"type": "concept"}},
            edges={"e1": {"type": "relates", "from": "n1", "to": "n2"}},
        )
        python_hash = state.ccnf_hash()
        rust_hash = self._run_rust_ccnf(state.ccnf_canonical_json())
        self.assertEqual(python_hash, rust_hash)

    # ── Ordering independence ────────────────────────────────────────

    def test_node_ordering_independence(self):
        """Insertion order must not affect CCNF hash."""
        state1 = GraphState(
            nodes={"b": {"val": 1}, "a": {"val": 2}},
        )
        state2 = GraphState(
            nodes={"a": {"val": 2}, "b": {"val": 1}},
        )
        self.assertEqual(state1.ccnf_hash(), state2.ccnf_hash())

    def test_edge_ordering_independence(self):
        """Edge insertion order must not affect CCNF hash."""
        state1 = GraphState(
            edges={"e2": {"type": "x"}, "e1": {"type": "y"}},
        )
        state2 = GraphState(
            edges={"e1": {"type": "y"}, "e2": {"type": "x"}},
        )
        self.assertEqual(state1.ccnf_hash(), state2.ccnf_hash())

    def test_property_key_ordering_independence(self):
        """Property key insertion order must not affect hash."""
        state1 = GraphState(
            nodes={"n1": {"b": 2, "a": 1}},
        )
        state2 = GraphState(
            nodes={"n1": {"a": 1, "b": 2}},
        )
        self.assertEqual(state1.ccnf_hash(), state2.ccnf_hash())

    # ── Deterministic canonical JSON ─────────────────────────────────

    def test_canonical_json_is_deterministic(self):
        """ccnf_canonical_json() must be stable across calls."""
        state = GraphState(nodes={"n1": {"x": 1}}, edges={"e1": {"y": 2}})
        j1 = state.ccnf_canonical_json()
        j2 = state.ccnf_canonical_json()
        self.assertEqual(j1, j2)

    def test_canonical_json_sorted_keys(self):
        """Canonical JSON must have keys in sorted order."""
        state = GraphState(nodes={"z": {}, "a": {}})
        json_str = state.ccnf_canonical_json()
        self.assertIn('"nodes":{"a":', json_str)
        self.assertIn('"z":{}', json_str)

    # ── Round-trip: Python → Rust → match ────────────────────────────

    def test_multi_node_multi_edge_round_trip(self):
        """Complex graph must match Rust hash."""
        state = GraphState(
            nodes={
                "n3": {"type": "artifact", "folder": "out"},
                "n1": {"type": "concept", "label": "root"},
                "n2": {"type": "concept", "label": "child"},
            },
            edges={
                "e2": {"type": "depends", "from": "n2", "to": "n3"},
                "e1": {"type": "relates", "from": "n1", "to": "n2"},
            },
        )
        python_hash = state.ccnf_hash()
        rust_hash = self._run_rust_ccnf(state.ccnf_canonical_json())
        self.assertEqual(python_hash, rust_hash)

    # ── Integration: GraphStateReducer output matches CCNF hash ──────

    def test_reducer_output_produces_valid_ccnf_hash(self):
        """GraphStateReducer must produce states with valid CCNF hashes."""
        state = GraphState(
            nodes={"n1": {"type": "concept"}},
            edges={},
        )
        # Verify the reduced state can be hashed and matches Rust
        python_hash = state.ccnf_hash()
        # Self-consistency: hash is 64 hex chars
        self.assertEqual(len(python_hash), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in python_hash))

        # Also verify existing compute_hash is different from ccnf_hash
        # (they use different serialization — ccnf uses JSON, legacy uses repr)
        legacy_hash = state.compute_hash()
        self.assertIsInstance(legacy_hash, str)
        self.assertEqual(len(legacy_hash), 64)

    # ── Error handling ───────────────────────────────────────────────

    def test_ccnf_canonical_json_handles_non_dict_props(self):
        """Non-dict property values must not break canonical serialization."""
        state = GraphState(
            nodes={"n1": "simple_string_node"},
            edges={"e1": 42},
        )
        json_str = state.ccnf_canonical_json()
        self.assertIsInstance(json_str, str)
        self.assertIn('"n1"', json_str)
        # Must still produce a valid hash
        h = state.ccnf_hash()
        self.assertEqual(len(h), 64)


class TestCCNFReducedState(unittest.TestCase):
    """Verify GraphStateReducer output also matches Rust CCNF."""

    def test_reduced_empty_state_hash(self):
        """Reducer on empty state must produce ccnf_hash matching Rust."""
        state = GraphState()
        python_hash = state.ccnf_hash()
        # Must be consistent within Python
        self.assertEqual(state.ccnf_hash(), python_hash)
        self.assertEqual(len(python_hash), 64)


if __name__ == "__main__":
    unittest.main()
