/**
 * User Creation Service Operations
 *
 * REST controller: POST /api/v1/users (UserCreationController).
 */
import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "../../../core/main.tsp";
import "../user-access-service/models.tsp";
import "./models.tsp";

using Http;
using Rest;

alias User = com.aibizarchitect.nexus.v1.spring.user;

namespace com.aibizarchitect.nexus.v1.spring.usercreation {

  @route("/api/v1/users")
  @tag("User Creation")
  interface UserCreation {
    @doc("Create a user. 201 on success; 400 on blank alias/identifier or duplicate alias.")
    @post create(@body resource: UserCreateRequest): User.UserRegistration;
  }
}
