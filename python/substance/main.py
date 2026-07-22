from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import close_pool, init_pool
from .routers import links, segment_sets


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="Nebula Segments Service", version="0.1.0", lifespan=lifespan)
app.include_router(segment_sets.router)
app.include_router(links.router)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
