import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from losm_store.session import SessionLocal


async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session_id = str(uuid.uuid4())
    wr_id: str | None = None

    while True:
        try:
            raw = await websocket.receive_text()
        except WebSocketDisconnect:
            break

        try:
            data = json.loads(raw)
            msg_type = data.get("type")
            cmd_wr_id = data.get("wr_id") or wr_id
            payload = data.get("payload", {})

            if msg_type == "subscribe" and data.get("wr_id"):
                wr_id = data["wr_id"]
                await websocket.send_text(json.dumps({
                    "type": "subscribed",
                    "session_id": session_id,
                    "wr_id": wr_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {},
                }))
                continue

            if msg_type == "unsubscribe":
                wr_id = None
                continue

            if msg_type:
                db = SessionLocal()
                try:
                    from losm_shell.lifecycle.orchestrator import PipelineCoordinator
                    response = _handle_ws_command(msg_type, session_id, cmd_wr_id, payload, db)
                    await websocket.send_text(json.dumps(response))
                finally:
                    db.close()

        except (json.JSONDecodeError, KeyError):
            error_msg = json.dumps({
                "type": "ERROR",
                "session_id": session_id,
                "wr_id": wr_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {"message": "Invalid message format"},
            })
            await websocket.send_text(error_msg)


def _handle_ws_command(msg_type: str, session_id: str, wr_id: str | None, payload: dict, db: Any) -> dict:
    if msg_type == "status" and wr_id:
        from losm_store.repository import get_work_request
        try:
            wr = get_work_request(db, int(wr_id))
            return {
                "type": "STATUS_RESPONSE",
                "session_id": session_id,
                "wr_id": wr_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "status": wr.status.value if hasattr(wr.status, "value") else str(wr.status),
                },
            }
        except Exception as e:
            return {"type": "ERROR", "session_id": session_id, "wr_id": wr_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"message": str(e)}}
    return {
        "type": "UNKNOWN_COMMAND",
        "session_id": session_id,
        "wr_id": wr_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {"message": f"Unknown command: {msg_type}"},
    }
