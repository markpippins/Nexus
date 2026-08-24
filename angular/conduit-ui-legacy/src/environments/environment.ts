export const environment = {
  production: false,
  // Dev: proxy.conf.json routes to conduit-mcp:3100 and tackle-srv:3410.
  // Leave apiBaseUrl empty so same-origin calls hit the proxy.
  apiBaseUrl: '',
};
