package com.aibizarchitect.nexus.v1.serviceregistry;

import com.aibizarchitect.nexus.v1.core.PagedResponseFrameworkLanguage;
import com.aibizarchitect.nexus.v1.serviceregistry.implementation.FrameworkLanguagesImpl;
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
public final class FrameworkLanguagesClient {
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final FrameworkLanguagesImpl serviceClient;

    private final Instrumentation instrumentation;

    /**
     * Initializes an instance of FrameworkLanguagesClient class.
     * 
     * @param serviceClient the service client implementation.
     * @param instrumentation the instrumentation instance.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    FrameworkLanguagesClient(FrameworkLanguagesImpl serviceClient, Instrumentation instrumentation) {
        this.serviceClient = serviceClient;
        this.instrumentation = instrumentation;
    }

    /**
     * Get all framework languages.
     * 
     * @param page The page parameter.
     * @param size The size parameter.
     * @param sort The sort parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework languages along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<PagedResponseFrameworkLanguage> listWithResponse(Integer page, Integer size, String sort,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.list", requestContext,
            updatedContext -> this.serviceClient.listWithResponse(page, size, sort, updatedContext));
    }

    /**
     * Get all framework languages.
     * 
     * @param page The page parameter.
     * @param size The size parameter.
     * @param sort The sort parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework languages.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public PagedResponseFrameworkLanguage list(Integer page, Integer size, String sort) {
        return listWithResponse(page, size, sort, RequestContext.none()).getValue();
    }

    /**
     * Get all framework languages.
     * 
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return all framework languages.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public PagedResponseFrameworkLanguage list() {
        final Integer page = null;
        final Integer size = null;
        final String sort = null;
        return listWithResponse(page, size, sort, RequestContext.none()).getValue();
    }

    /**
     * Get a framework language by ID.
     * 
     * @param id The id parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a framework language by ID along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkLanguage> getWithResponse(long id, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.get", requestContext,
            updatedContext -> this.serviceClient.getWithResponse(id, updatedContext));
    }

    /**
     * Get a framework language by ID.
     * 
     * @param id The id parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return a framework language by ID.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkLanguage get(long id) {
        return getWithResponse(id, RequestContext.none()).getValue();
    }

    /**
     * Create a new framework language.
     * 
     * @param language The language parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkLanguage> createWithResponse(FrameworkLanguageCreate language,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.create", requestContext,
            updatedContext -> this.serviceClient.createWithResponse(language, updatedContext));
    }

    /**
     * Create a new framework language.
     * 
     * @param language The language parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkLanguage create(FrameworkLanguageCreate language) {
        return createWithResponse(language, RequestContext.none()).getValue();
    }

    /**
     * Update a framework language.
     * 
     * @param id The id parameter.
     * @param language The language parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkLanguage> updateWithResponse(long id, FrameworkLanguageUpdate language,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.update", requestContext,
            updatedContext -> this.serviceClient.updateWithResponse(id, language, updatedContext));
    }

    /**
     * Update a framework language.
     * 
     * @param id The id parameter.
     * @param language The language parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FrameworkLanguage update(long id, FrameworkLanguageUpdate language) {
        return updateWithResponse(id, language, RequestContext.none()).getValue();
    }

    /**
     * Delete a framework language.
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
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.delete", requestContext,
            updatedContext -> this.serviceClient.deleteWithResponse(id, updatedContext));
    }

    /**
     * Delete a framework language.
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
