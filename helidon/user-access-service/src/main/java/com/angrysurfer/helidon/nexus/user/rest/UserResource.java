package com.angrysurfer.helidon.nexus.user.rest;

import com.angrysurfer.helidon.nexus.user.service.UserAccessService;
import com.angrysurfer.spring.nexus.user.UserRegistrationDTO;

import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.FormParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/user")
@RequestScoped
public class UserResource {

    @Inject
    private UserAccessService userAccessService;

    @POST
    @Path("/validate")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Produces(MediaType.APPLICATION_JSON)
    public Response validateUser(@FormParam("alias") String alias, @FormParam("identifier") String password) {
        UserRegistrationDTO userDto = userAccessService.validateUser(alias, password);

        if (userDto != null) {
            return Response.ok(userDto).build();
        } else {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }
    }

    @GET
    @Path("/validate")
    @Produces(MediaType.APPLICATION_JSON)
    public Response validateUserGet(@QueryParam("alias") String alias, @QueryParam("identifier") String password) {
        UserRegistrationDTO userDto = userAccessService.validateUser(alias, password);

        if (userDto != null) {
            return Response.ok(userDto).build();
        } else {
            return Response.status(Response.Status.UNAUTHORIZED).build();
        }
    }
}
