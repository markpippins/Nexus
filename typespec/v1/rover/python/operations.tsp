/**
 * rover — TypeSpec Operations
 *
 * Reverse-engineered from python/rover/rover_mcp_server.py (FastMCP
 * "rover-mcp"). Each @mcp.tool() becomes an op under /tools/<name>.
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.rover {

  @route("/tools/rover_submit_transcript")
  @post
  @doc("Submit a transcript for processing.")
  op rover_submit_transcript(@body body: TranscriptSubmitRequest): string;

  @route("/tools/rover_get_pending_chunk")
  @post
  @doc("Get a pending chunk for a rover job.")
  op rover_get_pending_chunk(@body body: PendingChunkRequest): string;

  @route("/tools/rover_submit_extraction")
  @post
  @doc("Submit an extraction result for a rover job.")
  op rover_submit_extraction(@body body: ExtractionSubmitRequest): string;

  @route("/tools/rover_compile_agenda")
  @post
  @doc("Compile a rover job's agenda to a file.")
  op rover_compile_agenda(@body body: CompileAgendaRequest): string;

  @route("/tools/rover_job_status")
  @post
  @doc("Get a rover job's status.")
  op rover_job_status(@body body: JobStatusRequest): string;
}
