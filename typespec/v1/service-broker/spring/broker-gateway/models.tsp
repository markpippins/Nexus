/**
 * Broker Gateway Models
 *
 * Health check and traffic event models for the broker gateway.
 */
import "../../../core/main.tsp";

namespace com.aibizarchitect.nexus.v1.spring.broker.gateway {

  /** Health check response */
  model HealthStatus {
    status: string;
    service: string;
    timestamp: utcDateTime;
    /** Arbitrary JSON with additional health details */
    details?: unknown;
  }

  /** Broker traffic event published to SSE stream */
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
    errorMessage?: string;
  }
}
