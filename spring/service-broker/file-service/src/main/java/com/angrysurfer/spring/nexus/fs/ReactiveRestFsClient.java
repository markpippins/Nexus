package com.angrysurfer.spring.nexus.fs;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import com.angrysurfer.spring.nexus.fs.api.FsListResponse;
import com.angrysurfer.spring.nexus.fs.api.FsRequest;

import reactor.core.publisher.Mono;

@Service("reactiveRestFsClient")
public class ReactiveRestFsClient {

    private final WebClient webClient;

    public ReactiveRestFsClient(WebClient restFsWebClient) {
        this.webClient = restFsWebClient;
    }

    // Generic POST
    private <T> Mono<T> post(FsRequest request, Class<T> responseType) {
        return webClient.post()
                .uri("") // base URL from WebClient builder
                .bodyValue(request)
                .retrieve()
                .bodyToMono(responseType);
    }

    // ===============================
    // Directory Operations
    // ===============================

    public Mono<FsListResponse> listFiles(String alias, List<String> path) {
        FsRequest req = new FsRequest(alias, path, "ls");
        return post(req, FsListResponse.class);
    }

    public Mono<Map> changeDirectory(String alias, List<String> path) {
        FsRequest req = new FsRequest(alias, path, "cd");
        return post(req, Map.class);
    }

    public Mono<Map> createDirectory(String alias, List<String> path) {
        FsRequest req = new FsRequest(alias, path, "mkdir");
        return post(req, Map.class);
    }

    public Mono<Map> removeDirectory(String alias, List<String> path) {
        FsRequest req = new FsRequest();
        req.setAlias(alias);
        req.setPath(path);
        req.setOperation("rmdir");
        return post(req, Map.class);
    }

    // ===============================
    // File Operations
    // ===============================

    public Mono<Map> createFile(String alias, List<String> path, String filename) {
        FsRequest req = new FsRequest(alias, path, "newfile");
        req.setFilename(filename);
        return post(req, Map.class);
    }

    public Mono<Map> deleteFile(String alias, List<String> path, String filename) {
        FsRequest req = new FsRequest();
        req.setAlias(alias);
        req.setPath(path);
        req.setOperation("deletefile");
        req.setFilename(filename);
        return post(req, Map.class);
    }

    public Mono<Map> rename(String alias, List<String> path, String newName) {
        FsRequest req = new FsRequest(alias, path, "rename");
        req.setNewName(newName);
        return post(req, Map.class);
    }

    public Mono<Map> renameItem(String alias, List<String> path, String newName) {
        FsRequest req = new FsRequest(alias, path, "renameitem");
        req.setNewName(newName);
        return post(req, Map.class);
    }

    public Mono<Map> copy(String fromAlias, List<String> fromPath, String toAlias, List<String> toPath) {
        FsRequest req = new FsRequest(fromAlias, fromPath, "copy");
        req.setToAlias(toAlias);
        req.setToPath(toPath);
        return post(req, Map.class);
    }

    public Mono<Map> move(String fromAlias, List<String> fromPath, String toAlias, List<String> toPath) {
        FsRequest req = new FsRequest(fromAlias, fromPath, "move");
        req.setToAlias(toAlias);
        req.setToPath(toPath);
        return post(req, Map.class);
    }

    public Mono<Map> moveItems(String alias, List<String> sourcePath, List<String> destPath, List<Map<String, Object>> items) {
        FsRequest req = new FsRequest(alias, sourcePath, "moveitems");
        req.setToPath(destPath);
        req.setItems(items);
        return post(req, Map.class);
    }
}