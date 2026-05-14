import "../../core/main.tsp";
import "./api/models.tsp";
import "./api/operations.tsp";
import "./spi/models.tsp";
import "./spi/operations.tsp";
import "./service/operations.tsp";

@service(#{ title: "Nexus Service Broker" })
namespace com.aibizarchitect.nexus.v1.servicebroker.api;
