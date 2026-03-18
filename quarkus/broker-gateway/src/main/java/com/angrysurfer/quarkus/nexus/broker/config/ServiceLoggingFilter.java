package com.angrysurfer.quarkus.nexus.broker.config;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

import com.angrysurfer.spring.nexus.broker.api.ServiceRequest;
import com.angrysurfer.spring.nexus.broker.api.ServiceResponse;

import java.io.IOException;

@Provider
public class ServiceLoggingFilter implements ContainerRequestFilter, ContainerResponseFilter {

    private static final Logger log = Logger.getLogger(ServiceLoggingFilter.class);

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        String method = requestContext.getMethod();
        String path = requestContext.getUriInfo().getPath();
        String queryString = requestContext.getUriInfo().getRequestUri().getQuery();

        // Log the incoming request
        String fullUrl = queryString != null ? path + "?" + queryString : path;
        log.infof("Incoming request: %s %s", method, fullUrl);

        // Log request headers if needed
        if (log.isDebugEnabled()) {
            requestContext.getHeaders().forEach((name, values) -> log.debugf("Request header: %s = %s", name,
                    values.stream().map(Object::toString).collect(java.util.stream.Collectors.joining(", "))));
        }

        // For broker requests, log the ServiceRequest details if it's a POST with JSON
        // content
        if ("POST".equals(method) && requestContext.hasEntity() && path.contains("/broker")) {
            log.infof("Broker request to path: %s", path);
        }
    }

    @Override
    public void filter(ContainerRequestContext requestContext, ContainerResponseContext responseContext)
            throws IOException {
        String method = requestContext.getMethod();
        String path = requestContext.getUriInfo().getPath();
        int status = responseContext.getStatus();

        log.infof("Outgoing response: %s %s -> %d", method, path, status);

        // Log response headers if needed
        if (log.isDebugEnabled()) {
            responseContext.getHeaders().forEach((name, values) -> log.debugf("Response header: %s = %s", name,
                    values.stream().map(Object::toString).collect(java.util.stream.Collectors.joining(", "))));
        }

        // For broker responses, log ServiceResponse details if available
        if (responseContext.getEntity() != null && path.contains("/broker")) {
            try {
                if (responseContext.getEntity() instanceof ServiceResponse) {
                    ServiceResponse<?> serviceResponse = (ServiceResponse<?>) responseContext.getEntity();
                    log.infof("Broker response - OK: %s, RequestId: %s, Service: %s, Operation: %s",
                            serviceResponse.isOk(),
                            serviceResponse.getRequestId(),
                            serviceResponse.getService(),
                            serviceResponse.getOperation());
                } else {
                    log.infof("Response body: %s", responseContext.getEntity().toString());
                }
            } catch (Exception e) {
                log.warn("Could not log response entity", e);
            }
        } else if (responseContext.getEntity() != null) {
            log.infof("Response body: %s", responseContext.getEntity().toString());
        }
    }
}
