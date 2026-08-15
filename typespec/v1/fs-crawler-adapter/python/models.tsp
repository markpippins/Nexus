/**
 * fs-crawler-adapter — TypeSpec Models
 *
 * Reverse-engineered from python/fs/fs-crawler-adapter/adapter.py (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.fscrawleradapter {

  /** Response from the broker execute endpoint. */
  model BrokerResponse {
    accepted: boolean;
    result?: Record<unknown>;
  }
}
