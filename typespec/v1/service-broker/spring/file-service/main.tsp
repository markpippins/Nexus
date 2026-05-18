import "@typespec/http";
import "./fs/main.tsp";
import "./restfs/models.tsp";
import "./restfs/operations.tsp";

using Http;

@service(#{ title: "Nexus File Service" })
namespace com.aibizarchitect.nexus.v1.fileservice;
