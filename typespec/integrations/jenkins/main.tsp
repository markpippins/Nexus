import "@typespec/openapi";

using TypeSpec.OpenAPI;

@service({
  title: "Jenkins Integration API",
  version: "v0",
})
@server("Jenkins controller", "{serverUrl}", {
  serverUrl: string,
})
namespace Jenkins;
