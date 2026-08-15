/**
 * operator-svc — TypeSpec Operations
 *
 * Reverse-engineered from python/operator_svc/server.py (http.server
 * ThreadingHTTPServer). do_GET handles /chat/health, /chat/sessions, and
 * /chat/stream/*; do_POST handles /chat and /api/proxy/*.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.operatorsvc {

  @route("/chat/health")
  @get
  @doc("Liveness check.")
  op chatHealth(): unknown;

  @route("/chat/sessions")
  @get
  @doc("List recent chat sessions.")
  op listSessions(): unknown;

  @route("/chat/stream/{id}")
  @get
  @doc("SSE stream of an operator response.")
  op chatStream(@path id: string): unknown;

  @route("/chat")
  @post
  @doc("Send a chat message to the operator.")
  op chat(@body body: ChatRequest): ChatResponse | unknown;

  @route("/api/proxy/{service}")
  @post
  @doc("Proxy a request to a Nexus backend service.")
  op apiProxy(@path service: string, @body body: unknown): unknown;
}
