"""HTTP boundary for the Python PEB kernel."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .domain import AdmissionPath, PebTransaction, MalformedAdmissionRequest
from .engine import PebGovernanceEngine
from .ports import PebStore


@dataclass(frozen=True)
class ApiResult:
    status_code: int
    body: dict[str, Any]


class AdmissionController:
    """Framework-free controller logic, mirroring the Java boundary checks."""

    REQUIRED_FIELDS = ("idempotencyKey", "entityId", "toolName", "input")

    def __init__(self, governance_engine: PebGovernanceEngine) -> None:
        self.governance_engine = governance_engine

    def submit_transaction(self, payload: Mapping[str, Any] | None) -> ApiResult:
        if payload is None:
            return ApiResult(400, {"message": "Malformed admission request: missing required field(s): transaction body"})

        missing = self._missing_fields(payload)
        if missing:
            return ApiResult(
                400,
                {"message": "Malformed admission request: missing required field(s): " + ", ".join(missing)},
            )

        transaction = PebTransaction.from_payload(payload)
        path = AdmissionPath.from_tool_name(transaction.tool_name)
        try:
            response = self.governance_engine.process_for_path(transaction, path)
        except MalformedAdmissionRequest as exc:
            return ApiResult(422, {"message": f"Malformed admission request: {exc}"})

        return ApiResult(200 if response.admitted else 422, response.to_dict())

    @classmethod
    def _missing_fields(cls, payload: Mapping[str, Any]) -> list[str]:
        missing: list[str] = []
        aliases = {
            "idempotencyKey": ("idempotencyKey", "idempotency_key"),
            "entityId": ("entityId", "entity_id"),
            "toolName": ("toolName", "tool_name"),
            "input": ("input",),
        }
        for canonical, names in aliases.items():
            value = next((payload[name] for name in names if name in payload), None)
            if canonical == "input":
                if value is None:
                    missing.append(canonical)
            elif not isinstance(value, str) or not value.strip():
                missing.append(canonical)
        return missing


def create_app(store: PebStore | None = None, controller: AdmissionController | None = None):
    """Create the optional FastAPI app without making FastAPI a domain dependency."""
    try:
        from fastapi import FastAPI
        from fastapi.responses import JSONResponse
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("create_app requires fastapi") from exc

    if controller is None:
        from .engine import PebGovernanceEngine
        from .store import store_from_environment
        store = store or store_from_environment()
        controller = AdmissionController(PebGovernanceEngine(store))

    app = FastAPI(title="Nexus PEB Kernel", version="0.1.0")

    @app.post("/api/v1/peb/transaction")
    def submit_transaction(payload: dict[str, Any] | None = None):
        result = controller.submit_transaction(payload)
        return JSONResponse(status_code=result.status_code, content=result.body)

    @app.get("/actuator/health")
    def health():
        assert store is not None or controller is not None
        active_store = store or controller.governance_engine.store
        try:
            return active_store.health()
        except Exception as exc:
            return JSONResponse(
                status_code=503,
                content={"status": "DOWN", "database": "unreachable", "schema": "peb", "error": str(exc)},
            )

    return app
