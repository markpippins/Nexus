package com.aibizarchitect.nexus.v1.spring.fs;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.broker.Broker;
import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerOperation;
import com.aibizarchitect.nexus.v1.spring.broker.spi.BrokerParam;
import com.aibizarchitect.nexus.v1.spring.fs.api.FsListResponse;
import com.aibizarchitect.nexus.v1.user.UserRegistrationDTO;

@Service
@Qualifier("restFsService")
public class RestFsService {

    private static final Logger log = LoggerFactory.getLogger(RestFsService.class);

    private final RestFsClient restFsClient;
    private final ReactiveRestFsClient reactiveRestFsClient;
    private final Broker broker;

    private List<String> getUserPath(String token, List<String> path) {
        var userPath = new ArrayList<String>();
        userPath.add("users");

        // Get the user alias from the login service using the token through the broker
        if (Objects.nonNull(token)) {
            var userAlias = getUserAliasFromToken(token);
            if (userAlias != null) {
                userPath.add(userAlias);
            } else {
                // In case of error, we might want to throw an exception or handle it
                // appropriately
                throw new RuntimeException("Invalid token or user not found");
            }
        } else {
            throw new RuntimeException("Token is required to get user path");
        }

        if (Objects.nonNull(path))
            userPath.addAll(path);
        return userPath;
    }

    public RestFsService(@Qualifier("restFsClient") RestFsClient restFsClient,
            @Qualifier("reactiveRestFsClient") ReactiveRestFsClient reactiveRestFsClient,
            Broker broker) {
        this.restFsClient = restFsClient;
        this.reactiveRestFsClient = reactiveRestFsClient;
        this.broker = broker;
        log.info("RestFsService initialized with broker integration");
    }

    private String getUserAliasFromToken(String token) {
        try {
            ServiceRequest request = new ServiceRequest(
                    "loginService",
                    "getUserRegistrationForToken",
                    Map.of("token", token),
                    "get-user-alias-" + System.currentTimeMillis());

            ServiceResponse<?> response = (ServiceResponse<?>) broker.submit(request);

            if (response.isOk() && response.getData() != null) {
                // The response data might be a Map instead of UserRegistrationDTO due to
                // serialization
                Object data = response.getData();
                if (data instanceof UserRegistrationDTO) {
                    return ((UserRegistrationDTO) data).getAlias();
                } else if (data instanceof Map) {
                    // Extract alias from the map representation
                    @SuppressWarnings("unchecked")
                    Map<String, Object> dataMap = (Map<String, Object>) data;
                    return (String) dataMap.get("alias");
                } else {
                    log.warn("Unexpected data type returned from user registration service: {}", data.getClass());
                    return null;
                }
            } else {
                log.warn("Failed to get user registration for token: {}", token);
                return null;
            }
        } catch (Exception e) {
            log.error("Error getting user alias from token: ", e);
            return null;
        }
    }

    @BrokerOperation("listFiles")
    public FsListResponse listFiles(@BrokerParam("token") String token, @BrokerParam("path") List<String> path) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.listFiles(alias, path);
    }

    @BrokerOperation("changeDirectory")
    public Map<String, Object> changeDirectory(@BrokerParam("token") String token,
            @BrokerParam("path") List<String> path) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.changeDirectory(alias, path);
    }

    @BrokerOperation("createDirectory")
    public Map<String, Object> createDirectory(@BrokerParam("token") String token,
            @BrokerParam("path") List<String> path) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.createDirectory(alias, path);
    }

    @BrokerOperation("removeDirectory")
    public Map<String, Object> removeDirectory(@BrokerParam("token") String token,
            @BrokerParam("path") List<String> path) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.removeDirectory(alias, path);
    }

    @BrokerOperation("createFile")
    public Map<String, Object> createFile(@BrokerParam("token") String token, @BrokerParam("path") List<String> path,
            @BrokerParam("filename") String filename) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.createFile(alias, path, filename);
    }

    @BrokerOperation("deleteFile")
    public Map<String, Object> deleteFile(@BrokerParam("token") String token, @BrokerParam("path") List<String> path,
            @BrokerParam("filename") String filename) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.deleteFile(alias, path, filename);
    }

    @BrokerOperation("rename")
    public Map<String, Object> rename(@BrokerParam("token") String token,
            @BrokerParam("fromPath") List<String> fromPath,
            @BrokerParam("toPath") List<String> toPath) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        // Extract newName from the last element of toPath
        if (toPath == null || toPath.isEmpty()) {
            throw new RuntimeException("Destination path is required for rename operation");
        }
        String newName = toPath.get(toPath.size() - 1);
        return restFsClient.rename(alias, fromPath, newName);
    }

    @BrokerOperation("renameItem")
    public Map<String, Object> renameItem(@BrokerParam("token") String token, @BrokerParam("path") List<String> path,
            @BrokerParam("newName") String newName) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.renameItem(alias, path, newName);
    }

    @BrokerOperation("copy")
    public Map<String, Object> copy(@BrokerParam("fromToken") String fromToken,
            @BrokerParam("fromPath") List<String> fromPath,
            @BrokerParam("toToken") String toToken, @BrokerParam("toPath") List<String> toPath) {
        if (fromToken == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        if (toToken == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String fromAlias = getUserAliasFromToken(fromToken);
        String toAlias = getUserAliasFromToken(toToken);
        if (fromAlias == null) {
            throw new RuntimeException("Invalid 'from' token or user not found");
        }
        if (toAlias == null) {
            throw new RuntimeException("Invalid 'to' token or user not found");
        }
        return restFsClient.copy(fromAlias, fromPath, toAlias, toPath);
    }

    @BrokerOperation("hasFile")
    public Map<String, Object> hasFile(@BrokerParam("token") String token, @BrokerParam("path") List<String> path,
            @BrokerParam("filename") String filename) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.hasFile(alias, path, filename);
    }

    @BrokerOperation("hasFolder")
    public Map<String, Object> hasFolder(@BrokerParam("token") String token, @BrokerParam("path") List<String> path,
            @BrokerParam("foldername") String foldername) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.hasFolder(alias, path, foldername);
    }

    @BrokerOperation("moveItems")
    public Map<String, Object> moveItems(@BrokerParam("token") String token,
            @BrokerParam("sourcePath") List<String> sourcePath,
            @BrokerParam("destPath") List<String> destPath,
            @BrokerParam("items") List<Map<String, Object>> items) {
        if (token == null) {
            throw new RuntimeException("Token is required to get user path");
        }
        String alias = getUserAliasFromToken(token);
        if (alias == null) {
            throw new RuntimeException("Invalid token or user not found");
        }
        return restFsClient.moveItems(alias, sourcePath, destPath, items);
    }

}
