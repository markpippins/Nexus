// Python client generation for the reverse-engineered PEB kernel FastAPI service.
// Consume the Spring TypeSpec contract directly: it is the canonical shared
// request/response and operation surface for both PEB implementations.
import "../spring/main.tsp";

@service(#{ title: "Nexus PEB Kernel (Python FastAPI)" })
namespace org.nexus.pebkernel;
