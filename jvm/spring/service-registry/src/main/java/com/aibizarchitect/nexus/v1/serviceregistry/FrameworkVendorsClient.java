package com.aibizarchitect.nexus.v1.serviceregistry;

import com.aibizarchitect.nexus.v1.core.PagedResponseFrameworkVendor;
import com.aibizarchitect.nexus.v1.serviceregistry.implementation.FrameworkVendorsImpl;
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
 * Initializes a new instance of the synchronous ServiceregistryClient type.
 */
@ServiceClient(builder = ServiceregistryClientBuilder.class)
public final class FrameworkVendorsClient {
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final FrameworkVendorsImpl serviceClient;

    private final Instrumentation instrumentation;

    /**
     * Initializes an instance of FrameworkVendorsClient class.
     * 
     * @param serviceClient the service client implementation.
     * @param instrumentation the instrumentation instance.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    FrameworkVendorsClient(FrameworkVendorsImpl serviceClient, Instrumentation instrumentation) {
        this.serviceClient = serviceClient;
        this.instrumentation = instrumentation;
    }

    /**
     * Get all framework vendors.
     * 
     * @param page The page parameter.
     * @param size The size parameter.
     * @param sort The sort parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework vendors along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<PagedResponseFrameworkVendor> listWithResponse(Integer page, Integer size, String sort,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkVendors.list", requestContext,
            updatedContext -> this.serviceClient.listWithResponse(page, size, sort, updatedContext));
    }

    /**
     * Get all framework vendors.
     * 
     * @param page The page parameter.
     * @param size The size parameter.
     * @param sort The sort parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework vendors.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public PagedResponseFrameworkVendor list(Integer page, Integer size, String sort) {
        return listWithResponse(page, size, sort, RequestContext.none()).getValue();
    }

    /**
     * Get all framework vendors.
     * 
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework vendors.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public PagedResponseFrameworkVendor list() {
        final Integer page = null;
        final Integer size = null;
        final String sort = null;
        return listWithResponse(page, size, sort, RequestContext.none()).getValue();
    }

    /**
     * Get a framework vendor by ID.
     * 
     * @param id The id parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a framework vendor by ID along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkVendor> getWithResponse(long id, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkVendors.get", requestContext,
            updatedContext -> this.serviceClient.getWithResponse(id, updatedContext));
    }

    /**
     * Get a framework vendor by ID.
     * 
     * @param id The id parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a framework vendor by ID.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkVendor get(long id) {
        return getWithResponse(id, RequestContext.none()).getValue();
    }

    /**
     * Create a new framework vendor.
     * 
     * @param vendor The vendor parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkVendor> createWithResponse(FrameworkVendorCreate vendor, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkVendors.create", requestContext,
            updatedContext -> this.serviceClient.createWithResponse(vendor, updatedContext));
    }

    /**
     * Create a new framework vendor.
     * 
     * @param vendor The vendor parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkVendor create(FrameworkVendorCreate vendor) {
        return createWithResponse(vendor, RequestContext.none()).getValue();
    }

    /**
     * Update a framework vendor.
     * 
     * @param id The id parameter.
     * @param vendor The vendor parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkVendor> updateWithResponse(long id, FrameworkVendorUpdate vendor,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkVendors.update", requestContext,
            updatedContext -> this.serviceClient.updateWithResponse(id, vendor, updatedContext));
    }

    /**
     * Update a framework vendor.
     * 
     * @param id The id parameter.
     * @param vendor The vendor parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkVendor update(long id, FrameworkVendorUpdate vendor) {
        return updateWithResponse(id, vendor, RequestContext.none()).getValue();
    }

    /**
     * Delete a framework vendor.
     * 
     * @param id The id parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<Void> deleteWithResponse(long id, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkVendors.delete", requestContext,
            updatedContext -> this.serviceClient.deleteWithResponse(id, updatedContext));
    }

    /**
     * Delete a framework vendor.
     * 
     * @param id The id parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public void delete(long id) {
        deleteWithResponse(id, RequestContext.none());
    }
}
