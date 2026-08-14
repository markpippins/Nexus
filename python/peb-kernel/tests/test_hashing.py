from __future__ import annotations

from uuid import uuid4

from peb_kernel.domain import PebDecision, PebState, PebStateHash
from peb_kernel.hashing import PebHashService


def state(key: str, checksum: str) -> PebState:
    return PebState(key=key, content={}, checksum=checksum, id=uuid4())


def test_empty_root_matches_sha256_empty_sentinel():
    result = PebHashService().compute_system_hash([], None)
    assert result == PebStateHash.compute("empty")


def test_state_order_does_not_change_merkle_root():
    service = PebHashService()
    first = [state("invariants", "c1"), state("architecture", "c2"), state("trajectory", "c3")]
    second = [first[2], first[0], first[1]]
    assert service.compute_system_hash(first, None) == service.compute_system_hash(second, None)


def test_state_and_decision_changes_are_input_sensitive():
    service = PebHashService()
    one = service.compute_system_hash([state("invariants", "c1")], None)
    two = service.compute_system_hash([state("invariants", "c2")], None)
    decision = PebDecision(title="decision", author_id="engineer", transaction_id=uuid4(), after_hash="a" * 64)
    three = service.compute_system_hash([state("invariants", "c1")], decision)
    assert len({one.value, two.value, three.value}) == 3


def test_odd_merkle_leaf_is_promoted_without_rehashing():
    service = PebHashService()
    states = [state("a", "1"), state("b", "2"), state("c", "3")]
    result = service.compute_system_hash(states, None)
    leaves = [PebStateHash.compute(f"{item.key}:{item.checksum}").value for item in states]
    parent = PebStateHash.compute(leaves[0] + leaves[1]).value
    expected = PebStateHash(PebStateHash.compute(parent + leaves[2]).value)
    assert result == expected
