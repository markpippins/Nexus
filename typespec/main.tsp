/**
 * Nexus Platform API
 * 
 * Comprehensive API for the Nexus polyglot microservices platform.
 * Includes service registry, filesystem operations, and lookup services.
 */
import "@typespec/http";
import "@typespec/rest";

// REST Filesystem API
import "./restfs/models.tsp";
import "./restfs/operations.tsp";

// Lookup Services API
import "./lookups/models.tsp";
import "./lookups/operations.tsp";

// Service Broker API
import "./service-broker/broker-service/api/models.tsp";
import "./service-broker/broker-service/api/operations.tsp";
import "./service-broker/broker-service/spi/models.tsp";
import "./service-broker/broker-service/spi/operations.tsp";
import "./service-broker/broker-service/service/models.tsp";
import "./service-broker/broker-service/service/operations.tsp";

using Http;
using Rest;

// ========================================================================
// Service Definitions
// ========================================================================

@service(#{
  title: "Nexus Platform API",
})
@server("http://localhost:8080", "Local development server")
namespace Nexus {}
