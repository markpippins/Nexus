/**
 * timeclock — TypeSpec Operations
 *
 * Reverse-engineered from python/timeclock/main.py + routes.py (FastAPI).
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.timeclock {

  @route("/healthz")
  @get
  @doc("Liveness probe.")
  op healthz(): unknown;

  @route("/")
  @get
  @doc("Service root.")
  op root(): unknown;

  @route("/clock-in")
  @post
  @doc("Clock in a session.")
  op clockIn(@body body: ClockInRequest): TimeclockResponse | unknown;

  @route("/clock-out")
  @post
  @doc("Clock out a session.")
  op clockOut(@body body: ClockOutRequest): TimeclockResponse | unknown;

  @route("/heartbeat")
  @post
  @doc("Send a session heartbeat.")
  op heartbeat(@body body: ClockInRequest): TimeclockResponse | unknown;

  @route("/active")
  @get
  @doc("List active sessions.")
  op active(): ActiveSessionsResponse | unknown;

  @route("/log")
  @get
  @doc("List the session log.")
  op log(): SessionLogResponse | unknown;

  @route("/stats")
  @get
  @doc("Timeclock statistics.")
  op stats(): TimeclockStats | unknown;

  @route("/timeout-cleanup")
  @post
  @doc("Clean up timed-out sessions.")
  op timeoutCleanup(): unknown;
}
