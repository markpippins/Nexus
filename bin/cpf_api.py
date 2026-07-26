#!/usr/bin/env python3
"""
cpf-api — lightweight HTTP wrapper around cpf_query.py.

Serves the CPF funnel data as JSON over HTTP so the Angular console
can consume it without shell-exec access.

Endpoints:
  GET  /api/cpf              — query candidates (threshold, candidate, all params)
  GET  /api/cpf/count        — pre-computed counts by readiness band
  GET  /api/cpf/ready        — short-cut for threshold 0.7
  POST /api/cpf/promote      — promote a candidate (calls promote-ready.sh)
  GET  /health               — health check

Usage:
    ./cpf_api.py --port 3108
"""

import argparse
import json
import logging
import os
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("cpf-api")

PROJECT_DIR = "/home/codex/dev/nexus"
SCRIPT_DIR = f"{PROJECT_DIR}/bin"
CPF_QUERY = f"{SCRIPT_DIR}/cpf_query.py"
PROMOTE_SCRIPT = f"{PROJECT_DIR}/scripts/bash/promote-ready.sh"


def run_cpf(args: list[str]) -> dict:
    """Run cpf_query.py with given args and return parsed JSON."""
    cmd = [CPF_QUERY] + args
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=SCRIPT_DIR,
        )
        if result.returncode != 0:
            return {
                "error": f"cpf_query.py exited {result.returncode}",
                "stderr": result.stderr.strip(),
            }
        data = json.loads(result.stdout)
        return {"data": data, "count": len(data) if isinstance(data, list) else 1}
    except subprocess.TimeoutExpired:
        return {"error": "cpf_query.py timed out"}
    except json.JSONDecodeError as e:
        return {"error": f"JSON parse error: {e}", "raw": result.stdout[:500]}
    except FileNotFoundError:
        return {"error": f"cpf_query.py not found at {CPF_QUERY}"}
    except Exception as e:
        return {"error": str(e)}


def _filter_hierarchy(data: list, system: str | None, subsystem: str | None) -> list:
    """Filter data list by system_name and/or subsystem_name."""
    if not system and not subsystem:
        return data
    result = data
    if system:
        result = [d for d in result if d.get("system_name", "").lower() == system.lower()]
    if subsystem:
        result = [d for d in result if d.get("subsystem_name", "").lower() == subsystem.lower()]
    return result


def promote_candidate(candidate_id: str) -> dict:
    """Promote a single candidate via promote-ready.sh."""
    if not os.path.exists(PROMOTE_SCRIPT):
        return {"error": f"promote-ready.sh not found at {PROMOTE_SCRIPT}"}
    try:
        result = subprocess.run(
            ["bash", PROMOTE_SCRIPT, "--candidate", candidate_id],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=PROJECT_DIR,
        )
        if result.returncode != 0:
            return {
                "error": f"promote-ready.sh exited {result.returncode}",
                "stderr": result.stderr.strip(),
                "stdout": result.stdout.strip(),
            }
        return {
            "success": True,
            "message": f"Candidate {candidate_id} promoted successfully",
            "stdout": result.stdout.strip(),
        }
    except subprocess.TimeoutExpired:
        return {"error": "promote-ready.sh timed out"}
    except Exception as e:
        return {"error": str(e)}


class CpfHandler(BaseHTTPRequestHandler):
    """HTTP request handler for CPF API."""

    def _send_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        params = parse_qs(parsed.query)

        if path == "/api/cpf/count":
            system = params.get("system", [None])[0]
            subsystem = params.get("subsystem", [None])[0]

            result = run_cpf(["--json", "--all"])
            if "data" in result:
                data = _filter_hierarchy(result["data"], system, subsystem)
                total = len(data)
                ready = sum(1 for d in data if d.get("compilation_readiness", 0) >= 0.7)
                promoted = sum(1 for d in data if d.get("status") == "promoted")
                self._send_json({
                    "total": total,
                    "ready": ready,
                    "promoted": promoted,
                    "near_miss": sum(1 for d in data if 0.5 <= d.get("compilation_readiness", 0) < 0.7),
                    "low": sum(1 for d in data if d.get("compilation_readiness", 0) < 0.5),
                })
            else:
                self._send_json(result)

        elif path == "/api/cpf":
            threshold = params.get("threshold", [None])[0]
            candidate_id = params.get("candidate", [None])[0]
            show_all = "all" in params
            system = params.get("system", [None])[0]
            subsystem = params.get("subsystem", [None])[0]

            # Pagination params
            try:
                limit = int(params.get("limit", ["0"])[0])
            except (ValueError, TypeError):
                limit = 0
            try:
                offset = int(params.get("offset", ["0"])[0])
            except (ValueError, TypeError):
                offset = 0

            args = ["--json"]
            if candidate_id:
                args.extend(["--candidate", candidate_id])
            elif show_all:
                args.append("--all")
            elif threshold:
                args.extend(["--threshold", threshold])

            result = run_cpf(args)

            # Apply hierarchy filter if specified
            if "data" in result and isinstance(result["data"], list) and (system or subsystem):
                result["data"] = _filter_hierarchy(result["data"], system, subsystem)
                result["count"] = len(result["data"])

            # Apply pagination slice if limit > 0
            if "data" in result and isinstance(result["data"], list) and limit > 0:
                total = len(result["data"])
                page = result["data"][offset:offset + limit]
                result["data"] = page
                result["count"] = total  # total count before slicing
                result["limit"] = limit
                result["offset"] = offset

            self._send_json(result)

        elif path == "/api/cpf/ready":
            args = ["--json", "--threshold", "0.7"]
            result = run_cpf(args)
            self._send_json(result)

        elif path == "/health":
            self._send_json({"status": "ok", "service": "cpf-api"})

        else:
            self._send_json({"error": f"Not found: {path}"}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/api/cpf/promote":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode() if content_length else "{}"
            try:
                payload = json.loads(body)
                candidate_id = payload.get("candidate_id", payload.get("id"))
                if not candidate_id:
                    self._send_json({"error": "Missing candidate_id"}, status=400)
                    return
                result = promote_candidate(candidate_id)
                self._send_json(result)
            except json.JSONDecodeError:
                self._send_json({"error": "Invalid JSON body"}, status=400)
        else:
            self._send_json({"error": f"Not found: {path}"}, status=404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        log.info("%s - %s", self.client_address[0], format % args)


def main():
    parser = argparse.ArgumentParser(description="CPF API server")
    parser.add_argument("--port", type=int, default=3108, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), CpfHandler)
    log.info("CPF API server listening on %s:%d", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
