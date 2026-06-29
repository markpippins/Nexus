/**
 * Export Service Operations
 *
 * Export generation and configuration endpoints.
 * File and stream exports produce binary responses.
 */
import "@typespec/http";
import "@typespec/rest";
import "../../../core/main.tsp";
import "./models.tsp";

using Http;
using Rest;

namespace com.broker.shrapnel.export {

  @route("/exports")
  @tag("Export Service")
  interface ExportController {
    @doc("Generate an export and return the result as a file download")
    @post
    @route("/fileExport")
    fileExport(@body request: ExportRequest): bytes;

    @doc("Generate an export and return the result as a byte stream")
    @post
    @route("/streamExport")
    streamExport(@body request: ExportRequest): bytes;

    @doc("Flush the export configuration cache (reload from database)")
    @post
    @route("/flushConfig")
    flushConfig(): void;

    @doc("List configured export definitions")
    @post
    @route("/listExports")
    listExports(): string[];
  }
}
