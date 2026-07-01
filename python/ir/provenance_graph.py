"""ProvenanceGraph — auditable chain of PromotionReceipts.

Built from the receipt chain produced by the LeaseCompiler pipeline.
Traversable forward (event → lease) and backward (lease → events).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .promotion_receipt import PromotionReceipt


@dataclass(frozen=True)
class ProvenanceGraph:
    """An auditable chain of promotion receipts.

    Records every compilation step: which events became which projection,
    which intent graph, which prompt, which lease.
    """

    receipts: list[PromotionReceipt] = field(default_factory=list)

    @classmethod
    def from_receipts(cls, receipts: list[PromotionReceipt]) -> "ProvenanceGraph":
        return cls(receipts=list(receipts))

    def trace_backward(self, to_id: str) -> list[PromotionReceipt]:
        """Given a final artifact, reconstruct the full backward chain.

        Traces from the artifact back through each from_id → to_id link.
        Only matches receipts that *produced* the current artifact
        (to_id == current_id), not receipts that consumed it.
        """
        result: list[PromotionReceipt] = []
        current_id = to_id

        # Walk backward through receipts (reverse order)
        for receipt in reversed(self.receipts):
            if receipt.to_id == current_id:
                result.append(receipt)
                if receipt.from_id:
                    current_id = receipt.from_id

        return list(reversed(result))

    def trace_forward(self, from_id: str) -> list[PromotionReceipt]:
        """Given a source artifact, trace forward through all promotions."""
        result: list[PromotionReceipt] = []
        current_id = from_id

        for receipt in self.receipts:
            if receipt.from_id == current_id or (
                "," in receipt.from_id and current_id in receipt.from_id.split(",")
            ):
                result.append(receipt)
                current_id = receipt.to_id

        return result

    @property
    def stage_count(self) -> int:
        return len(self.receipts)

    def to_dict(self) -> dict:
        return {
            "receipts": [r.to_dict() for r in self.receipts],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ProvenanceGraph":
        return cls(
            receipts=[PromotionReceipt.from_dict(r) for r in d.get("receipts", [])],
        )
