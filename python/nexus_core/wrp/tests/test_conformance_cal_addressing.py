"""
wr-conf-011: CAL addressing conformance — the cherry-picked nbk P5 port,
guarded against source drift.

Dependency-map thread (1a07a098) open question Q2 asked whether nbk's CAL
addressing + lease scheduling should be folded into nexus_core. The lease
half was already superseded by the canonical role-lease dispenser
(POST /api/role-leases/consume); the CAL half is the one genuinely novel nbk
primitive, so it was cherry-picked into `nexus_core/wrp/addressing.py` as a
zero-dep module — same port pattern as `identity.py`.

Tested invariants:
  AC1 — Byte parity with the nbk source: make_address()/parse_address()/
        content_hash() agree exactly with nbk.core on multiple vectors
        (different realms/graphs/trajectories/nodes, unicode, version
        overrides). Guards the port against silent source drift.

  NOTE (Q2 expiry): the AC1 parity guard deliberately couples wr-conf-011
  to nbk's continued existence — `nbk_core._content_hash` is private-name
  access, and `test_nbk_guard_is_armed` hard-fails if nbk becomes
  unimportable. This is intentional: when Q2 resolves (nbk archived/folded),
  re-anchor AC1 parity to committed golden vectors and remove the
  `test_nbk_guard_is_armed` assertion — keep the format-contract tests.
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

# The port source — nbk.core must be importable for the parity guard. It is
# pure stdlib, so this is safe everywhere.
try:
    import nbk.core as nbk_core                              # noqa: E402
    NBK_AVAILABLE = True
except ImportError:
    nbk_core = None
    NBK_AVAILABLE = False

LOCATION_VECTORS = [
    ("dev", "my-pipeline", "t0", "transform"),
    ("dev", "my-pipeline", "t0", "extract"),
    ("prod", "wrp-kernel", "t1", "execute"),
    ("stage", "vision-stack", "t0", "validate"),
    ("dev", "unicode-graph", "t2", "éà"),
]


class TestAc1ParityWithNbkSource(unittest.TestCase):
    """AC1 — the port must agree byte-for-byte with the nbk source."""

    @unittest.skipUnless(NBK_AVAILABLE, "nbk.core not importable — parity guard skipped")
    def test_make_address_matches_nbk(self):
        for i, (realm, graph, traj, node) in enumerate(LOCATION_VECTORS):
            with self.subTest(vector=i):
                self.assertEqual(
                    make_address(realm, graph, traj, node),
                    nbk_core.make_address(realm, graph, traj, node),
                )

    @unittest.skipUnless(NBK_AVAILABLE, "nbk.core not importable — parity guard skipped")
    def test_make_address_explicit_version_matches_nbk(self):
        # Exercise the `version or content_hash(...)` fallback branch against
        # the source — the default-version vectors above do not cover it.
        for i, (realm, graph, traj, node) in enumerate(LOCATION_VECTORS):
            with self.subTest(vector=i):
                self.assertEqual(
                    make_address(realm, graph, traj, node, version="fixed-v1"),
                    nbk_core.make_address(realm, graph, traj, node, version="fixed-v1"),
                )

    @unittest.skipUnless(NBK_AVAILABLE, "nbk.core not importable — parity guard skipped")
    def test_parse_address_matches_nbk(self):
        for i, (realm, graph, traj, node) in enumerate(LOCATION_VECTORS):
            addr = make_address(realm, graph, traj, node)
            with self.subTest(vector=i):
                self.assertEqual(
                    parse_address(addr),
                    nbk_core.parse_address(addr),
                )

    @unittest.skipUnless(NBK_AVAILABLE, "nbk.core not importable — parity guard skipped")
    def test_content_hash_matches_nbk(self):
        cases = [
            ("a", "b", "c"),
            ("dev/my-pipeline/t0/transform",),
            ("", "", "", ""),
        ]
        for i, parts in enumerate(cases):
            with self.subTest(case=i):
                self.assertEqual(content_hash(*parts),
                                 nbk_core._content_hash(*parts))

    def test_nbk_guard_is_armed(self):
        # The whole point of AC1 is drift protection — if nbk.core ever stops
        # being importable this must be visible, not silently skipped forever.
        self.assertTrue(NBK_AVAILABLE,
                        "nbk.core must remain importable for the parity guard")


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
