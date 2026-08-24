/**
 * CCNF Verifier (Rust)
 *
 * Reverse-engineered contract for nexus/rust/wrp/ccnf-verifier — the
 * independent Rust pipeline verifier for the Canonical Content Normalization
 * Format. It runs the full CCNF pipeline (structural parse, canonicalization,
 * intent normalization, identity derivation, delta computation, CER build,
 * hashing) and verifies outputs against the golden vector corpus, with an
 * optional Go-oracle triple check.
 *
 * Embedded/CLI contract — no HTTP service. Parity counterpart of the Go
 * reference (ccnf-ref/go).
 */
import "./models.tsp";
import "./operations.tsp";

namespace org.nexus.ccnf.verifier;
