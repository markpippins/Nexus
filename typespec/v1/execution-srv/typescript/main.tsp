/**
 * execution-srv — Execution Observability API
 *
 * Reverse-engineered from typescript/execution-srv/src/routes.ts.
 * Read-only SELECT-only PostgreSQL observability over the `execution`
 * schema: requests, leases, attempts, receipts.
 *
 * Auth posture: LAN-bound, no authentication. Documented AS SHIPPED
 * per audit 8bfe6519 convention.
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Execution Observability Service" })
namespace org.nexus.executionsrv;