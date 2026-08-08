#!/usr/bin/env bash
# check-inbox.sh — R17 end-of-turn inbox check for any role.
#
# Queries the role's inbox via the nebula MCP on 3102 using the classic
# HTTP+SSE transport (there is NO POST /tools/call route — that 404s):
#   GET /sse → read the `event: endpoint` message for the session-scoped
#   /messages?sessionId=... URL → POST JSON-RPC initialize /
#   notifications/initialized / tools/call nebula_list_agent_records →
#   responses arrive back over the same SSE stream, matched by JSON-RPC id.
#
# The inbox pointer (last-seen timestamp) lives at
#   http://localhost:3101/api/inbox-pointer/<role>
# and filters records created after it. Records' createdAt is epoch ms; the
# pointer/createdAfter expect ISO strings (only ISO was verified to parse).
#
# Usage:
#   check-inbox.sh [--role <role>] [--pointer <ISO>|--all] [--limit N]
#                  [--update-pointer] [--raw]
#
# Options:
#   --role <role>       role whose inbox to query (default: engineer)
#   --pointer <ISO>     explicit createdAfter timestamp (overrides stored ptr)
#   --all               ignore the stored pointer; list most recent records
#   --limit N           max records to return (default: 10)
#   --update-pointer    after listing, PUT the pointer to the newest record's
#                       createdAt (converted to ISO) so the next check is clean
#   --raw               print the raw MCP result JSON instead of summaries
#   -h, --help          show this help
#
# Exit: 0 = ok (even with zero new records), 1 = transport/tool error,
# 2 = usage error.
set -u

exec python3 - "$@" <<'PY'
import json, sys, threading, time, urllib.request, urllib.error
from datetime import datetime, timezone

BASE = "http://localhost:3102"
POINTER_API = "http://localhost:3101/api/inbox-pointer"

USAGE = """Usage: check-inbox.sh [--role <role>] [--pointer <ISO>|--all] [--limit N]
                  [--update-pointer] [--raw]
Options:
  --role <role>       role whose inbox to query (default: engineer)
  --pointer <ISO>     explicit createdAfter timestamp (overrides stored ptr)
  --all               ignore the stored pointer; list most recent records
  --limit N           max records to return (default: 10)
  --update-pointer    after listing, PUT the pointer to the newest record's
                      createdAt (converted to ISO)
  --raw               print the raw MCP result JSON instead of summaries
  -h, --help          show this help"""

# --- arg parsing -----------------------------------------------------------
role = "engineer"
pointer = None
all_records = False
limit = 10
update_pointer = False
raw = False
i = 0
args = sys.argv[1:]
while i < len(args):
    a = args[i]
    if a in ("-h", "--help"):
        print(USAGE)
        sys.exit(0)
    elif a == "--role":
        i += 1
        if i >= len(args):
            print("ERROR: --role requires a value", file=sys.stderr); sys.exit(2)
        role = args[i]
    elif a == "--pointer":
        i += 1
        if i >= len(args):
            print("ERROR: --pointer requires a value", file=sys.stderr); sys.exit(2)
        pointer = args[i]
    elif a == "--all":
        all_records = True
    elif a == "--limit":
        i += 1
        if i >= len(args):
            print("ERROR: --limit requires a value", file=sys.stderr); sys.exit(2)
        try:
            limit = int(args[i])
        except ValueError:
            print("ERROR: --limit must be an integer", file=sys.stderr); sys.exit(2)
        if limit < 1:
            print("ERROR: --limit must be >= 1", file=sys.stderr); sys.exit(2)
    elif a == "--update-pointer":
        update_pointer = True
    elif a == "--raw":
        raw = True
    else:
        print("ERROR: unknown argument: %s" % a, file=sys.stderr)
        print(USAGE, file=sys.stderr)
        sys.exit(2)
    i += 1

# --- pointer resolution ----------------------------------------------------
if pointer is None and not all_records:
    try:
        with urllib.request.urlopen(POINTER_API + "/" + role, timeout=8) as r:
            pointer = json.loads(r.read().decode()).get("pointer")
    except Exception as e:
        print("WARN: cannot read stored pointer (%s) — showing most recent records" % e,
              file=sys.stderr)
        all_records = True

if pointer:
    print("# inbox for %s since %s (limit %d)" % (role, pointer, limit))
else:
    print("# inbox for %s — most recent %d records" % (role, limit))

