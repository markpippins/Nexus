import asyncio
import json
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import close_pool, init_pool
from .listener import listen_segment_expirations
from .routers import links, segment_sets

SERVICE_NAME = "substance"
SERVICE_ID = 117
REGISTRY_URL = "http://localhost:8085"
HEARTBEAT_INTERVAL = 20  # seconds


async def _heartbeat_loop():
    """Periodically sends heartbeats to the service-registry (port 8085)."""
    url = f"{REGISTRY_URL}/api/v1/registry/heartbeat/{SERVICE_NAME}"
    payload = json.dumps({"serviceId": SERVICE_ID})
    headers = {"Content-Type": "application/json"}
    while True:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(url, content=payload, headers=headers)
                if resp.is_success:
                    print(f"[heartbeat] {SERVICE_NAME} OK (id={SERVICE_ID})")
                else:
                    print(f"[heartbeat] {SERVICE_NAME} {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[heartbeat] {SERVICE_NAME} failed: {e}")
        await asyncio.sleep(HEARTBEAT_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    heartbeat_task = asyncio.create_task(_heartbeat_loop())
    listener_task = asyncio.create_task(listen_segment_expirations())
    yield
    heartbeat_task.cancel()
    listener_task.cancel()
    await asyncio.gather(heartbeat_task, listener_task, return_exceptions=True)
    await close_pool()


app = FastAPI(title="Nebula Segments Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(segment_sets.router)
app.include_router(links.router)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
