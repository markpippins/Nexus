import "../../core/main.tsp";
import "./api/models.tsp";
import "./api/operations.tsp";
import "./spi/models.tsp";
import "./spi/operations.tsp";
import "./service/operations.tsp";

// Sub-service contracts with independent REST endpoints
import "./broker-gateway/main.tsp";
import "./sec-bot/main.tsp";
import "./upload-service/main.tsp";
import "./user-access-service/main.tsp";

// Export Service (package: com.broker.shrapnel.export)
import "./export-service/main.tsp";

@service(#{ title: "Nexus Service Broker" })
namespace com.aibizarchitect.nexus.v1.servicebroker.api;
