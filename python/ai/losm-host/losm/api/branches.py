from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from losm_store.branch_manager import branch_manager
from losm_store.session import get_db

router = APIRouter(prefix="/branches", tags=["branches"])


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_branch(
    wr_id: str,
    label: Optional[str] = None,
    parent_branch_id: Optional[str] = None,
    fork_point: Optional[str] = None,
    db: Session = Depends(get_db),
):
    branch = branch_manager.fork_state(
        db, wr_id=wr_id, label=label, parent_branch_id=parent_branch_id, fork_point=fork_point
    )
    return {
        "branch_id": branch.branch_id,
        "wr_id": branch.wr_id,
        "parent_branch_id": branch.parent_branch_id,
        "fork_point": branch.fork_point,
        "label": branch.label,
        "score": branch.score,
        "status": branch.status,
        "created_at": branch.created_at.isoformat() if hasattr(branch.created_at, "isoformat") else str(branch.created_at),
    }


@router.post("/{branch_id}/fork", response_model=dict, status_code=status.HTTP_201_CREATED)
def fork_branch(branch_id: str, label: str, db: Session = Depends(get_db)):
    source = branch_manager.get_branch_info(db, branch_id)
    if not source:
        raise HTTPException(status_code=404, detail="Branch not found")
    branch = branch_manager.fork_state(
        db,
        wr_id=source["wr_id"],
        label=label,
        parent_branch_id=branch_id,
        fork_point=source.get("fork_point"),
    )
    return {
        "branch_id": branch.branch_id,
        "wr_id": branch.wr_id,
        "parent_branch_id": branch.parent_branch_id,
        "label": branch.label,
        "status": branch.status,
    }


@router.get("/{branch_id}", response_model=dict)
def get_branch_info(branch_id: str, db: Session = Depends(get_db)):
    info = branch_manager.get_branch_info(db, branch_id)
    if not info:
        raise HTTPException(status_code=404, detail="Branch not found")
    return info


@router.get("/wr/{wr_id}", response_model=List[dict])
def list_branches(wr_id: str, db: Session = Depends(get_db)):
    return branch_manager.list_branches(db, wr_id)


@router.post("/{branch_id}/score", response_model=dict)
def score_branch(branch_id: str, score: float, db: Session = Depends(get_db)):
    branch = branch_manager.score_branch(db, branch_id, score)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return {"branch_id": branch.branch_id, "score": branch.score}


@router.post("/{branch_id}/merge", response_model=dict)
def merge_branch(branch_id: str, strategy: str = "select_best", db: Session = Depends(get_db)):
    branch = branch_manager.merge(db, branch_id, strategy)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return {"branch_id": branch.branch_id, "status": branch.status}


@router.post("/{branch_id}/discard", response_model=dict)
def discard_branch_endpoint(branch_id: str, db: Session = Depends(get_db)):
    branch = branch_manager.discard(db, branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return {"branch_id": branch.branch_id, "status": branch.status}


@router.get("/wr/{wr_id}/best", response_model=dict)
def select_best_branch(wr_id: str, db: Session = Depends(get_db)):
    branch = branch_manager.select_best(db, wr_id)
    if not branch:
        raise HTTPException(status_code=404, detail="No scored branches found")
    return {
        "branch_id": branch.branch_id,
        "wr_id": branch.wr_id,
        "score": branch.score,
        "label": branch.label,
    }
