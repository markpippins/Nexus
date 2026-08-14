"""Run the PEB FastAPI service."""

from __future__ import annotations

import os

from .api import create_app

app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run(
        "peb_kernel.main:app",
        host=os.getenv("PEB_HOST", "0.0.0.0"),
        port=int(os.getenv("PEB_PORT", "8080")),
        reload=False,
    )


if __name__ == "__main__":
    main()
