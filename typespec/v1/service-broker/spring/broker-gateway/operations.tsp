/**
 * Broker Gateway Operations
 *
 * Health check and real-time traffic stream endpoints.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace com.aibizarchitect.nexus.v1.spring.broker.gateway {

  @route("/")
  @tag("Broker Gateway")
  interface BrokerGateway {
    @doc("Health check endpoint")
    @get
    @route("/health")
    health(): HealthStatus;

    @doc("""
      SSE stream of real-time broker traffic events.
      Clients connect via EventSource and receive BrokerTrafficEvent JSON payloads.
    """)
    @get
    @route("/api/v1/broker/logs/stream")
    streamLogs(): BrokerTrafficEvent[];
  }
}
