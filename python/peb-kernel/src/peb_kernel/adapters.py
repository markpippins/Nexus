"""HTTP adapters for PEB's external integration ports."""

from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from typing import Any


class AdapterError(RuntimeError):
    """Raised when an external governance integration cannot be reached."""


class JsonHttpClient:
    def __init__(self, base_url: str, timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def request(self, method: str, path: str, body: Any | None = None) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = Request(
            f"{self.base_url}{path}",
            data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method=method,
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise AdapterError(f"{method} {path} failed: {exc}") from exc


class ConduitMcpAdapter:
    def __init__(self, base_url: str = "http://localhost:3100", timeout: float = 10.0) -> None:
        self.client = JsonHttpClient(base_url, timeout)

    def submit_work_request(self, work_request: Any) -> Any:
        return self.client.request("POST", "/wr/submit", work_request)

    def get_work_request(self, wr_id: str) -> Any:
        return self.client.request("GET", f"/wr/{quote(wr_id, safe='')}")

    def transition_work_request(self, wr_id: str, transition: Any) -> Any:
        return self.client.request("POST", f"/wr/{quote(wr_id, safe='')}/transition", transition)

    def issue_receipt(self, receipt: Any) -> Any:
        return self.client.request("POST", "/vision/receipts", receipt)

    def query_state(self) -> Any:
        return self.client.request("GET", "/state")


class LosmIrTransitionAdapter:
    def __init__(self, base_url: str = "http://localhost:8006", timeout: float = 10.0) -> None:
        self.client = JsonHttpClient(base_url, timeout)

    def transition(self, wr_id: str, to_state: str, actor: str, reason: str) -> Any:
        return self.client.request(
            "POST",
            f"/work-requests/{quote(wr_id, safe='')}/transition",
            {"to_state": to_state, "actor": actor, "reason": reason},
        )

    def get_work_request(self, wr_id: str) -> Any:
        return self.client.request("GET", f"/work-requests/{quote(wr_id, safe='')}")

    def orchestrate(self, wr_id: str) -> Any:
        return self.client.request("POST", f"/work-requests/{quote(wr_id, safe='')}/orchestrate")
