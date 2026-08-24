/**
 * Nexus Tools (Python)
 *
 * Reverse-engineered contract for nexus/tools — the code-integrity and
 * governance tooling: CIR-1..5 ontology lint, CIR v2 ARL (Anti-Recursion
 * Linter), authority-matrix validation, graph conformance, JSON-LD
 * resolution, ProjectionIR adaptation, api-docs drift checks, and the
 * contract-audit umbrella gate.
 *
 * CLI contracts — no HTTP service. All gates share the exit-code convention
 * 0 = pass / 1 = violations found, and the --json report envelope.
 */
import "./models.tsp";
import "./operations.tsp";

namespace org.nexus.tools;
