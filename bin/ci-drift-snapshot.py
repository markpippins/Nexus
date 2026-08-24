#!/usr/bin/env python3
"""Generate normalized JSON snapshots of committed OpenAPI specs.

The ci-gateway drift sentinel (ballerina/ci-gateway/drift.bal) compares
these snapshots against LIVE service behavior — every parameterless GET
the contract promises must exist and answer <400 on the running service.

Ballerina has no YAML parser, and no TS service serves its spec over
HTTP, so this conversion is the bridge between repo contracts and the
runtime probe. Snapshots are committed: drift between spec edits and
snapshots shows up in review, drift between snapshots and live behavior
shows up in /gateway/drift/check.

Usage:
  ci-drift-snapshot.py                 # all services with openapi.yaml
  ci-drift-snapshot.py svc1 svc2 ...   # subset

Output: nexus/ballerina/ci-gateway/snapshots/<svc>.json (sort_keys=True
so diffs stay readable).
"""
import json
import pathlib
import sys

import yaml

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "ballerina" / "ci-gateway" / "snapshots"


def main() -> int:
    args = sys.argv[1:]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Discover committed specs across both runtimes: TypeScript services keep
    # their openapi.yaml under typescript/<svc>/; JVM services keep theirs next
    # to the Spring service module (jvm/spring/service-broker/<svc>/). The
    # service key is the immediate parent dir name in both cases.
    specs = sorted(REPO.glob("typescript/*/openapi.yaml")) + \
            sorted(REPO.glob("jvm/spring/service-broker/*/openapi.yaml"))
    count = 0
    for spec_path in specs:
        svc = spec_path.parent.name
        if args and svc not in args:
            continue
        spec = yaml.safe_load(spec_path.read_text())
        out = OUT_DIR / f"{svc}.json"
        out.write_text(json.dumps(spec, sort_keys=True, indent=1))
        paths = spec.get("paths", {})
        probe = sum(1 for p, ops in paths.items()
                    if "get" in ops and "{" not in p)
        print(f"{out.relative_to(REPO)}  ({len(paths)} paths, {probe} probeable)")
        count += 1
    print(f"{count} snapshot(s) written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
