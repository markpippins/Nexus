package com.aibizarchitect.nexus.v1.serviceregistry;

import com.aibizarchitect.nexus.v1.core.PagedResponseFrameworkCategory;
import com.aibizarchitect.nexus.v1.serviceregistry.implementation.FrameworkCategoriesImpl;
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
public final class FrameworkCategoriesClient {
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final FrameworkCategoriesImpl serviceClient;

    private final Instrumentation instrumentation;

    /**
     * Initializes an instance of FrameworkCategoriesClient class.
     * 
     * @param serviceClient the service client implementation.
     * @param instrumentation the instrumentation instance.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    FrameworkCategoriesClient(FrameworkCategoriesImpl serviceClient, Instrumentation instrumentation) {
        this.serviceClient = serviceClient;
        this.instrumentation = instrumentation;
    }

    /**
     * Get all framework categories.
     * 
     * @param page The page parameter.
     * @param size The size parameter.
     * @param sort The sort parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework categories along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<PagedResponseFrameworkCategory> listWithResponse(Integer page, Integer size, String sort,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.list", requestContext,
            updatedContext -> this.serviceClient.listWithResponse(page, size, sort, updatedContext));
    }

    /**
     * Get all framework categories.
     * 
     * @param page The page parameter.
     * @param size The size parameter.
     * @param sort The sort parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework categories.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public PagedResponseFrameworkCategory list(Integer page, Integer size, String sort) {
        return listWithResponse(page, size, sort, RequestContext.none()).getValue();
    }

    /**
     * Get all framework categories.
     * 
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework categories.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public PagedResponseFrameworkCategory list() {
        final Integer page = null;
        final Integer size = null;
        final String sort = null;
        return listWithResponse(page, size, sort, RequestContext.none()).getValue();
    }

    /**
     * Get a framework category by ID.
     * 
     * @param id The id parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a framework category by ID along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkCategory> getWithResponse(long id, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.get", requestContext,
            updatedContext -> this.serviceClient.getWithResponse(id, updatedContext));
    }

    /**
     * Get a framework category by ID.
     * 
     * @param id The id parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a framework category by ID.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkCategory get(long id) {
        return getWithResponse(id, RequestContext.none()).getValue();
    }

    /**
     * Create a new framework category.
     * 
     * @param category The category parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkCategory> createWithResponse(FrameworkCategoryCreate category,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.create", requestContext,
            updatedContext -> this.serviceClient.createWithResponse(category, updatedContext));
    }

    /**
     * Create a new framework category.
     * 
     * @param category The category parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkCategory create(FrameworkCategoryCreate category) {
        return createWithResponse(category, RequestContext.none()).getValue();
    }

    /**
     * Update a framework category.
     * 
     * @param id The id parameter.
     * @param category The category parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkCategory> updateWithResponse(long id, FrameworkCategoryUpdate category,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.update", requestContext,
            updatedContext -> this.serviceClient.updateWithResponse(id, category, updatedContext));
    }

    /**
     * Update a framework category.
     * 
     * @param id The id parameter.
     * @param category The category parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkCategory update(long id, FrameworkCategoryUpdate category) {
        return updateWithResponse(id, category, RequestContext.none()).getValue();
    }

    /**
     * Delete a framework category.
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
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.delete", requestContext,
            updatedContext -> this.serviceClient.deleteWithResponse(id, updatedContext));
    }

    /**
     * Delete a framework category.
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
