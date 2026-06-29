import "@typespec/http";
import "./models.tsp";

namespace com.aibizarchitect.nexus.v1.servicebroker.api {

/**
 * Broker Service API Operations
 *
 * Defines the REST API operations for submitting requests to the service broker.
 * The public API contract — all routes match the JVM BrokerController at /api/v1/broker.
 */

using Http;

/**
 * Submit a request to the service broker for processing.
 *
 * Matches JVM BrokerController.submitRequest at POST /api/v1/broker/submitRequest.
 * Accepts a service request and routes it to the appropriate target service.
 */
@route("/api/v1/broker/submitRequest")
@post
op submitRequest(
  /**
   * The service request to process.
   */
  @body request: ServiceRequest
): ServiceResponseBody;

/**
 * Test endpoint for broker functionality.
 *
 * Matches JVM BrokerController.testBroker at POST /api/v1/broker/testBroker.
 */
@route("/api/v1/broker/testBroker")
@post
op testBroker(): ServiceResponseBody;
}
