"""
Kernel Runtime — FastAPI application entrypoint.

Wires together:
    - Delta ingestion API      (POST /delta)
    - State inspection API     (GET  /state)
    - Replay API               (GET  /replay)

Start:   uvicorn app.main:app --reload --port 3103
"""

import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_delta import router as delta_router
from app.api.routes_state import router as state_router
from app.api.routes_replay import router as replay_router

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)

_log = logging.getLogger("kernel.api")

# ── App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="WRP Kernel Runtime",
    version="0.1.0",
    description="Deterministic state machine for the Nexus WorkRequest Pipeline.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Include routers ──────────────────────────────────────────────────

app.include_router(delta_router, prefix="/delta", tags=["delta"])
app.include_router(state_router, prefix="/state", tags=["state"])
app.include_router(replay_router, prefix="/replay", tags=["replay"])


@app.on_event("startup")
async def startup():
    """Ensure database tables exist on startup."""
    from app.models.db import Base, engine
    Base.metadata.create_all(bind=engine)
    _log.info("Kernel API started — tables verified in PG")


@app.get("/")
def root():
    return {
        "service": "WRP Kernel Runtime",
        "version": "0.1.0",
        "docs": "/docs",
    }
