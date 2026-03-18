package com.angrysurfer.quarkus.nexus.broker.client;

import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@RegisterRestClient(configKey = "external-api")
@Path("/api")
public interface ExternalApiService {

    @GET
    @Path("/health")
    String getHealth();

    @POST
    @Path("/process")
    @Consumes(MediaType.TEXT_PLAIN)
    @Produces(MediaType.TEXT_PLAIN)
    String processData(String data);
}
