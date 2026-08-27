/**
 * Governance Admission Envelope — TypeSpec Contract (W1.05)
 *
 * Canonical wire boundary for the governance admission envelope. Describes
 * request/evaluation/result/receipt shapes with explicit compatibility
 * annotations; does NOT embed doctrine law or evaluator implementation.
 *
 * Ratified prerequisites: W1.01 (field contract), W1.03 (compatibility
 * boundary), W1.04 (canonical serialization + evaluation fingerprint).
 */
import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Governance Admission" })
namespace Governance.Admission;