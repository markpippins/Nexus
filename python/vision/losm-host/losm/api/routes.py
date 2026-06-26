from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from losm_store.session import get_db
from losm_kernel.core import graph_to_dict, LOSMKernel
from losm_kernel.constraints import ConstraintSystem, no_cycles
from losm_ir.graph import Graph, Node

router = APIRouter(prefix="/kernel", tags=["kernel"])


def get_kernel() -> LOSMKernel:
    constraints = ConstraintSystem()
    constraints.add(no_cycles)
    return LOSMKernel(constraints)


@router.post("/validate-graph", response_model=dict)
def validate_graph(graph: Graph, kernel: LOSMKernel = Depends(get_kernel)):
    try:
        kernel.validate_graph(graph)
        return {"valid": True, "graph": graph_to_dict(graph)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
