/**
 * nebula-srv — Nexus Central Data-Plane API
 *
 * Reverse-engineered from typescript/nebula-srv/src/routes.ts.
 * Serves as the primary REST API for the Nexus knowledge graph,
 * covering ~200 routes across 15+ entity groups. All routes are
 * mounted under /api (the Express router is mounted at /api in
 * index.ts).
 *
 * Auth posture: LAN-bound, no authentication. Documented AS SHIPPED
 * per audit 8bfe6519 convention.
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Data-Plane API — nebula-srv" })
namespace org.nexus.nebulasrv;