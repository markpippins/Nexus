/**
 * cascade-srv — Cascade Event Orchestration API
 *
 * Reverse-engineered from typescript/cascade-srv/src/routes.ts.
 * Manages cascade event subscriptions, turn dispatch, and lease
 * coordination between the cascade event bus and PostgreSQL.
 *
 * Auth posture: LAN-bound, no authentication. Documented AS SHIPPED
 * per audit 8bfe6519 convention.
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Cascade Event Orchestration Service" })
namespace org.nexus.cascadesrv;