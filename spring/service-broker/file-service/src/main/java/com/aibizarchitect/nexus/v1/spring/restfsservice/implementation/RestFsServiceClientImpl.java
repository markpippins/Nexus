package com.aibizarchitect.nexus.v1.spring.restfsservice.implementation;

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

import com.aibizarchitect.nexus.v1.spring.restfsservice.FsListResponse;
import com.aibizarchitect.nexus.v1.spring.restfsservice.FsOperationResponse;
import com.aibizarchitect.nexus.v1.spring.restfsservice.FsRequest;
import com.aibizarchitect.nexus.v1.spring.restfsservice.HasFileResponse;
import com.aibizarchitect.nexus.v1.spring.restfsservice.HasFolderResponse;

/**
 * Initializes a new instance of the RestFsServiceClient type.
 */
public final class RestFsServiceClientImpl {
    /**
     * The proxy service used to perform REST calls.
     */
    private final RestFsServiceClientService service;

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
     * Initializes an instance of RestFsServiceClient client.
     * 
     * @param httpPipeline The HTTP pipeline to send requests through.
     * @param instrumentation The instance of instrumentation to report telemetry.
     * @param endpoint Service host.
     */
    public RestFsServiceClientImpl(HttpPipeline httpPipeline, Instrumentation instrumentation, String endpoint) {
        this.httpPipeline = httpPipeline;
        this.instrumentation = instrumentation;
        this.endpoint = endpoint;
        this.service = RestFsServiceClientService.getNewInstance(this.httpPipeline);
    }

    /**
     * The interface defining all the services for RestFsServiceClient to be used by the proxy service to perform REST
     * calls.
     */
    @ServiceInterface(name = "RestFsServiceClient", host = "{endpoint}")
    public interface RestFsServiceClientService {
        static RestFsServiceClientService getNewInstance(HttpPipeline pipeline) {
            try {
                Class<?> clazz = Class.forName("restfsservice.implementation.RestFsServiceClientServiceImpl");
                return (RestFsServiceClientService) clazz.getMethod("getNewInstance", HttpPipeline.class)
                    .invoke(null, pipeline);
            } catch (ClassNotFoundException | NoSuchMethodException | IllegalAccessException
                | InvocationTargetException e) {
                throw new RuntimeException(e);
            }

        }

