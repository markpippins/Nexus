/**
 * adonisjs — TypeSpec Models
 *
 * Reverse-engineered from adonisjs/broker-gateway-proxy.
 * No route or verb decorators live here; the reconciler scans this file and
 * must find none.
 */
namespace org.nexus.adonisjs {

  /** Response body for GET /health. */
  model ProxyHealthResponse {
    /** Health status, normally "UP". */
    status: string;
    /** Service name. */
    service: string;
    /** Epoch timestamp. */
    timestamp: string;
  }
}
