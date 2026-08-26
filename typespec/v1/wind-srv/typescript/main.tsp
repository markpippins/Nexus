/**
 * wind-srv — Nexus Wind Workflow Engine API
 *
 * Reverse-engineered from typescript/wind-srv/openapi.yaml
 * and typescript/wind-srv/src/routes/*.js.
 * Manages workflow instances (tickets), event types, edges,
 * nodes, office assignments, and title/version registries.
 *
 * Auth posture: LAN-bound, no authentication. Documented AS SHIPPED
 * per audit 8bfe6519 convention.
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Wind Workflow Engine" })
namespace org.nexus.windsrv;