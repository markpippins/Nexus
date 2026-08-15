"""Deterministic PEB state and decision-chain hashing."""

from __future__ import annotations

from typing import Iterable

from .domain import PebDecision, PebState, PebStateHash


class PebHashService:
    """Computes the same sorted-leaf Merkle root described by the Java kernel."""

    EMPTY_ROOT_INPUT = "empty"

    def compute_system_hash(
        self,
        states: Iterable[PebState] | None,
        latest_decision: PebDecision | None,
    ) -> PebStateHash:
        state_list = list(states or [])
        if not state_list:
            merkle_root = PebStateHash.compute(self.EMPTY_ROOT_INPUT).value
        else:
            ordered = sorted(state_list, key=lambda state: (state.key is not None, state.key or ""))
            level = [
                PebStateHash.compute(f"{state.key or ''}:{state.checksum or ''}").value
                for state in ordered
            ]
            while len(level) > 1:
                next_level: list[str] = []
                for index in range(0, len(level), 2):
                    if index + 1 < len(level):
                        next_level.append(PebStateHash.compute(level[index] + level[index + 1]).value)
                    else:
                        next_level.append(level[index])
                level = next_level
            merkle_root = level[0]

        if latest_decision is not None and latest_decision.after_hash is not None:
            merkle_root = PebStateHash.compute(f"{merkle_root}:{latest_decision.after_hash}").value
        return PebStateHash(merkle_root)
