"""
Agent Timeclock MCP Server

Provides HTTP API and MCP tools for tracking agent sessions.
Agents clock in when starting a session and clock out when leaving.
The CLI times out after an hour, so a heartbeat mechanism is provided.

Start: uvicorn main:app --reload --port 3600
"""

import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from routes import router

# ── Logging ──────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
_log = logging.getLogger("timeclock")


# ── Lifespan ─────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    _log.info("Timeclock MCP server starting...")
    init_db()
    _log.info("Timeclock MCP server ready on port %s", os.environ.get("TIMECLOCK_PORT", "3600"))
    yield
    _log.info("Timeclock MCP server shutting down")


# ── App ──────────────────────────────────────────────────────────

app = FastAPI(
    title="Agent Timeclock MCP",
    version="0.1.0",
    description="Track agent sessions by role and model. Clock in/out, heartbeat, and session log.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, tags=["timeclock"])


@app.get("/healthz")
def health():
    return {"status": "alive", "service": "timeclock"}


@app.get("/")
def root():
    return {
        "service": "Agent Timeclock MCP",
        "version": "0.1.0",
        "docs": "/docs",
        "endpoints": {
            "clock_in": "POST /clock-in",
            "clock_out": "POST /clock-out",
            "heartbeat": "POST /heartbeat",
            "active": "GET /active",
            "log": "GET /log",
            "stats": "GET /stats",
            "timeout_cleanup": "POST /timeout-cleanup",
        },
    }


def run():
    import uvicorn
    port = int(os.environ.get("TIMECLOCK_PORT", "3600"))
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    run()
