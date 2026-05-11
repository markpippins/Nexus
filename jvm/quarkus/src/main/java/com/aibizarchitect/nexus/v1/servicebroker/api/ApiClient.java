package com.aibizarchitect.nexus.v1.servicebroker.api;

import com.aibizarchitect.nexus.v1.servicebroker.api.implementation.ApiClientImpl;
import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.annotations.ReturnType;
import io.clientcore.core.annotations.ServiceClient;
import io.clientcore.core.annotations.ServiceMethod;
import io.clientcore.core.http.models.HttpResponseException;
import io.clientcore.core.http.models.RequestContext;
import io.clientcore.core.http.models.Response;
import io.clientcore.core.instrumentation.Instrumentation;

/**
 * Initializes a new instance of the synchronous ApiClient type.
 */
@ServiceClient(builder = ApiClientBuilder.class)
public final class ApiClient {
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final ApiClientImpl serviceClient;

    private final Instrumentation instrumentation;

    /**
     * Initializes an instance of ApiClient class.
     * 
     * @param serviceClient the service client implementation.
     * @param instrumentation the instrumentation instance.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    ApiClient(ApiClientImpl serviceClient, Instrumentation instrumentation) {
        this.serviceClient = serviceClient;
        this.instrumentation = instrumentation;
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<ServiceResponseBody> submitRequestWithResponse(ServiceRequest request,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.servicebroker.api.submitRequest", requestContext,
            updatedContext -> this.serviceClient.submitRequestWithResponse(request, updatedContext));
    }

    /**
     * Submit a request to the service broker for processing.
     * 
     * This endpoint accepts a service request and routes it to the appropriate
     * target service for execution.
     * 
     * @param request The service request to process.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body returned by broker service operations.
     * This is the concrete type used in API responses.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public ServiceResponseBody submitRequest(ServiceRequest request) {
        return submitRequestWithResponse(request, RequestContext.none()).getValue();
    }
}
