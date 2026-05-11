package com.aibizarchitect.nexus.v1.serviceregistry.implementation;

import com.aibizarchitect.nexus.v1.core.PagedResponseFrameworkLanguage;
import com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguage;
import com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguageCreate;
import com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguageUpdate;
import io.clientcore.core.annotations.ReturnType;
import io.clientcore.core.annotations.ServiceInterface;
import io.clientcore.core.annotations.ServiceMethod;
import io.clientcore.core.http.annotations.BodyParam;
import io.clientcore.core.http.annotations.HeaderParam;
import io.clientcore.core.http.annotations.HostParam;
import io.clientcore.core.http.annotations.HttpRequestInformation;
import io.clientcore.core.http.annotations.PathParam;
import io.clientcore.core.http.annotations.QueryParam;
import io.clientcore.core.http.annotations.UnexpectedResponseExceptionDetail;
import io.clientcore.core.http.models.HttpMethod;
import io.clientcore.core.http.models.HttpResponseException;
import io.clientcore.core.http.models.RequestContext;
import io.clientcore.core.http.models.Response;
import io.clientcore.core.http.pipeline.HttpPipeline;
import io.clientcore.core.instrumentation.Instrumentation;
import java.lang.reflect.InvocationTargetException;

/**
 * An instance of this class provides access to all the operations defined in FrameworkLanguages.
 */
public final class FrameworkLanguagesImpl {
    /**
     * The proxy service used to perform REST calls.
     */
    private final FrameworkLanguagesService service;

    /**
     * The service client containing this operation class.
     */
    private final ServiceregistryClientImpl client;

    /**
     * The instance of instrumentation to report telemetry.
     */
    private final Instrumentation instrumentation;

    /**
     * Initializes an instance of FrameworkLanguagesImpl.
     * 
     * @param client the instance of the service client containing this operation class.
     */
    FrameworkLanguagesImpl(ServiceregistryClientImpl client) {
        this.service = FrameworkLanguagesService.getNewInstance(client.getHttpPipeline());
        this.client = client;
        this.instrumentation = client.getInstrumentation();
    }

    /**
     * The interface defining all the services for ServiceregistryClientFrameworkLanguages to be used by the proxy
     * service to perform REST calls.
     */
    @ServiceInterface(name = "ServiceregistryClientFrameworkLanguages", host = "{endpoint}")
    public interface FrameworkLanguagesService {
        static FrameworkLanguagesService getNewInstance(HttpPipeline pipeline) {
            try {
                Class<?> clazz = Class.forName(
                    "com.aibizarchitect.nexus.v1.serviceregistry.implementation.FrameworkLanguagesServiceImpl");
                return (FrameworkLanguagesService) clazz.getMethod("getNewInstance", HttpPipeline.class)
                    .invoke(null, pipeline);
            } catch (ClassNotFoundException | NoSuchMethodException | IllegalAccessException
                | InvocationTargetException e) {
                throw new RuntimeException(e);
            }

        }

        @HttpRequestInformation(
            method = HttpMethod.GET,
            path = "/api/v1/framework-languages",
            expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<PagedResponseFrameworkLanguage> list(@HostParam("endpoint") String endpoint,
            @QueryParam("page") Integer page, @QueryParam("size") Integer size, @QueryParam("sort") String sort,
            @HeaderParam("Accept") String accept, RequestContext requestContext);

        @HttpRequestInformation(
            method = HttpMethod.GET,
            path = "/api/v1/framework-languages/{id}",
            expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FrameworkLanguage> get(@HostParam("endpoint") String endpoint, @PathParam("id") long id,
            @HeaderParam("Accept") String accept, RequestContext requestContext);

        @HttpRequestInformation(
            method = HttpMethod.POST,
            path = "/api/v1/framework-languages",
            expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FrameworkLanguage> create(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") FrameworkLanguageCreate language, RequestContext requestContext);

        @HttpRequestInformation(
            method = HttpMethod.PUT,
            path = "/api/v1/framework-languages/{id}",
            expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FrameworkLanguage> update(@HostParam("endpoint") String endpoint, @PathParam("id") long id,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") FrameworkLanguageUpdate language, RequestContext requestContext);

        @HttpRequestInformation(
            method = HttpMethod.DELETE,
            path = "/api/v1/framework-languages/{id}",
            expectedStatusCodes = { 204 })
        @UnexpectedResponseExceptionDetail
        Response<Void> delete(@HostParam("endpoint") String endpoint, @PathParam("id") long id,
            RequestContext requestContext);
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<PagedResponseFrameworkLanguage> listWithResponse(Integer page, Integer size, String sort,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.list", requestContext, updatedContext -> {
                final String accept = "application/json";
                return service.list(this.client.getEndpoint(), page, size, sort, accept, updatedContext);
            });
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkLanguage> getWithResponse(long id, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.get", requestContext, updatedContext -> {
                final String accept = "application/json";
                return service.get(this.client.getEndpoint(), id, accept, updatedContext);
            });
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkLanguage> createWithResponse(FrameworkLanguageCreate language,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.create", requestContext, updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                return service.create(this.client.getEndpoint(), contentType, accept, language, updatedContext);
            });
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkLanguage> updateWithResponse(long id, FrameworkLanguageUpdate language,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.update", requestContext, updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                return service.update(this.client.getEndpoint(), id, contentType, accept, language, updatedContext);
            });
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<Void> deleteWithResponse(long id, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkLanguages.delete", requestContext, updatedContext -> {
                return service.delete(this.client.getEndpoint(), id, updatedContext);
            });
    }
}
