/**
 * nats-envelope — TypeSpec Models (shared)
 *
 * Reverse-engineered from python/nats_envelope/envelope.py. This is the
 * shared event envelope for the NATS bus — used by cascade, voyager, and
 * voyager-adapter. Model-only: no HTTP surface, no route/verb decorators.
 */
namespace org.nexus.natsenvelope {

  /** Governance-oriented classification of an event. */
  enum Classification {
    @doc("Publicly shareable.")
    `public`: "public",

    @doc("Internal-only.")
    `internal`: "internal",

    @doc("Restricted distribution.")
    restricted: "restricted",

    @doc("Confidential.")
    confidential: "confidential",
  }

  /** Canonical event envelope for the NATS bus. */
  model CanonicalEnvelope {
    /** Globally unique event id. */
    eventId: string;
    /** camelCase event type, e.g. "IdeaCaptured". */
    eventType: string;
    /** Envelope schema version. */
    eventVersion?: int32;
    /** ISO 8601 occurrence timestamp. */
    occurredAt?: string;
    /** Origin system, always "nexus" for now. */
    originSystem?: string;
    /** Origin component: cascade, voyager, vision, conduit, ... */
    originComponent: string;
    /** Optional domain. */
    domain?: string;
    /** CCNF version. */
    ccnfVersion?: int32;
    /** Epoch id. */
    epochId?: string;
    /** Actor identity attributes. */
    actor?: Record<string>;
    /** Intent attributes. */
    intent?: Record<string>;
    /** Links all events in a workflow instance. */
    correlationId: string;
    /** Immediate parent event id. */
    causationId?: string;
    /** ALL contributing source event ids. */
    sourceEventIds?: string[];
    /** Retry/replay tracking id. */
    executionId?: string;
    /** Event classification. */
    classification?: Classification;
    /** Governance policy version. */
    policyVersion?: string;
    /** Transport subject, e.g. nexus.cascade.v1.workflow.step_requested. */
    subject: string;
    /** Event payload. */
    payload: Record<unknown>;
  }
}
