/**
 * file-system-server — TypeSpec Models
 *
 * Reverse-engineered from typescript/file-system-server/fs-serv.ts.
 * Shapes reflect the wire contract the sandbox UI (monaco-judge) speaks.
 */
namespace org.nexus.filesystemserver {

  /** One entry in a directory listing (REST /api/fs). */
  model FsEntry {
    name: string;
    path: string;
    type: string;
    size?: int64;
  }

  /** REST list response: { entries: [...] }. */
  model ListResponse {
    entries: FsEntry[];
  }

  /** REST file-content response. */
  model ContentResponse {
    content: string;
  }

  /** REST write request/response body. */
  model WriteRequest {
    content: string;
  }

  model WriteResponse {
    saved: string;
  }

  /** Unified error shape (non-2xx). */
  model ErrorDetail {
    detail: string;
  }

  model HealthDetails {
    fsRootDir: string;
    port: int32;
  }

  /** Health response. */
  model HealthResponse {
    status: string;
    service: string;
    timestamp: string;
    details?: HealthDetails;
    error?: string;
  }

  // ── Legacy POST /fs operation dispatcher ──────────────────────────
  // A single RequestModel drives a switch on `operation`; each arm
  // returns a distinct response shape.

  model FsItem {
    name: string;
    type: string;
  }

  /** Input payload to POST /fs. */
  model FsRequest {
    fsAlias: string;
    path: string[];
    operation: string;
    newName?: string;
    filename?: string;
    sourcePath?: string[];
    toAlias?: string;
    toPath?: string[];
    destPath?: string[];
    items?: FsItem[];
  }

  /** ls / cd listing item (legacy dispatcher, richer than REST FsEntry). */
  model FsListItem {
    name: string;
    type: string;
    size: int64;
    last_modified: float64;
  }

  /** ls response. */
  model LsResponse {
    path: string[];
    items: FsListItem[];
  }

  /** cd response. */
  model CdResponse {
    path: string[];
  }

  /** mkdir response. */
  model MkdirResponse {
    created: string;
  }

  /** rmdir response. */
  model RmdirResponse {
    deleted: string;
  }

  /** newfile response. */
  model NewFileResponse {
    created_file: string;
  }

  /** deletefile response. */
  model DeleteFileResponse {
    deleted_file: string;
  }

  /** rename response. */
  model RenameResponse {
    renamed: string;
    to: string;
  }

  /** copy response. */
  model CopyResponse {
    copied: string;
    to: string;
  }

  /** move response. */
  model MoveResponse {
    moved: string;
    to: string;
  }

  /** hasfile / hasfolder response. */
  model ExistsResponse {
    exists: boolean;
    path: string;
    type: string;
  }

  // POST /fs dispatcher returns a variable shape per operation.
  // Successful responses are one of the typed models above;
  // errors carry an ErrorDetail envelope.
}
