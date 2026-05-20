#!/bin/bash
set -euo pipefail
ROOT="${FS_ROOT_DIR:-fs_root}"
exec bun run fs-serv.ts "$ROOT"
