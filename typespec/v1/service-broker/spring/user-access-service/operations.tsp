/**
 * User Access Service Operations
 *
 * User validation endpoint.
 */
import "@typespec/http";
import "@typespec/rest";
import "../../../core/main.tsp";
import "./models.tsp";

using Http;
using Rest;

namespace com.aibizarchitect.nexus.v1.spring.user {

  @route("/user")
  @tag("User Access")
  interface UserValidation {
    @doc("Validate user credentials by alias and identifier")
    @post
    @route("/validate")
    validate(
      @query userAlias: string,
      @query identifier: string
    ): com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;
  }
}
