/**
 * nexus-data-edge — TypeSpec Operations
 *
 * The consolidated data-plane edge (AdonisJS). Current live surface:
 * health. Data-plane service groups land with each Wave 3 migration.
 */

import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.dataedge {

  // ========================================================================
  // Health
  // ========================================================================

  @route("/health")
  @get
  @doc("Edge health: status, service, db + redis connectivity.")
  op health(): Health;
}
