import "@typespec/http";
import "./fs/models.tsp";
import "./fs/operations.tsp";
using Http;
@service(#{ title: "Rest FS Service" }) namespace restFsService;
