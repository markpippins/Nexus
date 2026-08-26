/**
 * file-system-server — Sandbox File System API
 *
 * Reverse-engineered from typescript/file-system-server/fs-serv.ts.
 * A single-process http server (no framework) exposing a sandboxed
 * file-system root (FS_ROOT_DIR) with path-traversal guards. Two surfaces:
 *   - REST helpers under /api/fs (list/read/write)
 *   - A legacy POST /fs operation dispatcher (ls/cd/mkdir/rmdir/newfile/
 *     deletefile/rename/copy/move/hasfile/hasfolder)
 *
 * Auth posture: LAN-bound, no authentication on either surface
 * (CORS allow-all). Documented AS SHIPPED per audit 8bfe6519 convention.
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus File System Service — Sandbox API" })
namespace org.nexus.filesystemserver;
