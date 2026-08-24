/**
 * draft-srv — TypeSpec Operations
 *
 * Reverse-engineered from typescript/draft-srv/src/routes/db.ts.
 * All workbench routes live under /api/db; the UI reaches them through
 * its own server proxy (server.ts forwards /api/db/* to this service).
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.draftsrv {

  @route("/healthz")
  @get
  @doc("Liveness probe.")
  op healthz(): unknown;

  @route("/")
  @get
  @doc("Service root.")
  op root(): unknown;

  @route("/api/db/engines")
  @get
  @doc("Engine capability catalog: which engines are installed/enabled.")
  op listEngines(): { engines: EngineCapabilities[] };

  @route("/api/db/test-connection")
  @post
  @doc("Test a connection with caller-supplied credentials. Returns success:false with 502 on failure (fail-visible).")
  op testConnection(@body body: ConnSpec): {
    success: boolean;
    message: string;
    latencyMs?: int32;
    version?: string;
    database?: string;
  };

  @route("/api/db/schemas")
  @post
  @doc("Discover schemas/tables/columns/views/triggers/procedures for the supplied connection.")
  op discoverSchemas(@body body: ConnSpec): { schemas: SchemaObject[] };

  @route("/api/db/query")
  @post
  @doc("Execute arbitrary SQL (SELECT/DML/DDL) against the supplied connection. Errors return status:'error' bodies, never thrown away.")
  op executeQuery(@body body: { connection: ConnSpec, sql: string }): QueryResult;
}
