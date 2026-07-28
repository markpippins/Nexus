#!/bin/bash
set -euo pipefail
ROOT="${FS_ROOT_DIR:-root}"
exec bun run fs-serv.ts "$ROOT"