        @HttpRequestInformation(method = HttpMethod.POST, path = "/list", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsListResponse> listFiles(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") ListFilesRequest listFilesRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/cd", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsListResponse> changeDirectory(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") ChangeDirectoryRequest changeDirectoryRequest,
            RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/mkdir", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> createDirectory(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") CreateDirectoryRequest createDirectoryRequest,
            RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/rmdir", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> removeDirectory(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") RemoveDirectoryRequest removeDirectoryRequest,
            RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/touch", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> createFile(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") CreateFileRequest createFileRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/rm", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> deleteFile(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") DeleteFileRequest deleteFileRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/rename", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> rename(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") RenameRequest renameRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/rename-item", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> renameItem(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") RenameItemRequest renameItemRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/copy", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> copy(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") CopyRequest copyRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/move", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> move(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") MoveRequest moveRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/move-items", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<FsOperationResponse> moveItems(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") MoveItemsRequest moveItemsRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/has-file", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<HasFileResponse> hasFile(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") HasFileRequest hasFileRequest, RequestContext requestContext);

        @HttpRequestInformation(method = HttpMethod.POST, path = "/has-folder", expectedStatusCodes = { 200 })
        @UnexpectedResponseExceptionDetail
        Response<HasFolderResponse> hasFolder(@HostParam("endpoint") String endpoint,
            @HeaderParam("Content-Type") String contentType, @HeaderParam("Accept") String accept,
            @BodyParam("application/json") HasFolderRequest hasFolderRequest, RequestContext requestContext);
    }

    /**
     * The listFiles operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsListResponse> listFilesWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.listFiles", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                ListFilesRequest listFilesRequest = new ListFilesRequest(input);
                return service.listFiles(this.getEndpoint(), contentType, accept, listFilesRequest, updatedContext);
            });
    }

    /**
     * The changeDirectory operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsListResponse> changeDirectoryWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.changeDirectory", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                ChangeDirectoryRequest changeDirectoryRequest = new ChangeDirectoryRequest(input);
                return service.changeDirectory(this.getEndpoint(), contentType, accept, changeDirectoryRequest,
                    updatedContext);
            });
    }

    /**
     * The createDirectory operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> createDirectoryWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.createDirectory", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                CreateDirectoryRequest createDirectoryRequest = new CreateDirectoryRequest(input);
                return service.createDirectory(this.getEndpoint(), contentType, accept, createDirectoryRequest,
                    updatedContext);
            });
    }

    /**
     * The removeDirectory operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> removeDirectoryWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.removeDirectory", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                RemoveDirectoryRequest removeDirectoryRequest = new RemoveDirectoryRequest(input);
                return service.removeDirectory(this.getEndpoint(), contentType, accept, removeDirectoryRequest,
                    updatedContext);
            });
    }

    /**
     * The createFile operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> createFileWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.createFile", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                CreateFileRequest createFileRequest = new CreateFileRequest(input);
                return service.createFile(this.getEndpoint(), contentType, accept, createFileRequest, updatedContext);
            });
    }

    /**
     * The deleteFile operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> deleteFileWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.deleteFile", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                DeleteFileRequest deleteFileRequest = new DeleteFileRequest(input);
                return service.deleteFile(this.getEndpoint(), contentType, accept, deleteFileRequest, updatedContext);
            });
    }

    /**
     * The rename operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> renameWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.rename", requestContext, updatedContext -> {
            final String contentType = "application/json";
            final String accept = "application/json";
            RenameRequest renameRequest = new RenameRequest(input);
            return service.rename(this.getEndpoint(), contentType, accept, renameRequest, updatedContext);
        });
    }

    /**
     * The renameItem operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> renameItemWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.renameItem", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                RenameItemRequest renameItemRequest = new RenameItemRequest(input);
                return service.renameItem(this.getEndpoint(), contentType, accept, renameItemRequest, updatedContext);
            });
    }

    /**
     * The copy operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> copyWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.copy", requestContext, updatedContext -> {
            final String contentType = "application/json";
            final String accept = "application/json";
            CopyRequest copyRequest = new CopyRequest(input);
            return service.copy(this.getEndpoint(), contentType, accept, copyRequest, updatedContext);
        });
    }

    /**
     * The move operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> moveWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.move", requestContext, updatedContext -> {
            final String contentType = "application/json";
            final String accept = "application/json";
            MoveRequest moveRequest = new MoveRequest(input);
            return service.move(this.getEndpoint(), contentType, accept, moveRequest, updatedContext);
        });
    }

    /**
     * The moveItems operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> moveItemsWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.moveItems", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                MoveItemsRequest moveItemsRequest = new MoveItemsRequest(input);
                return service.moveItems(this.getEndpoint(), contentType, accept, moveItemsRequest, updatedContext);
            });
    }

    /**
     * The hasFile operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<HasFileResponse> hasFileWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.hasFile", requestContext, updatedContext -> {
            final String contentType = "application/json";
            final String accept = "application/json";
            HasFileRequest hasFileRequest = new HasFileRequest(input);
            return service.hasFile(this.getEndpoint(), contentType, accept, hasFileRequest, updatedContext);
        });
    }

    /**
     * The hasFolder operation.
     * 
     * @param input The input parameter.
     * @param requestContext The context to configure the HTTP request before HTTP client sends it.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response body along with {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<HasFolderResponse> hasFolderWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.hasFolder", requestContext,
            updatedContext -> {
                final String contentType = "application/json";
                final String accept = "application/json";
                HasFolderRequest hasFolderRequest = new HasFolderRequest(input);
                return service.hasFolder(this.getEndpoint(), contentType, accept, hasFolderRequest, updatedContext);
            });
    }
}
