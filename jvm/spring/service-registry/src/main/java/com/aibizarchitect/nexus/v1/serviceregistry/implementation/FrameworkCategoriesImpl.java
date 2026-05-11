package com.aibizarchitect.nexus.v1.serviceregistry.implementation;

import com.aibizarchitect.nexus.v1.core.PagedResponseFrameworkCategory;
import com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategory;
import com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategoryCreate;
import com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategoryUpdate;
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
 * An instance of this class provides access to all the operations defined in FrameworkCategories.
 */
public final class FrameworkCategoriesImpl {
    /**
     * The proxy service used to perform REST calls.
     */
    private final FrameworkCategoriesService service;

    /**
     * The service client containing this operation class.
     */
    private final ServiceregistryClientImpl client;

    /**
     * The instance of instrumentation to report telemetry.
     */
    private final Instrumentation instrumentation;

    /**
     * Initializes an instance of FrameworkCategoriesImpl.
     * 
     * @param client the instance of the service client containing this operation class.
     */
    FrameworkCategoriesImpl(ServiceregistryClientImpl client) {
        this.service = FrameworkCategoriesService.getNewInstance(client.getHttpPipeline());
        this.client = client;
        this.instrumentation = client.getInstrumentation();
    }

    /**
     * The interface defining all the services for ServiceregistryClientFrameworkCategories to be used by the proxy
     * service to perform REST calls.
     */
    @ServiceInterface(name = "ServiceregistryClientFrameworkCategories", host = "{endpoint}")
    public interface FrameworkCategoriesService {
        static FrameworkCategoriesService getNewInstance(HttpPipeline pipeline) {
            try {
                Class<?> clazz = Class.forName(
                    "com.aibizarchitect.nexus.v1.serviceregistry.implementation.FrameworkCategoriesServiceImpl");
                return (FrameworkCategoriesService) clazz.getMethod("getNewInstance", HttpPipeline.class)
                    .invoke(null, pipeline);
            } catch (ClassNotFoundException | NoSuchMethodException | IllegalAccessException
                | InvocationTargetException e) {
                throw new RuntimeException(e);
            }

        }

        @HttpRequestInformation(
            method = HttpMethod.GET,
            path = "/api/v1/framework-categories",
            expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<PagedResponseFrameworkCategory> list(@HostParam("endpoint") String endpoint,
            @QueryParam("page") Integer page, @QueryParam("size") Integer size, @QueryParam("sort") String sort,
            @HeaderParam("Accept") String accept, RequestContext requestContext);

        @HttpRequestInformation(
            method = HttpMethod.GET,
            path = "/api/v1/framework-categories/{id}",
            expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FrameworkCategory> get(@HostParam("endpoint") String endpoint, @PathParam("id") long id,
            @HeaderParam("Accept") String accept, RequestContext requestContext);

        @HttpRequestInformation(
            method = HttpMethod.POST,
            path = "/api/v1/framework-categories",
            expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FrameworkCategory> create(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") FrameworkCategoryCreate category, RequestContext requestContext);

        @HttpRequestInformation(
            method = HttpMethod.PUT,
            path = "/api/v1/framework-categories/{id}",
            expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FrameworkCategory> update(@HostParam("endpoint") String endpoint, @PathParam("id") long id,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") FrameworkCategoryUpdate category, RequestContext requestContext);

        @HttpRequestInformation(
            method = HttpMethod.DELETE,
            path = "/api/v1/framework-categories/{id}",
            expectedStatusCodes = { 204 })
        @UnexpectedResponseExceptionDetail
        Response<Void> delete(@HostParam("endpoint") String endpoint, @PathParam("id") long id,
            RequestContext requestContext);
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<PagedResponseFrameworkCategory> listWithResponse(Integer page, Integer size, String sort,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.list", requestContext, updatedContext -> {
                final String accept = "application/json";
                return service.list(this.client.getEndpoint(), page, size, sort, accept, updatedContext);
            });
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkCategory> getWithResponse(long id, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.get", requestContext, updatedContext -> {
                final String accept = "application/json";
                return service.get(this.client.getEndpoint(), id, accept, updatedContext);
            });
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkCategory> createWithResponse(FrameworkCategoryCreate category,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.create", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                return service.create(this.client.getEndpoint(), contentType, accept, category, updatedContext);
            });
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FrameworkCategory> updateWithResponse(long id, FrameworkCategoryUpdate category,
        RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.update", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                return service.update(this.client.getEndpoint(), id, contentType, accept, category, updatedContext);
            });
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
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<Void> deleteWithResponse(long id, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse(
            "com.aibizarchitect.nexus.v1.serviceregistry.FrameworkCategories.delete", requestContext,
            updatedContext -> {
                return service.delete(this.client.getEndpoint(), id, updatedContext);
            });
    }
}
