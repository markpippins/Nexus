/**
 * CCNF Reference Implementation (Go)
 *
 * Reverse-engineered contract for nexus/go/wrp/ccnf-ref — the Go reference
 * implementation of the Canonical Content Normalization Format. Defines the
 * CER envelope, the canonical serialization rules (SERIALIZATION_CONTRACT.md),
 * identity/hash derivation, golden vectors, and the event replay machinery.
 *
 * This is an embedded/CLI contract — no HTTP service. It is the parity
 * counterpart of the Rust verifier (ccnf-verifier/rust).
 */
import "./models.tsp";
import "./operations.tsp";

namespace org.nexus.ccnf.ref;
