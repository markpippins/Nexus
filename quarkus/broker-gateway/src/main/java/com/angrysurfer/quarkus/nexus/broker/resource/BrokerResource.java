package com.angrysurfer.quarkus.nexus.broker.resource;

import com.angrysurfer.quarkus.nexus.broker.service.IBrokerService;
import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class BrokerResource {

    @Inject
    IBrokerService brokerService;

    @POST
    @Path("/broker/submitRequest")
    public Response submitRequest(ServiceRequest request) {
        ServiceResponse<?> response = brokerService.submit(request);
        if (response.isOk()) {
            return Response.ok(response).build();
        } else {
            return Response.status(Response.Status.BAD_REQUEST).entity(response).build();
        }
    }

    @POST
    @Path("/broker/testBroker")
    public Response testBroker() {
        ServiceRequest request = new ServiceRequest("testBroker", "test",
                java.util.Collections.emptyMap(), "test-request");
        ServiceResponse<?> response = brokerService.submit(request);
        if (response.isOk()) {
            return Response.ok(response).build();
        } else {
            return Response.status(Response.Status.BAD_REQUEST).entity(response).build();
        }
    }

    @GET
    @Path("/health")
    public Response healthCheck() {
        return brokerService.healthCheck();
    }

    @GET
    @Path("/services")
    public Response listServices() {
        return Response.ok("Available services: user-service, file-service, login-service, search-service").build();
    }
}
