/**
 * Broker Service Operations
 *
 * Defines the concrete service operations for the broker implementation.
 * Routes match JVM BrokerController at /api/v1/broker.
 */

import "@typespec/http";
import "../api/models.tsp";
import "./models.tsp";

using Http;
using com.aibizarchitect.nexus.v1.servicebroker.api;
using com.aibizarchitect.nexus.v1.servicebroker.service;

/**
 * Broker service implementation.
 *
 * Matches JVM com.aibizarchitect.nexus.v1.spring.broker.BrokerController
 * at @RequestMapping("/api/v1/broker").
 */
@route("/api/v1/broker")
namespace com.aibizarchitect.nexus.v1.servicebroker.service {

  /**
   * Submit a request to the broker for processing.
   * JVM: POST /api/v1/broker/submitRequest
   */
  @route("/submitRequest")
  @post
  op submitRequest(request: ServiceRequest): ServiceResponseBody;

  /**
   * Test endpoint for broker functionality.
   * JVM: POST /api/v1/broker/testBroker
   */
  @route("/testBroker")
  @post
  op testBroker(): ServiceResponseBody;

  /**
   * Health check endpoint.
   * JVM: GET /health (at root, returns Map)
   * NOTE: JVM HealthController returns Map<String,Object> not ServiceResponseBody.
   * This is a contract-to-be-reconciled — currently defined for future alignment.
   */
  @route("/health")
  @get
  op healthCheck(): ServiceResponseBody;
}
