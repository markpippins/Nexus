/**
 * substance — TypeSpec Models
 *
 * Reverse-engineered from python/substance (FastAPI).
 * No route or verb decorators live here.
 */
namespace org.nexus.substance {

  /** A segment set. */
  model SegmentSetOut {
    @format("uuid")
    segmentSetId: string;
    name?: string;
    members?: string[];
  }

  /** A domain link (segment set attached to a domain entity). */
  model DomainLinkOut {
    @format("uuid")
    segmentSetId: string;
    role?: string;
    active?: boolean;
    segmentSet?: SegmentSetOut;
  }

  /** Request body for linking a segment set to a domain entity. */
  model DomainLinkIn {
    @format("uuid")
    segmentSetId: string;
    role?: string;
  }
}
