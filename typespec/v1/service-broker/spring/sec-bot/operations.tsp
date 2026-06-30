/**
 * Broker Gateway Sec-Bot Operations
 *
 * Encrypt and decrypt broker message payloads using Jasypt.
 */
import "@typespec/http";
import "@typespec/rest";
import "../api/models.tsp";

using Http;
using Rest;

namespace com.aibizarchitect.nexus.v1.spring.secbot {

  @route("/secbot")
  @tag("Sec-Bot Encryption")
  interface SecBot {
    @doc("Encrypt a service response payload")
    @post
    @route("/encrypt")
    encrypt(
      @body response: com.aibizarchitect.nexus.v1.servicebroker.api.ServiceResponseBody
    ): com.aibizarchitect.nexus.v1.servicebroker.api.ServiceResponseBody;

    @doc("Decrypt a service request payload")
    @post
    @route("/decrypt")
    decrypt(
      @body request: com.aibizarchitect.nexus.v1.servicebroker.api.ServiceRequest
    ): com.aibizarchitect.nexus.v1.servicebroker.api.ServiceRequest;
  }
}
