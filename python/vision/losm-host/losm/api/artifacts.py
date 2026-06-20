from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from losm_store.session import get_db
from losm_store.repository import get_artifacts_by_wr, get_artifact_lineage

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


@router.get("/wr/{wr_id}", response_model=List[dict])
def list_artifacts(wr_id: str, db: Session = Depends(get_db)):
    artifacts = get_artifacts_by_wr(db, wr_id)
    return [
        {
            "artifact_id": a.artifact_id,
            "type": a.type.value if hasattr(a.type, "value") else str(a.type),
            "content": a.content,
            "parent_artifact_id": a.parent_artifact_id,
            "confidence": a.confidence,
            "created_at": a.created_at.isoformat() if hasattr(a.created_at, "isoformat") else str(a.created_at),
        }
        for a in artifacts
    ]


@router.get("/{artifact_id}/lineage", response_model=List[dict])
def read_lineage(artifact_id: str, db: Session = Depends(get_db)):
    lineage = get_artifact_lineage(db, artifact_id)
    if not lineage:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return [
        {
            "artifact_id": a.artifact_id,
            "type": a.type.value if hasattr(a.type, "value") else str(a.type),
            "parent_artifact_id": a.parent_artifact_id,
            "created_at": a.created_at.isoformat() if hasattr(a.created_at, "isoformat") else str(a.created_at),
        }
        for a in lineage
    ]
