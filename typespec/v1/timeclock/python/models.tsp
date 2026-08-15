/**
 * timeclock — TypeSpec Models
 *
 * Reverse-engineered from python/timeclock (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.timeclock {

  /** Response from a clock-in/clock-out/heartbeat action. */
  model TimeclockResponse {
    sessionId?: string;
    role: string;
    `model`?: string;
    status: string;
    timestamp?: utcDateTime;
  }

  /** Active sessions listing. */
  model ActiveSessionsResponse {
    sessions: TimeclockResponse[];
  }

  /** Session log listing. */
  model SessionLogResponse {
    entries: TimeclockResponse[];
  }

  /** Timeclock statistics. */
  model TimeclockStats {
    activeSessions?: int32;
    totalSessions?: int32;
  }

  /** Clock-in / heartbeat request body. */
  model ClockInRequest {
    role: string;
    `model`?: string;
  }

  /** Clock-out request body. */
  model ClockOutRequest {
    role: string;
    `model`?: string;
  }
}
