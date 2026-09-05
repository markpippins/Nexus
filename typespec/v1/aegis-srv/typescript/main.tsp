/**
 * aegis-srv — Nexus Aegis State-Machine Registry API
 *
 * REST service over the `aegis` PostgreSQL schema: a TLA+ formal-methods
 * registry that bridges formal state-machine definitions (constants,
 * variables, states, transitions, invariants, properties, temporal logic,
 * resolution-schema mappings) to the `resolution` schema. Also records
 * model-check results, validation results, and audited execution logs.
 *
 * Contract-first baseline: this TypeSpec is the single source of truth for
 * the route surface, intended as the baseline to migrate the implementation
 * to Moleculer. The Express server (typescript/aegis-srv) implements it.
 *
 * Auth posture: LAN-bound, no authentication. Documented AS SHIPPED per
 * audit 8bfe6519 convention.
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Aegis State-Machine Registry API — aegis-srv" })
namespace org.nexus.aegissrv;