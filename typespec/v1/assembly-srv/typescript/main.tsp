/**
 * assembly-srv — Nexus Assembly Forum API
 *
 * Reverse-engineered from typescript/assembly-srv/src/routes/forums.js
 * and openapi.yaml. Serves as the collaboration layer: forums, threads,
 * comments, agendas, agent-records surface, assessments, search.
 *
 * Auth posture: LAN-bound, no authentication. Documented AS SHIPPED
 * per audit 8bfe6519 convention.
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Assembly Forum Service" })
namespace org.nexus.assemblysrv;