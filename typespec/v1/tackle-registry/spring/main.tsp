/**
 * tackle-registry — JVM Spring service contract (v1)
 *
 * Owner: architect (D-2026-08-23-C). Implementation:
 * jvm/spring/service-broker/tackle-registry-service.
 * Reads/writes the tackle PostgreSQL schema shared with tackle-srv.
 */
import "@typespec/http";
import "./models.tsp";
import "./operations.tsp";

using Http;

@service({
  title: "Tackle Registry Service",
  description: "JVM mirror of the tackle AI-config registry + Spring AI HTTP inference.",
})
@server("Tackle Registry Service", "{endpoint}", {
  endpoint: "http://localhost:8765",
})
namespace org.nexus.tackleregistry;