# --- SSE session -----------------------------------------------------------
endpoint = {"url": None}
responses = {}
lock = threading.Lock()

def sse_reader(resp):
    event_type = None
    try:
        for raw in resp:
            line = raw.decode(errors="replace").rstrip("\r\n")
            if line.startswith("event:"):
                event_type = line[6:].strip()
            elif line.startswith("data:"):
                payload = line[5:].strip()
                if event_type == "endpoint":
                    with lock:
                        endpoint["url"] = payload if payload.startswith("http") else BASE + payload
                else:
                    try:
                        msg = json.loads(payload)
                    except Exception:
                        continue
                    if "id" in msg:
                        with lock:
                            responses[msg["id"]] = msg
                event_type = None
    except Exception:
        pass  # daemon thread; session ends at exit

try:
    resp = urllib.request.urlopen(BASE + "/sse", timeout=30)
except Exception as e:
    print("ERROR: cannot open SSE session on 3102: %s" % e, file=sys.stderr)
    sys.exit(1)
threading.Thread(target=sse_reader, args=(resp,), daemon=True).start()

deadline = time.time() + 15
while time.time() < deadline and not endpoint["url"]:
    time.sleep(0.1)
if not endpoint["url"]:
    print("ERROR: no endpoint event from /sse — is nebula-mcp up on 3102?", file=sys.stderr)
    sys.exit(1)
msg_url = endpoint["url"]

# --- JSON-RPC over POST /messages ------------------------------------------
def rpc(payload, timeout=15):
    headers = {"Content-Type": "application/json",
               "Accept": "application/json, text/event-stream"}
    req = urllib.request.Request(msg_url, data=json.dumps(payload).encode(),
                                 headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status = r.status
            body = r.read().decode(errors="replace")
            if status >= 400:
                return {"error": "HTTP %d: %s" % (status, body[:300])}
    except urllib.error.HTTPError as e:
        return {"error": "HTTP %d: %s" % (e.code, e.read().decode()[:300])}
    except Exception as e:
        return {"error": str(e)}
    if "id" not in payload:  # notification — no response expected
        return {"sent": True}
    deadline = time.time() + timeout
    while time.time() < deadline:
        with lock:
            if payload["id"] in responses:
                return responses.pop(payload["id"])
        time.sleep(0.1)
    return {"error": "timeout waiting for SSE response"}

init = rpc({"jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "check-inbox.sh", "version": "1.0"}}})
if "error" in init:
    print("ERROR: initialize failed: %s" % init["error"], file=sys.stderr)
    sys.exit(1)
rpc({"jsonrpc": "2.0", "method": "notifications/initialized"})

arguments = {"role": role, "tags": ["to:" + role], "limit": limit}
if pointer:
    arguments["createdAfter"] = pointer

res = rpc({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
           "params": {"name": "nebula_list_agent_records", "arguments": arguments}})

if "error" in res:
    print("ERROR: %s" % res["error"], file=sys.stderr)
    sys.exit(1)

content = res.get("result", {}).get("content", [])
text = "".join(c.get("text", "") for c in content if isinstance(c, dict))
try:
    records = json.loads(text)
except Exception:
    records = None

if records is None or not isinstance(records, list):
    print(text if text else json.dumps(res, indent=2))
    sys.exit(1)

if raw:
    print(json.dumps(records, indent=2))
else:
    if not records:
        print("(no new records)")
    for rec in records:
        ts = rec.get("createdAt", 0)
        iso = ""
        try:
            iso = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
        except Exception:
            iso = str(ts)
        print("- %s | %s | %s" % (iso, rec.get("recordType", "?"), rec.get("title", "")[:80]))

# --- optional pointer advance ----------------------------------------------
# NOTE: relies on the tool returning records newest-first, so max(createdAt)
# over the (possibly limited) window is the true newest — an unsorted list
# would only under-advance (duplicate delivery next turn), never lose records.
if update_pointer and records:
    newest = max((r.get("createdAt") or 0) for r in records)
    if newest:
        iso = datetime.fromtimestamp(newest / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        payload = {"timestamp": iso}
        try:
            req = urllib.request.Request(POINTER_API + "/" + role,
                                         data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"},
                                         method="PUT")
            with urllib.request.urlopen(req, timeout=8) as r:
                print("# pointer updated to %s" % json.loads(r.read().decode()).get("pointer"))
        except Exception as e:
            print("WARN: pointer update failed: %s" % e, file=sys.stderr)
PY
