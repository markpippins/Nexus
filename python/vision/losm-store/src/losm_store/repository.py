from typing import Dict, Any, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import NoResultFound

from losm_store.models import PlanningTask, Artifact


def create_work_request(
    db: Session,
    intent: str,
    constraints: Optional[Dict[str, Any]] = None,
    priority: int = 5,
    context_data: Optional[Dict[str, Any]] = None
) -> PlanningTask:
    wr = PlanningTask(
        intent=intent,
        constraints=constraints,
        priority=priority,
        context_data=context_data
    )
    db.add(wr)
    db.commit()
    db.refresh(wr)
    return wr


def get_work_request(db: Session, wr_id: int) -> PlanningTask:
    wr = db.get(PlanningTask, wr_id)
    if wr is None:
        raise NoResultFound(f"PlanningTask id={wr_id} not found")
    return wr


def list_work_requests(db: Session, skip: int = 0, limit: int = 100) -> List[PlanningTask]:
    return db.query(PlanningTask).offset(skip).limit(limit).all()


def get_artifacts_by_wr(db: Session, wr_id: str) -> List[Artifact]:
    return db.query(Artifact).filter(Artifact.wr_id == wr_id).all()


def get_artifact_lineage(db: Session, artifact_id: str) -> List[Artifact]:
    lineage = []
    current_id = artifact_id
    while current_id:
        artifact = db.query(Artifact).filter(Artifact.artifact_id == current_id).first()
        if not artifact:
            break
        lineage.append(artifact)
        current_id = artifact.parent_artifact_id
    return lineage


# ── Branch CRUD ──────────────────────────────────────────────────────────────


def create_branch(
    db: Session,
    wr_id: str,
    label: Optional[str] = None,
    parent_branch_id: Optional[str] = None,
    fork_point: Optional[str] = None,
) -> Any:
    from losm_store.models import Branch
    branch = Branch(
        wr_id=wr_id,
        label=label,
        parent_branch_id=parent_branch_id,
        fork_point=fork_point,
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


def get_branch(db: Session, branch_id: str) -> Any:
    from losm_store.models import Branch
    return db.query(Branch).filter(Branch.branch_id == branch_id).first()


def get_branches_by_wr_id(db: Session, wr_id: str) -> list:
    from losm_store.models import Branch
    return db.query(Branch).filter(Branch.wr_id == wr_id).order_by(Branch.created_at).all()


def update_branch_score(db: Session, branch_id: str, score: float) -> Any:
    from losm_store.models import Branch
    from datetime import datetime
    branch = get_branch(db, branch_id)
    if branch:
        branch.score = score
        branch.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(branch)
    return branch


def merge_branch(db: Session, branch_id: str, merge_strategy: str = "select_best") -> Any:
    from losm_store.models import Branch
    from datetime import datetime
    branch = get_branch(db, branch_id)
    if branch:
        branch.status = "merged"
        branch.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(branch)
    return branch


def discard_branch(db: Session, branch_id: str) -> Any:
    from losm_store.models import Branch
    from datetime import datetime
    branch = get_branch(db, branch_id)
    if branch:
        branch.status = "discarded"
        branch.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(branch)
    return branch


def create_branch_artifact(
    db: Session,
    branch_id: str,
    wr_id: str,
    artifact_type: str,
    content: str,
    parent_artifact_id: Optional[str] = None,
    score: Optional[float] = None,
) -> Any:
    from losm_store.models import BranchArtifact
    artifact = BranchArtifact(
        branch_id=branch_id,
        wr_id=wr_id,
        artifact_type=artifact_type,
        content=content,
        parent_artifact_id=parent_artifact_id,
        score=score,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def get_branch_artifacts(db: Session, branch_id: str) -> list:
    from losm_store.models import BranchArtifact
    return db.query(BranchArtifact).filter(BranchArtifact.branch_id == branch_id).order_by(BranchArtifact.created_at).all()


__all__ = [
    "create_work_request", "get_work_request", "list_work_requests",
    "get_artifacts_by_wr", "get_artifact_lineage",
    "create_branch", "get_branch", "get_branches_by_wr_id",
    "update_branch_score", "merge_branch", "discard_branch",
    "create_branch_artifact", "get_branch_artifacts",
]
