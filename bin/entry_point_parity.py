#!/usr/bin/env python3
"""G4 entry-point parity probe (audit II G4 / resumption criterion).

Compares live responses between a service's DIRECT endpoint and its
re-homed path on the control-edge (:8082), for a route map supplied via
--map JSON: [{"direct":"http://localhost:3101/api/systems",
              "edge":"http://localhost:8082/nebula/api/systems"}, ...]

Findings-first: if the edge path scheme is unknown, run with --discover
to probe candidate prefixes against one known-good direct URL and report
which (if any) parity. Exit 0 = all pairs parity, 2 = mismatches,
3 = unresolved scheme.
"""
import argparse
import json
import sys
import urllib.request

EDGE = "http://localhost:8082"


def fetch(url, timeout=8):
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return r.status, len(body), body[:120]
    except urllib.error.HTTPError as e:
        return e.code, 0, b""
    except Exception as e:
        return None, 0, str(e).encode()[:120]


def normalize(status_len):
    status, blen = status_len[0], status_len[1]
    # Parity class: 2xx vs 4xx-auth-shape vs 404 vs unreachable
    if status and 200 <= status < 300:
        return "ok"
    if status == 404:
        return "404"
    if status in (401, 403):
        return "auth"
    return "err" if status else "unreach"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", help="JSON array of {direct, edge} pairs")
    ap.add_argument("--direct", help="known-good direct URL for --discover")
    ap.add_argument("--discover", action="store_true", help="probe edge prefixes for one direct URL")
    ap.add_argument("--path", help="path portion to append during --discover")
    args = ap.parse_args()

    if args.discover or (args.direct and not args.map):
        direct_url = args.direct
        path = args.path or direct_url.split("/", 3)[-1] if "://" in direct_url else ""
        path = "/" + path if not path.startswith("/") else path
        print(f"# discovering edge scheme for {path}")
        ds, dl, _ = fetch(direct_url)
        print(f"direct {direct_url} -> {ds}")
        candidates = [
            f"{EDGE}{path}",
            f"{EDGE}/api{path}",
            f"{EDGE}/nebula{path}",
            f"{EDGE}/edge{path}",
            f"{EDGE}/proxy{path}",
            f"{EDGE}/v1{path}",
        ]
        resolved = []
        for u in candidates:
            st, _, _ = fetch(u)
            print(f"  probe {u} -> {st}")
            if st and st != 404:
                resolved.append((u, st))
        if not resolved:
            print("NO edge prefix resolved — scheme undocumented; escalate to architect/devops")
            return 3
        print("resolved:", ", ".join(f"{u} ({s})" for u, s in resolved))
        return 0

    if not args.map:
        print("--map or --discover required", file=sys.stderr)
        return 3

    pairs = json.loads(args.map)
    bad = 0
    for p in pairs:
        d, e = fetch(p["direct"]), fetch(p["edge"])
        dd, de = normalize(d), normalize(e)
        ok = dd == de
        bad += 0 if ok else 1
        print(f"{'PARITY ' if ok else 'DRIFT  '} direct={dd}({d[0]}) edge={de}({e[0]})  {p['direct']}")
    return 2 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
