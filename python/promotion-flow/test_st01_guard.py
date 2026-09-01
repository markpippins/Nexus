#!/usr/bin/env python3
"""Tests for the ST.01 duplicate-emission guard (wave 6).

Covers deterministic set identity, the open-batch covering-set check, and the
idempotent no-op when an open batch already covers a candidate set.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

# Isolate state under a temp dir.
_TMP = tempfile.mkdtemp(prefix="promotion-st01-")
os.environ["PROMOTION_STATE_DIR"] = _TMP

import promotion_common as pc  # noqa: E402
from stage1_shortlist import (  # noqa: E402
    EXCLUDED_STATUS,
    candidate_set_identity,  # re-exported for convenience
)


def _write_manifest(batch_id, candidates, executed=False):
    m = {
        "batch_id": batch_id,
        "created_at": "2026-09-01T00:00:00+00:00",
        "candidates": [{"id": c, "title": c, "readiness": 0.7} for c in candidates],
        "verdicts_seen": [],
    }
    if executed:
        m["executed"] = True
    path = Path(_TMP) / f"batch-{batch_id}.json"
    path.write_text(json.dumps(m))
    return m


class TestSetIdentity(unittest.TestCase):
    def test_deterministic_and_order_independent(self):
        a = pc.candidate_set_identity([{"id": "x"}, {"id": "y"}, {"id": "z"}])
        b = pc.candidate_set_identity([{"id": "z"}, {"id": "x"}, {"id": "y"}])
        self.assertEqual(a, b)
        self.assertEqual(len(a), 64)  # sha256 hex

    def test_different_sets_differ(self):
        a = pc.candidate_set_identity([{"id": "x"}, {"id": "y"}])
        b = pc.candidate_set_identity([{"id": "x"}, {"id": "z"}])
        self.assertNotEqual(a, b)


class TestOpenBatchCoveringSet(unittest.TestCase):
    def setUp(self):
        # Patch STATE_DIR directly (order-independent; module constant is
        # captured at import time, so the env var may be stale under parallel
        # test imports). Fresh state dir per test.
        self._orig_state = pc.STATE_DIR
        pc.STATE_DIR = _TMP
        for p in Path(_TMP).glob("batch-*.json"):
            p.unlink()

    def tearDown(self):
        pc.STATE_DIR = self._orig_state

    def test_returns_open_batch_with_matching_set(self):
        _write_manifest("aaaa", ["a", "b", "c"])
        ident = pc.candidate_set_identity([{"id": "a"}, {"id": "b"}, {"id": "c"}])
        hit = pc.open_batch_covering_set(ident)
        self.assertIsNotNone(hit)
        self.assertEqual(hit["batch_id"], "aaaa")

    def test_ignores_executed_batch(self):
        # A fully-drained batch is a lifecycle transition: it no longer blocks
        # a fresh emission of the same set.
        _write_manifest("bbbb", ["a", "b", "c"], executed=True)
        ident = pc.candidate_set_identity([{"id": "a"}, {"id": "b"}, {"id": "c"}])
        self.assertIsNone(pc.open_batch_covering_set(ident))

    def test_different_set_no_match(self):
        _write_manifest("cccc", ["a", "b", "c"])
        ident = pc.candidate_set_identity([{"id": "p"}, {"id": "q"}])
        self.assertIsNone(pc.open_batch_covering_set(ident))


class TestMarkSuperseded(unittest.TestCase):
    def test_append_only_no_row_rewrite(self):
        m = _write_manifest("dddd", ["a", "b"])
        original_candidates = [dict(c) for c in m["candidates"]]
        pc.mark_superseded(m, "aaaa", "duplicate")
        # Historical rows preserved verbatim.
        self.assertEqual(m["candidates"], original_candidates)
        self.assertEqual(m["superseded_by"], "aaaa")
        self.assertIn("superseded_at", m)
        self.assertIn("supersession_reason", m)


if __name__ == "__main__":
    unittest.main(verbosity=2)