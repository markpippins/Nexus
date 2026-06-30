/**
 * Upload Service Operations
 *
 * File upload endpoint for processing broker-submitted requests with file attachments.
 */
import "@typespec/http";
import "@typespec/rest";
import "../../../core/main.tsp";
import "./models.tsp";

using Http;
using Rest;

alias ServiceResp = com.aibizarchitect.nexus.v1.servicebroker.api.ServiceResponseBody;

namespace com.aibizarchitect.nexus.v1.spring.upload {

  @route("/api/upload")
  @tag("Upload Service")
  interface FileUpload {
    @doc("Submit a request with an attached file for processing")
    @post
    @route("/submitRequestWithFile")
    submitWithFile(@body body: FileUploadRequest): ServiceResp;
  }
}
