"""
wr-conf-011: CAL addressing conformance — the cherry-picked nbk P5 port,
guarded against drift.

Dependency-map thread (1a07a098) open question Q2 asked whether nbk's CAL
addressing + lease scheduling should be folded into nexus_core. The lease
half was already superseded by the canonical role-lease dispenser
(POST /api/role-leases/consume); the CAL half is the one genuinely novel nbk
primitive, so it was cherry-picked into `nexus_core/wrp/addressing.py` as a
zero-dep module — same port pattern as `identity.py`.

Q2 RESOLVED (2026-08-10): nbk is archived. Per the original Q2-expiry note,
AC1 parity against the live nbk source has been RE-ANCHORED to committed
golden vectors (values captured from the port before the archive), and the
`test_nbk_guard_is_armed` assertion removed — the format-contract tests are
kept as-is. The golden vectors below are the frozen reference; the archived
nbk source (`python/_archived/nbk`) is no longer required for this suite.

Tested invariants:
  AC1 — Golden vectors: make_address()/parse_address()/content_hash() agree
        exactly with the committed golden values captured from nbk.core
        before the archive (unicode + explicit-version vectors included).
        Guards the port against silent drift without any nbk dependency.
  AC2 — Format contract: cal:// prefix, 5 components, default version is a
        12-hex content hash of the location path.
  AC3 — Round-trip: parse(make_address(...)) recovers all components;
        parse() returns None for non-cal:// and too-short addresses.
  AC4 — Determinism + content-addressing: same location -> same address;
        any path change -> different address; explicit version wins.

Deterministic and LLM-free. No binaries, no DB — pure functions.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_cal_addressing.py -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from nexus_core.wrp.addressing import (                             # noqa: E402
    content_hash,
    make_address,
    parse_address,
)

LOCATION_VECTORS = [
    ("dev", "my-pipeline", "t0", "transform"),
    ("dev", "my-pipeline", "t0", "extract"),
    ("prod", "wrp-kernel", "t1", "execute"),
    ("stage", "vision-stack", "t0", "validate"),
    ("dev", "unicode-graph", "t2", "éà"),
]

# Golden values captured from the port (== nbk.core parity) at archive time
# (2026-08-10). These are the frozen reference now that nbk is archived.
GOLDEN_ADDRESSES = [
    "cal://dev/my-pipeline/t0/transform/6400f9c2c7c8",
    "cal://dev/my-pipeline/t0/extract/ea4933c7ac85",
    "cal://prod/wrp-kernel/t1/execute/f3fbdcf3ced3",
    "cal://stage/vision-stack/t0/validate/07e7e78f9479",
    "cal://dev/unicode-graph/t2/éà/662d5fd8e332",
]

GOLDEN_CONTENT_HASHES = {
    ("a", "b", "c"): "a52dd81bfd5e",
    ("dev/my-pipeline/t0/transform",): "6400f9c2c7c8",
    ("", "", "", ""): "be5be69f55e9",
}


class TestAc1GoldenVectors(unittest.TestCase):
    """AC1 — golden vector parity (frozen at archive; no nbk dependency)."""

    def test_make_address_golden(self):
        for i, (realm, graph, traj, node) in enumerate(LOCATION_VECTORS):
            with self.subTest(vector=i):
                self.assertEqual(
                    make_address(realm, graph, traj, node),
                    GOLDEN_ADDRESSES[i],
                )

    def test_content_hash_golden(self):
        for parts, expected in GOLDEN_CONTENT_HASHES.items():
            with self.subTest(parts=parts):
                self.assertEqual(content_hash(*parts), expected)


class TestAc2FormatContract(unittest.TestCase):
    """AC2 — the CAL address format is stable."""

    def test_cal_prefix(self):
        for realm, graph, traj, node in LOCATION_VECTORS:
            self.assertTrue(make_address(realm, graph, traj, node).startswith("cal://"))

    def test_five_components(self):
        addr = make_address("dev", "g", "t0", "n1")
        parts = addr[len("cal://"):].split("/")
        self.assertEqual(len(parts), 5)

    def test_default_version_is_12_hex_hash(self):
        addr = make_address("dev", "g", "t0", "n1")
        version = addr.rsplit("/", 1)[1]
        self.assertEqual(len(version), 12)
        int(version, 16)  # raises if not hex

    def test_version_matches_location_content_hash(self):
        addr = make_address("dev", "g", "t0", "n1")
        self.assertEqual(addr,
                         f"cal://dev/g/t0/n1/{content_hash('dev/g/t0/n1')}")


class TestAc3RoundTrip(unittest.TestCase):
    """AC3 — parse(make_address(...)) is lossless; malformed -> None."""

    def test_round_trip_all_components(self):
        for realm, graph, traj, node in LOCATION_VECTORS:
            addr = make_address(realm, graph, traj, node)
            parts = parse_address(addr)
            self.assertEqual(parts["realm"], realm)
            self.assertEqual(parts["graph"], graph)
            self.assertEqual(parts["trajectory"], traj)
            self.assertEqual(parts["node_id"], node)
            self.assertEqual(len(parts["version"]), 12)

    def test_explicit_version_round_trips(self):
        addr = make_address("dev", "g", "t0", "n1", version="abc123")
        parts = parse_address(addr)
        self.assertEqual(parts["version"], "abc123")

    def test_missing_version_parses_to_empty(self):
        # parse() of a 4-component address yields version ""
        self.assertEqual(parse_address("cal://a/b/c/d")["version"], "")

    def test_non_cal_returns_none(self):
        self.assertIsNone(parse_address("https://a/b/c/d/e"))
        self.assertIsNone(parse_address(""))
        self.assertIsNone(parse_address("cal://only3parts"))

    def test_too_short_returns_none(self):
        self.assertIsNone(parse_address("cal://a/b"))


class TestAc4DeterminismAndContentAddressing(unittest.TestCase):
    """AC4 — addresses are deterministic and content-addressed."""

    def test_same_location_same_address(self):
        a = make_address("dev", "g", "t0", "n1")
        b = make_address("dev", "g", "t0", "n1")
        self.assertEqual(a, b)

    def test_any_path_change_changes_address(self):
        base = make_address("dev", "g", "t0", "n1")
        self.assertNotEqual(base, make_address("prod", "g", "t0", "n1"))
        self.assertNotEqual(base, make_address("dev", "g2", "t0", "n1"))
        self.assertNotEqual(base, make_address("dev", "g", "t1", "n1"))
        self.assertNotEqual(base, make_address("dev", "g", "t0", "n2"))

    def test_explicit_version_wins(self):
        addr = make_address("dev", "g", "t0", "n1", version="fixed")
        self.assertEqual(addr, "cal://dev/g/t0/n1/fixed")


if __name__ == "__main__":
    unittest.main()
