package com.aibizarchitect.nexus.v1.spring.fs;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.fs.api.FsItem;
import com.aibizarchitect.nexus.v1.spring.fs.api.FsListResponse;
import com.aibizarchitect.nexus.v1.spring.restfsservice.FsOperationResponse;
import com.aibizarchitect.nexus.v1.spring.restfsservice.FsRequest;
import com.aibizarchitect.nexus.v1.spring.restfsservice.RestFsServiceClient;

/**
 * Wrapper around the TypeSpec-generated RestFsServiceClient.
 * This provides compatibility with the existing RestFsService layer
 * while using the generated client for HTTP communication.
 */
@Service("restFsClient")
public class RestFsClient {

    private final RestFsServiceClient client;

    public RestFsClient(RestFsServiceClient client) {
        this.client = client;
    }

    /**
     * Build an FsRequest with common fields.
     */
    private FsRequest createRequest(String alias, List<String> path, String operation) {
        FsRequest request = new FsRequest();
        request.setOperation(operation);
        request.setAlias(alias);
        request.setPath(path);
        return request;
    }

    // ===============================
    // Directory Operations
    // ===============================

    public FsListResponse listFiles(String alias, List<String> path) {
        FsRequest request = createRequest(alias, path, "ls");
        com.aibizarchitect.nexus.v1.spring.restfsservice.FsListResponse generatedResponse = client.listFiles(request);
        return convertToApiListResponse(generatedResponse);
    }

    public Map<String, Object> changeDirectory(String alias, List<String> path) {
        FsRequest request = createRequest(alias, path, "cd");
        com.aibizarchitect.nexus.v1.spring.restfsservice.FsListResponse response = client.changeDirectory(request);
        return toMap(response);
    }

    public Map<String, Object> createDirectory(String alias, List<String> path) {
        FsRequest request = createRequest(alias, path, "mkdir");
        FsOperationResponse response = client.createDirectory(request);
        return toMap(response);
    }

    public Map<String, Object> removeDirectory(String alias, List<String> path) {
        FsRequest request = createRequest(alias, path, "rmdir");
        FsOperationResponse response = client.removeDirectory(request);
        return toMap(response);
    }

    // ===============================
    // File Operations
    // ===============================

    public Map<String, Object> createFile(String alias, List<String> path, String filename) {
        FsRequest request = createRequest(alias, path, "newfile");
        request.setFilename(filename);
        FsOperationResponse response = client.createFile(request);
        return toMap(response);
    }

    public Map<String, Object> deleteFile(String alias, List<String> path, String filename) {
        FsRequest request = createRequest(alias, path, "deletefile");
        request.setFilename(filename);
        FsOperationResponse response = client.deleteFile(request);
        return toMap(response);
    }

    public Map<String, Object> rename(String alias, List<String> path, String newName) {
        FsRequest request = createRequest(alias, path, "rename");
        request.setNewName(newName);
        FsOperationResponse response = client.rename(request);
        return toMap(response);
    }

    public Map<String, Object> renameItem(String alias, List<String> path, String newName) {
        FsRequest request = createRequest(alias, path, "renameitem");
        request.setNewName(newName);
        FsOperationResponse response = client.renameItem(request);
        return toMap(response);
    }

    // ===============================
    // Copy/Move Operations
    // ===============================

    public Map<String, Object> copy(String fromAlias, List<String> fromPath, String toAlias, List<String> toPath) {
        FsRequest request = createRequest(fromAlias, fromPath, "copy");
        request.setToAlias(toAlias);
        request.setToPath(toPath);
        FsOperationResponse response = client.copy(request);
        return toMap(response);
    }

    public Map<String, Object> move(String fromAlias, List<String> fromPath, String toAlias, List<String> toPath) {
        FsRequest request = createRequest(fromAlias, fromPath, "move");
        request.setToAlias(toAlias);
        request.setToPath(toPath);
        FsOperationResponse response = client.move(request);
        return toMap(response);
    }

    public Map<String, Object> moveItems(String alias, List<String> sourcePath, List<String> destPath, List<Map<String, Object>> items) {
        FsRequest request = createRequest(alias, sourcePath, "moveitems");
        request.setToPath(destPath);
        // Note: items conversion may need refinement based on actual usage
        request.setItems(convertItems(items));
        FsOperationResponse response = client.moveItems(request);
        return toMap(response);
    }

    // ===============================
    // Existence Check Operations
    // ===============================

