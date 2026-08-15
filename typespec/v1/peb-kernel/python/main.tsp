// Python contract for the reverse-engineered PEB kernel FastAPI service.
// The canonical PEB contract lives in the shared spring subtree; the
// spring import below is retained so the Python client emitter continues to
// generate the spring-derived client (see tspconfig.yaml).
import "./models.tsp";
import "./operations.tsp";
import "../spring/main.tsp";

@service(#{ title: "Nexus PEB Kernel (Python FastAPI)" })
namespace org.nexus.pebkernel;
