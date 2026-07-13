#!/bin/bash
set -euo pipefail
export FS_ROOT_DIR="/home/codex/dev/nexus/typescript/file-system-server/root"
ROOT="${FS_ROOT_DIR:-root}"
exec bun run fs-serv.ts "$ROOT"
