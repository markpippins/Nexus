namespace com.aibizarchitect.nexus.v1.servicebroker.api {

/**
 * Broker Service API Models
 * 
 * Defines the core data contracts for submitting requests and receiving responses
 * from the service broker.
 */

/**
 * Error detail structure for failed responses.
 */
model ResponseError {
  /**
   * The field associated with the error.
   */
  field: string;

  /**
   * The error message.
   */
  message: string;
}

/**
 * A request submitted to the service broker for processing.
 */
model ServiceRequest {
  /**
   * The target service name to invoke.
   */
  service: string;

  /**
   * The operation name to execute on the target service.
   */
  operation: string;

  /**
   * Parameters to pass to the operation.
   */
  params: Record<unknown>;

  /**
   * Unique identifier for tracking this request.
   */
  requestId: string;

  /**
   * Whether the request/response should be encrypted.
   * Required boolean in JVM (defaults to false).
   */
  encrypt: boolean;
}

/**
 * The response body returned by broker service operations.
 * This is the concrete type used in API responses.
 */
model ServiceResponseBody {
  /**
   * Whether the operation was successful.
   */
  ok: boolean;

  /**
   * The response data (present when ok is true).
   */
  data?: unknown;

  /**
   * Error details (present when ok is false).
   */
  errors?: ResponseError[];

  /**
   * The request ID this response corresponds to.
   */
  requestId: string;

  /**
   * Timestamp when the response was generated.
   */
  ts: utcDateTime;

  /**
   * API version.
   */
  version?: string;

  /**
   * The service that processed the request.
   */
  service?: string;

  /**
   * The operation that was executed.
   */
  operation?: string;

  /**
   * Whether the response is encrypted.
   */
  encrypt?: boolean;
}

/**
 * Broker service registration status.
 */
enum ServiceStatus {
  HEALTHY,
  UNHEALTHY,
  UNKNOWN,
}

/**
 * A service registration record held by the broker registry.
 */
model ServiceRegistration {
  serviceName: string;
  operations?: string[];
  endpoint?: string;
  healthCheck?: string;
  metadata?: Record<unknown>;
  lastHeartbeat?: utcDateTime;
  status?: ServiceStatus;
}

/**
 * Generic broker service response wrapper (ServiceResponseBody is its
 * non-generic concrete form).
 */
model ServiceResponse<T> {
  ok: boolean;
  data?: T;
  errors?: Record<unknown>[];
  requestId: string;
  ts: utcDateTime;
  version?: string = "1.0";
  service?: string;
  operation?: string;
  encrypt?: boolean;
}

/**
 * Immutable event emitted per request/response cycle (carried over SSE).
 */
model BrokerTrafficEvent {
  eventId: string;
  timestamp: string;
  durationMs: int64;
  requestId: string;
  service: string;
  operation: string;
  ok: boolean;
  httpStatus: int32;
  source: string;
  request?: ServiceRequest;
  response?: ServiceResponse<unknown>;
  errorMessage?: string;
}

}