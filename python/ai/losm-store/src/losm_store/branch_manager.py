"""Branch manager — thin orchestration over branch persistence."""

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from losm_store.repository import (
    create_branch,
    create_branch_artifact,
    discard_branch,
    get_branch,
    get_branch_artifacts,
    get_branches_by_wr_id,
    merge_branch,
    update_branch_score,
)


class BranchManager:
    def fork_state(
        self,
        db: Session,
        wr_id: str,
        label: str,
        fork_point: Optional[str] = None,
        parent_branch_id: Optional[str] = None,
    ) -> Any:
        return create_branch(
            db,
            wr_id=wr_id,
            label=label,
            parent_branch_id=parent_branch_id,
            fork_point=fork_point,
        )

    def add_artifact_to_branch(
        self,
        db: Session,
        branch_id: str,
        wr_id: str,
        artifact_type: str,
        content: str,
        parent_artifact_id: Optional[str] = None,
    ) -> Any:
        return create_branch_artifact(
            db,
            branch_id=branch_id,
            wr_id=wr_id,
            artifact_type=artifact_type,
            content=content,
            parent_artifact_id=parent_artifact_id,
        )

    def score_branch(self, db: Session, branch_id: str, score: float) -> Any:
        return update_branch_score(db, branch_id, score)

    def get_branch_info(self, db: Session, branch_id: str) -> Optional[Dict[str, Any]]:
        from losm_store.models import Branch
        branch = get_branch(db, branch_id)
        if not branch:
            return None
        artifacts = get_branch_artifacts(db, branch_id)
        return {
            "branch_id": branch.branch_id,
            "wr_id": branch.wr_id,
            "parent_branch_id": branch.parent_branch_id,
            "fork_point": branch.fork_point,
            "label": branch.label,
            "score": branch.score,
            "status": branch.status,
            "created_at": branch.created_at.isoformat() if hasattr(branch.created_at, "isoformat") else str(branch.created_at),
            "artifact_count": len(artifacts),
            "artifacts": [
                {
                    "artifact_id": a.artifact_id,
                    "artifact_type": a.artifact_type,
                    "score": a.score,
                    "created_at": a.created_at.isoformat() if hasattr(a.created_at, "isoformat") else str(a.created_at),
                }
                for a in artifacts
            ],
        }

    def list_branches(self, db: Session, wr_id: str) -> List[Dict[str, Any]]:
        branches = get_branches_by_wr_id(db, wr_id)
        return [
            {
                "branch_id": b.branch_id,
                "wr_id": b.wr_id,
                "parent_branch_id": b.parent_branch_id,
                "fork_point": b.fork_point,
                "label": b.label,
                "score": b.score,
                "status": b.status,
                "created_at": b.created_at.isoformat() if hasattr(b.created_at, "isoformat") else str(b.created_at),
            }
            for b in branches
        ]

    def select_best(self, db: Session, wr_id: str) -> Any:
        branches = get_branches_by_wr_id(db, wr_id)
        active = [b for b in branches if b.status == "active" and b.score is not None]
        if not active:
            return None
        return max(active, key=lambda b: b.score or 0)

    def discard(self, db: Session, branch_id: str) -> Any:
        return discard_branch(db, branch_id)

    def merge(self, db: Session, branch_id: str, strategy: str = "select_best") -> Any:
        return merge_branch(db, branch_id, strategy)


branch_manager = BranchManager()
