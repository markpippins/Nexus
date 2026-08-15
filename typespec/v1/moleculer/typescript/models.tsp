/**
 * moleculer — TypeSpec Models
 *
 * Reverse-engineered from moleculer/search/services/google-search.service.ts.
 * No route or verb decorators live here; the reconciler scans this file and
 * must find none.
 */
namespace org.nexus.moleculer {

  /** A single search result item. */
  model SearchResultItem {
    /** Result title. */
    title: string;
    /** Result URL. */
    link: string;
    /** Result snippet. */
    snippet: string;
  }

  /** Search metadata reported by the provider. */
  model SearchInformation {
    /** Total result count as reported by the provider. */
    totalResults: string;
    /** Search time in seconds. */
    searchTime: float64;
  }

  /** Request body for POST /api/search/simple. */
  model SearchRequest {
    /** Search query string. */
    query: string;
    /** Provider token (optional). */
    token?: string;
  }

  /** Response body for POST /api/search/simple. */
  model SearchResponse {
    /** Result items. */
    items: SearchResultItem[];
    /** Provider search metadata. */
    searchInformation?: SearchInformation;
  }

  /** Response body for GET /api/health. */
  model MoleculerHealthResponse {
    /** Health status, normally "ok". */
    status: string;
    /** Service name. */
    service: string;
  }
}
