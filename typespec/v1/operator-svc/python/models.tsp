/**
 * operator-svc — TypeSpec Models
 *
 * Reverse-engineered from python/operator_svc (http.server REST API).
 * No route or verb decorators live here.
 */
namespace org.nexus.operatorsvc {

  /** Chat request body. */
  model ChatRequest {
    message: string;
    role?: string;
    sessionId?: string;
  }

  /** Chat response body. */
  model ChatResponse {
    sessionId: string;
    response: string;
  }
}
