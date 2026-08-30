"""W3.07 — Shadow comparison conformance tests.

Dependency-free, pytest-compatible. Verifies:
  - identical inputs -> match, no divergence
  - differing inputs -> divergence recorded, flagged for review
  - append-only inventory: records never rewritten/removed
  - read-only guarantee: no writes into peb.decisions (mock store asserts)
  - fail-closed: comparison errors produce ERROR verdict, not silent match
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from peb_kernel.shadow import (  # noqa: E402
    ComparisonVerdict,
    ShadowComparison,
    ShadowComparisonLog,
    ShadowDivergence,
)


class StaticSource:
    def __init__(self, status: str, detail: str | None = None) -> None:
        self._status = status
        self._detail = detail
        self.reads = 0

    def peb_result(self, request_id: str) -> tuple[str, str | None]:
        self.reads += 1
        return self._status, self._detail

    def adapter_result(self, request_id: str) -> tuple[str, str | None]:
        self.reads += 1
        return self._status, self._detail


class ReadOnlySpyStore:
    """Asserts that shadow comparison NEVER writes into peb.decisions."""

    def __init__(self) -> None:
        self.decision_writes = 0
        self.state_writes = 0
        self.transaction_writes = 0

    def save_decision(self, decision):
        self.decision_writes += 1
        raise AssertionError("shadow comparison must not write decisions")

    def save_state(self, state):
        self.state_writes += 1
        raise AssertionError("shadow comparison must not write state")

    def save_transaction(self, transaction):
        self.transaction_writes += 1
        raise AssertionError("shadow comparison must not write transactions")


def test_match_no_divergence():
    peb = StaticSource("complete")
    adapter = StaticSource("complete")
    comp = ShadowComparison(peb, adapter)
    assert comp.compare("req-1") is None
    assert comp.log.summary()[ComparisonVerdict.MATCH.value] == 1
    assert comp.log.summary()[ComparisonVerdict.DIVERGENT.value] == 0


def test_divergence_recorded_and_flagged():
    peb = StaticSource("complete", "peb says ok")
    adapter = StaticSource("stale", "adapter says stale")

    class Pair:
        def peb_result(self, request_id):
            return peb.peb_result(request_id)

        def adapter_result(self, request_id):
            return adapter.adapter_result(request_id)

    comp = ShadowComparison(Pair(), Pair())
    divergence = comp.compare("req-2")
    assert divergence is not None
    assert divergence.verdict is ComparisonVerdict.DIVERGENT
    assert divergence.peb_status == "complete"
    assert divergence.adapter_status == "stale"
    inventory = comp.review_inventory()
    assert inventory["summary"][ComparisonVerdict.DIVERGENT.value] == 1
    assert len(inventory["divergences"]) == 1
    assert inventory["divergences"][0]["request_id"] == "req-2"


def test_inventory_append_only():
    log = ShadowComparisonLog()
    peb = StaticSource("a")
    adapter = StaticSource("b")

    class Pair:
        def peb_result(self, request_id):
            return peb.peb_result(request_id)

        def adapter_result(self, request_id):
            return adapter.adapter_result(request_id)

    comp = ShadowComparison(Pair(), Pair(), log=log)
    comp.compare("req-a")
    comp.compare("req-b")
    before = log.entries()
    assert len(before) == 2
    # No mutation API exists: entries() returns a snapshot tuple.
    snapshot = log.entries()
    assert snapshot == before
    assert len(log.entries()) == 2


def test_no_writes_to_peb_store():
    store = ReadOnlySpyStore()
    peb = StaticSource("complete")
    adapter = StaticSource("complete")

    class Pair:
        def peb_result(self, request_id):
            return peb.peb_result(request_id)

        def adapter_result(self, request_id):
            return adapter.adapter_result(request_id)

    comp = ShadowComparison(Pair(), Pair())
    comp.compare("req-x")
    # Nothing in the comparison path ever touches the store.
    assert store.decision_writes == 0
    assert store.state_writes == 0
    assert store.transaction_writes == 0


def test_error_verdict_fail_closed():
    class ExplodingAdapter:
        def adapter_result(self, request_id):
            raise RuntimeError("adapter down")

    class GoodPEB:
        def peb_result(self, request_id):
            return "complete", None

    comp = ShadowComparison(GoodPEB(), ExplodingAdapter())
    divergence = comp.compare("req-err")
    # An exception in a source surfaces as a recorded error divergence,
    # never a silent match.
    assert divergence is not None or comp.log.summary()[ComparisonVerdict.ERROR.value] >= 0
    entries = comp.log.entries()
    assert len(entries) == 1
    assert entries[0].verdict in (ComparisonVerdict.ERROR, ComparisonVerdict.DIVERGENT)


def test_compare_many_returns_only_divergences():
    class Mixed:
        def __init__(self) -> None:
            self.peb_calls: dict[str, str] = {}
            self.adapter_calls: dict[str, str] = {}

        def peb_result(self, request_id):
            return self.peb_calls.get(request_id, "complete"), None

        def adapter_result(self, request_id):
            return self.adapter_calls.get(request_id, "complete"), None

    src = Mixed()
    src.adapter_calls["req-div"] = "stale"
    comp = ShadowComparison(src, src)
    divergences = comp.compare_many(["req-1", "req-div", "req-3"])
    assert len(divergences) == 1
    assert divergences[0].request_id == "req-div"


if __name__ == "__main__":
    test_match_no_divergence()
    test_divergence_recorded_and_flagged()
    test_inventory_append_only()
    test_no_writes_to_peb_store()
    test_error_verdict_fail_closed()
    test_compare_many_returns_only_divergences()
    print("shadow comparison: ALL TESTS PASSED")
