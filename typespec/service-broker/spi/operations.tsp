/**
 * Broker Service SPI Operations
 * 
 * Defines the internal operations for service broker implementations.
 * These operations are used internally by the broker infrastructure.
 */

import "../api/models.tsp";

/**
 * Internal operation to process a submitted request.
 * 
 * This is the core operation that broker implementations must provide.
 */
op processRequest(request: ServiceRequest): ServiceResponseBody;