    public Map<String, Object> hasFile(String alias, List<String> path, String filename) {
        FsRequest request = createRequest(alias, path, "hasfile");
        request.setFilename(filename);
        var response = client.hasFile(request);
        Map<String, Object> result = new HashMap<>();
        result.put("exists", response.isExists());
        result.put("type", "file");
        return result;
    }

    public Map<String, Object> hasFolder(String alias, List<String> path, String foldername) {
        FsRequest request = createRequest(alias, path, "hasfolder");
        request.setFilename(foldername);
        var response = client.hasFolder(request);
        Map<String, Object> result = new HashMap<>();
        result.put("exists", response.isExists());
        result.put("type", "directory");
        return result;
    }

    // ===============================
    // Helper Methods
    // ===============================

    /**
     * Convert generated FsListResponse to API FsListResponse.
     */
    private FsListResponse convertToApiListResponse(com.aibizarchitect.nexus.v1.spring.restfsservice.FsListResponse generated) {
        if (generated == null) {
            return null;
        }
        FsListResponse api = new FsListResponse();
        api.setPath(generated.getPath());
        if (generated.getItems() != null) {
            api.setItems(generated.getItems().stream()
                .map(this::convertToApiFsItem)
                .collect(Collectors.toList()));
        }
        return api;
    }

    /**
     * Convert generated FsItem to API FsItem.
     */
    private FsItem convertToApiFsItem(com.aibizarchitect.nexus.v1.spring.restfsservice.FsItem generated) {
        if (generated == null) {
            return null;
        }
        FsItem api = new FsItem();
        api.setName(generated.getName());
        api.setType(generated.getType());
        api.setSize(generated.getSize());
        api.setLastModified(generated.getLastModified());
        api.setLastModifiedDate(generated.getLastModifiedDate());
        api.setUrl(generated.getUrl());
        api.setThumbnailUrl(generated.getThumbnailUrl());
        api.setDeleteUrl(generated.getDeleteUrl());
        api.setDeleteType(generated.getDeleteType());
        return api;
    }

    /**
     * Convert FsListResponse to Map for backward compatibility.
     */
    private Map<String, Object> toMap(com.aibizarchitect.nexus.v1.spring.restfsservice.FsListResponse response) {
        Map<String, Object> map = new HashMap<>();
        map.put("path", response.getPath());
        if (response.getItems() != null) {
            map.put("items", response.getItems().stream()
                .map(this::convertToApiFsItem)
                .collect(Collectors.toList()));
        }
        return map;
    }

    /**
     * Convert FsOperationResponse to Map for backward compatibility.
     */
    private Map<String, Object> toMap(FsOperationResponse response) {
        Map<String, Object> map = new HashMap<>();
        if (response.getPath() != null) map.put("path", response.getPath());
        if (response.getItems() != null) map.put("items", response.getItems());
        if (response.getCreated() != null) map.put("created", response.getCreated());
        if (response.getDeleted() != null) map.put("deleted", response.getDeleted());
        if (response.getCreatedFile() != null) map.put("created_file", response.getCreatedFile());
        if (response.getDeletedFile() != null) map.put("deleted_file", response.getDeletedFile());
        if (response.getRenamed() != null) map.put("renamed", response.getRenamed());
        if (response.getTo() != null) map.put("to", response.getTo());
        if (response.getCopied() != null) map.put("copied", response.getCopied());
        if (response.getMoved() != null) map.put("moved", response.getMoved());
        if (response.isExists() != null) map.put("exists", response.isExists());
        if (response.getType() != null) map.put("type", response.getType());
        return map;
    }

    /**
     * Convert items list to the format expected by the generated client.
     */
    private List<com.aibizarchitect.nexus.v1.spring.restfsservice.FsItemReference> convertItems(List<Map<String, Object>> items) {
        // This is a simplified conversion - may need refinement based on actual usage
        if (items == null) {
            return null;
        }
        return items.stream()
            .map(item -> {
                String typeStr = (String) item.get("type");
                com.aibizarchitect.nexus.v1.spring.restfsservice.FsItemReferenceType type = "folder".equalsIgnoreCase(typeStr) ?
                    com.aibizarchitect.nexus.v1.spring.restfsservice.FsItemReferenceType.FOLDER :
                    com.aibizarchitect.nexus.v1.spring.restfsservice.FsItemReferenceType.FILE;
                return new com.aibizarchitect.nexus.v1.spring.restfsservice.FsItemReference(
                    (String) item.get("name"),
                    type
                );
            })
            .toList();
    }
}
