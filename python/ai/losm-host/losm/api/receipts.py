from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from losm_store.ingestor import ExecutionReceiptIngestor
from losm_store.session import get_db

router = APIRouter(prefix="/receipts", tags=["receipts"])


class ReceiptIngestResponse(BaseModel):
    status: str
    receipt_id: str
    work_request_id: str
    event_type: str


@router.post("/ingest", response_model=ReceiptIngestResponse)
def ingest_receipt(receipt: dict, db: Session = Depends(get_db)):
    ingestor = ExecutionReceiptIngestor()
    result = ingestor.ingest(db, receipt)
    return ReceiptIngestResponse(**result)
