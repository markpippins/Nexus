"""
Identity matching logic — strong/medium/weak match heuristics for
Voyager file observations against the canonical asset layer.

Decision 16a71e26 Q2/Q3: NEVER auto-merge. Strong matches link to
existing canonical_asset; medium/weak become asset_identity_claim
rows with confidence values.
"""

import hashlib
import logging
from typing import Optional

from . import db

_log = logging.getLogger("voyager-adapter.identity")

# ── Confidence thresholds ───────────────────────────────────────────

STRONG_THRESHOLD = 0.9   # content_hash + physical identity match
MEDIUM_THRESHOLD = 0.5   # physical identity match only (same device+inode)
WEAK_THRESHOLD = 0.3     # path-only match


def match_observation(
    *,
    raw_location: str,
    raw_hash: Optional[str] = None,
    device_id: Optional[str] = None,
    inode: Optional[str] = None,
) -> dict:
    """
    Attempt to match an observation against the canonical asset layer.

    Returns a dict with:
      - match_type: 'strong' | 'medium' | 'weak' | 'none'
      - confidence: 0.0–1.0
      - asset_id: canonical_asset UUID (strong match only)
      - revision_id: asset_revision UUID (strong match only, for re-linking)
      - claim_type: for medium/weak matches
      - basis: human-readable explanation
    """
    # ── Strong match: content_hash + physical identity ──────────────
    if raw_hash and device_id and inode:
        asset = db.find_asset_by_hash(raw_hash)
        phys = db.find_asset_by_physical_id(device_id, inode)
        if asset and phys and asset["id"] == phys["id"]:
            _log.info("Strong match: content_hash=%s device=%s inode=%s → asset=%s",
                      raw_hash[:16], device_id, inode, asset["id"])
            return {
                "match_type": "strong",
                "confidence": 1.0,
                "asset_id": asset["id"],
                "revision_id": asset.get("revision_id"),
                "claim_type": None,
                "basis": f"content_hash={raw_hash[:16]} + device_id={device_id} + inode={inode}",
            }

    # ── Strong match: content_hash only ─────────────────────────────
    if raw_hash:
        asset = db.find_asset_by_hash(raw_hash)
        if asset:
            _log.info("Strong match (hash): content_hash=%s → asset=%s",
                      raw_hash[:16], asset["id"])
            return {
                "match_type": "strong",
                "confidence": 0.95,
                "asset_id": asset["id"],
                "revision_id": asset.get("revision_id"),
                "claim_type": None,
                "basis": f"content_hash={raw_hash[:16]}",
            }

    # ── Medium match: physical identity (same device+inode, different hash) ─
    if device_id and inode:
        phys = db.find_asset_by_physical_id(device_id, inode)
        if phys:
            _log.info("Medium match: device=%s inode=%s → asset=%s (hash differs)",
                      device_id, inode, phys["id"])
            return {
                "match_type": "medium",
                "confidence": 0.7,
                "asset_id": None,
                "claim_type": "physical_match",
                "basis": f"device_id={device_id} + inode={inode} (hash differs)",
            }

    # ── Weak match: path suffix ─────────────────────────────────────
    if raw_location:
        # Future: path heuristic matching against known asset paths
        pass

    _log.debug("No match for %s", raw_location)
    return {
        "match_type": "none",
        "confidence": 0.0,
        "asset_id": None,
        "revision_id": None,
        "claim_type": None,
        "basis": "no match",
    }
