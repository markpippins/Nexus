package com.aibizarchitect.nexus.v1.spring.restfsservice;

import com.aibizarchitect.nexus.v1.spring.restfsservice.implementation.RestFsServiceClientImpl;

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
 * Initializes a new instance of the synchronous RestFsServiceClient type.
 */
@ServiceClient(builder = RestFsServiceClientBuilder.class)
public final class RestFsServiceClient {
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final RestFsServiceClientImpl serviceClient;

    private final Instrumentation instrumentation;

    /**
     * Initializes an instance of RestFsServiceClient class.
     * 
     * @param serviceClient the service client implementation.
     * @param instrumentation the instrumentation instance.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    RestFsServiceClient(RestFsServiceClientImpl serviceClient, Instrumentation instrumentation) {
        this.serviceClient = serviceClient;
        this.instrumentation = instrumentation;
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsListResponse> listFilesWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.listFiles", requestContext,
            updatedContext -> this.serviceClient.listFilesWithResponse(input, updatedContext));
    }

    /**
     * The listFiles operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsListResponse listFiles(FsRequest input) {
        return listFilesWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsListResponse> changeDirectoryWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.changeDirectory", requestContext,
            updatedContext -> this.serviceClient.changeDirectoryWithResponse(input, updatedContext));
    }

    /**
     * The changeDirectory operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsListResponse changeDirectory(FsRequest input) {
        return changeDirectoryWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> createDirectoryWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.createDirectory", requestContext,
            updatedContext -> this.serviceClient.createDirectoryWithResponse(input, updatedContext));
    }

    /**
     * The createDirectory operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse createDirectory(FsRequest input) {
        return createDirectoryWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> removeDirectoryWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.removeDirectory", requestContext,
            updatedContext -> this.serviceClient.removeDirectoryWithResponse(input, updatedContext));
    }

    /**
     * The removeDirectory operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse removeDirectory(FsRequest input) {
        return removeDirectoryWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> createFileWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.createFile", requestContext,
            updatedContext -> this.serviceClient.createFileWithResponse(input, updatedContext));
    }

    /**
     * The createFile operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse createFile(FsRequest input) {
        return createFileWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> deleteFileWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.deleteFile", requestContext,
            updatedContext -> this.serviceClient.deleteFileWithResponse(input, updatedContext));
    }

    /**
     * The deleteFile operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse deleteFile(FsRequest input) {
        return deleteFileWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> renameWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.rename", requestContext,
            updatedContext -> this.serviceClient.renameWithResponse(input, updatedContext));
    }

    /**
     * The rename operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse rename(FsRequest input) {
        return renameWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> renameItemWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.renameItem", requestContext,
            updatedContext -> this.serviceClient.renameItemWithResponse(input, updatedContext));
    }

    /**
     * The renameItem operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse renameItem(FsRequest input) {
        return renameItemWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> copyWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.copy", requestContext,
            updatedContext -> this.serviceClient.copyWithResponse(input, updatedContext));
    }

    /**
     * The copy operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse copy(FsRequest input) {
        return copyWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> moveWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.move", requestContext,
            updatedContext -> this.serviceClient.moveWithResponse(input, updatedContext));
    }

    /**
     * The move operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse move(FsRequest input) {
        return moveWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<FsOperationResponse> moveItemsWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.moveItems", requestContext,
            updatedContext -> this.serviceClient.moveItemsWithResponse(input, updatedContext));
    }

    /**
     * The moveItems operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public FsOperationResponse moveItems(FsRequest input) {
        return moveItemsWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<HasFileResponse> hasFileWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.hasFile", requestContext,
            updatedContext -> this.serviceClient.hasFileWithResponse(input, updatedContext));
    }

    /**
     * The hasFile operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public HasFileResponse hasFile(FsRequest input) {
        return hasFileWithResponse(input, RequestContext.none()).getValue();
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
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<HasFolderResponse> hasFolderWithResponse(FsRequest input, RequestContext requestContext) {
        return this.instrumentation.instrumentWithResponse("restFsService.hasFolder", requestContext,
            updatedContext -> this.serviceClient.hasFolderWithResponse(input, updatedContext));
    }

    /**
     * The hasFolder operation.
     * 
     * @param input The input parameter.
     * @throws IllegalArgumentException thrown if parameters fail the validation.
     * @throws HttpResponseException thrown if the service returns an error.
     * @throws RuntimeException all other wrapped checked exceptions if the request fails to be sent.
     * @return the response.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @ServiceMethod(returns = ReturnType.SINGLE)
    public HasFolderResponse hasFolder(FsRequest input) {
        return hasFolderWithResponse(input, RequestContext.none()).getValue();
    }
}
