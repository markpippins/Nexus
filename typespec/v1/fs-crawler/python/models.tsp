/**
 * fs-crawler — TypeSpec Models
 *
 * Reverse-engineered from python/fs/fs-crawler/app (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.fscrawler {

  /** A filesystem library under management. */
  model Library {
    libraryId: string;
    name: string;
    path: string;
    rules?: Record<unknown>[];
  }

  /** System status snapshot. */
  model SystemStatus {
    status: string;
    libraries?: int32;
    files?: int32;
  }

  /** Scan status. */
  model ScanStatus {
    scanning: boolean;
    progress?: float;
  }

  /** Duplicate stats. */
  model DuplicateStats {
    groups: int32;
    files: int32;
    bytes: int64;
  }

  /** A crawl rule. */
  model CrawlRule {
    ruleId: string;
    name: string;
    pattern?: string;
    action?: string;
  }
}
