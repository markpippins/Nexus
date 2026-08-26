/**
 * file-system-server — TypeSpec Operations
 *
 * Reverse-engineered from typescript/file-system-server/fs-serv.ts.
 * Routes match the raw http handler. Query parameters are documented
 * in prose comments rather than @query decorators (TypeSpec v1.13 lacks
 * @query support).
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.filesystemserver {

  @route("/health")
  @get
  @doc("Health probe. 200 UP when the FS root is accessible, else 503 DOWN.")
  op health(): HealthResponse;

  @route("/api/fs")
  @get
  @doc("List a directory (flat, non-recursive). Query param `path` (optional).")
  op listDirectory(): ListResponse;

  @route("/api/fs/content")
  @get
  @doc("Read file content. Query param `path` (required).")
  op readFile(): ContentResponse;

  @route("/api/fs/content")
  @put
  @doc("Write file content (body: { content: string }). Query param `path` (required).")
  op writeFile(@body body: WriteRequest): WriteResponse;

  @route("/fs")
  @post
  @doc("Legacy operation dispatcher. Body: FsRequest with `operation` field selecting ls/cd/mkdir/etc.")
  op dispatch(@body body: FsRequest): unknown;
}