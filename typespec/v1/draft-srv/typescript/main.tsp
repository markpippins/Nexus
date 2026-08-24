/**
 * draft-srv — DB Workbench API
 *
 * Reverse-engineered from typescript/draft-srv/src/index.ts + routes/db.ts.
 * Auth posture note (audit 8bfe6519 C1): currently unauthenticated and
 * LAN-bound; contract documents the surface AS SHIPPED so any hardening
 * decision changes this file visibly.
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Draft Service — DB Workbench API" })
namespace org.nexus.draftsrv;
