package com.aibizarchitect.nexus.v1.servicebroker.api.implementation;

import com.aibizarchitect.nexus.v1.servicebroker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.servicebroker.api.ServiceResponseBody;
import io.clientcore.core.annotations.ReturnType;
import io.clientcore.core.annotations.ServiceInterface;
import io.clientcore.core.annotations.ServiceMethod;
import io.clientcore.core.http.annotations.BodyParam;
import io.clientcore.core.http.annotations.HeaderParam;
import io.clientcore.core.http.annotations.HostParam;
import io.clientcore.core.http.annotations.HttpRequestInformation;
import io.clientcore.core.http.annotations.UnexpectedResponseExceptionDetail;
import io.clientcore.core.http.models.HttpMethod;
import io.clientcore.core.http.models.HttpResponseException;
import io.clientcore.core.http.models.RequestContext;
import io.clientcore.core.http.models.Response;
import io.clientcore.core.http.pipeline.HttpPipeline;
import io.clientcore.core.instrumentation.Instrumentation;
import java.lang.reflect.InvocationTargetException;

/**
 * Initializes a new instance of the ApiClient type.
 */
public final class ApiClientImpl {
    /**
     * The proxy service used to perform REST calls.
     */
    private final ApiClientService service;

    /**
     * Service host.
     */
    private final String endpoint;

    /**
     * Gets Service host.
     * 
     * @return the endpoint value.
     */
    public String getEndpoint() {
        return this.endpoint;
    }

    /**
     * The HTTP pipeline to send requests through.
     */
    private final HttpPipeline httpPipeline;

    /**
     * Gets The HTTP pipeline to send requests through.
     * 
     * @return the httpPipeline value.
     */
    public HttpPipeline getHttpPipeline() {
        return this.httpPipeline;
    }

    /**
     * The instance of instrumentation to report telemetry.
     */
    private final Instrumentation instrumentation;

    /**
     * Gets The instance of instrumentation to report telemetry.
     * 
     * @return the instrumentation value.
     */
    public Instrumentation getInstrumentation() {
        return this.instrumentation;
    }

    /**
     * Initializes an instance of ApiClient client.
     * 
     * @param httpPipeline The HTTP pipeline to send requests through.
     * @param instrumentation The instance of instrumentation to report telemetry.
     * @param endpoint Service host.
     */
    public ApiClientImpl(HttpPipeline httpPipeline, Instrumentation instrumentation, String endpoint) {
        this.httpPipeline = httpPipeline;
        this.instrumentation = instrumentation;
        this.endpoint = endpoint;
        this.service = ApiClientService.getNewInstance(this.httpPipeline);
    }

    /**
     * The interface defining all the services for ApiClient to be used by the proxy service to perform REST calls.
     */
    @ServiceInterface(name = "ApiClient", host = "{endpoint}")
    public interface ApiClientService {
        static ApiClientService getNewInstance(HttpPipeline pipeline) {
            try {
                Class<?> clazz = Class
                    .forName("com.aibizarchitect.nexus.v1.servicebroker.api.implementation.ApiClientServiceImpl");
                return (ApiClientService) clazz.getMethod("getNewInstance", HttpPipeline.class).invoke(null, pipeline);
            } catch (ClassNotFoundException | NoSuchMethodException | IllegalAccessException
                | InvocationTargetException e) {
                throw new RuntimeException(e);
            }

        }

        @HttpRequestInformation(method = HttpMethod.POST, path = "/api/v1/submitRequest", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<ServiceResponseBody> submitRequest(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") ServiceRequest request, RequestContext requestContext);
    }

    /**
     * Submit a request to the service broker for processing.
     * 
     * This endpoint accepts a service request and routes it to the appropriate
     * target service for execution.
     * 
     * @param request The service request to process.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body returned by broker service operations.
     * This is the concrete type used in API responses along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<ServiceResponseBody> submitRequestWithResponse(ServiceRequest request,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.servicebroker.api.submitRequest", requestContext, updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                return service.submitRequest(this.getEndpoint(), contentType, accept, request, updatedContext);
            });
    }
}
