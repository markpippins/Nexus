import "@typespec/openapi";

using TypeSpec.OpenAPI;

@service({
  title: "SonarQube Integration API",
  version: "v0",
})
@server("SonarQube server", "{serverUrl}", {
  serverUrl: string,
})
namespace SonarQube;
