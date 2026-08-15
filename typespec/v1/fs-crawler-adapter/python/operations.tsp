/**
 * fs-crawler-adapter — TypeSpec Operations
 *
 * Reverse-engineered from python/fs/fs-crawler-adapter/adapter.py (FastAPI).
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.fscrawleradapter {

  @route("/api/broker/execute")
  @post
  @doc("Execute a broker request through the crawler adapter.")
  op brokerExecute(@body body: unknown): BrokerResponse | unknown;

  @route("/health")
  @get
  @doc("Liveness probe.")
  op health(): unknown;

  @route("/")
  @get
  @doc("Service root.")
  op root(): unknown;
}
