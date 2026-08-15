/**
 * nexus-data-edge — TypeSpec Models
 */
namespace org.nexus.dataedge {

  /** GET /health response. */
  model Health {
    /** Literal "ok" / "error". */
    status: string;
    /** "nexus-data-edge". */
    service: string;
    /** "up" / error message. */
    db: string;
    /** "up" / error message. */
    redis: string;
    /** ISO timestamp. */
    timestamp: string;
  }
}
