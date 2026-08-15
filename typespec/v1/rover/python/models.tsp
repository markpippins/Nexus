/**
 * rover — TypeSpec Models
 *
 * Reverse-engineered from python/rover/rover_mcp_server.py (FastMCP).
 * No route or verb decorators live here.
 */
namespace org.nexus.rover {

  /** Transcript submission request. */
  model TranscriptSubmitRequest {
    transcriptPath: string;
  }

  /** Pending-chunk request. */
  model PendingChunkRequest {
    jobId: string;
    ollamaUrl?: string;
    `model`?: string;
  }

  /** Extraction submission request. */
  model ExtractionSubmitRequest {
    jobId: string;
    chunk?: string;
    extraction?: Record<unknown>;
  }

  /** Agenda compilation request. */
  model CompileAgendaRequest {
    jobId: string;
    outputPath: string;
  }

  /** Job status request. */
  model JobStatusRequest {
    jobId: string;
  }
}
