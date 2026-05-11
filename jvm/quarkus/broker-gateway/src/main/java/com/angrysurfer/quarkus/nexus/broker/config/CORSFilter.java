package com.angrysurfer.quarkus.nexus.broker.config;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;

@Provider
public class CORSFilter implements ContainerResponseFilter {

    @Override
    public void filter(ContainerRequestContext requestContext, ContainerResponseContext responseContext)
            throws IOException {
        // Check the Origin header from the request to set a specific origin instead of
        // wildcard
        String origin = requestContext.getHeaders().getFirst("Origin");

        if (origin != null) {
            // Only set Access-Control-Allow-Origin to the actual origin when credentials
            // are allowed
            responseContext.getHeaders().add("Access-Control-Allow-Origin", origin);
        } else {
            // Fallback to wildcard if no origin is specified (for non-browser requests)
            responseContext.getHeaders().add("Access-Control-Allow-Origin", "*");
        }

        responseContext.getHeaders().add("Access-Control-Allow-Credentials", "true");
        responseContext.getHeaders().add("Access-Control-Allow-Headers",
                "origin, content-type, accept, authorization, x-requested-with, X-Custom-Header, Content-Type");
        responseContext.getHeaders().add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
        responseContext.getHeaders().add("Access-Control-Expose-Headers",
                "Content-Disposition, Content-Type, Location");
    }
}
