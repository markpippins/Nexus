package com.aibizarchitect.nexus.v1.spring.fs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.aibizarchitect.nexus.v1.broker.api.ServiceRequest;
import com.aibizarchitect.nexus.v1.broker.api.ServiceResponse;
import com.aibizarchitect.nexus.v1.spring.broker.Broker;
import com.aibizarchitect.nexus.v1.spring.fs.api.FsListResponse;

@ExtendWith(MockitoExtension.class)
class RestFsServiceTest {

    @Mock
    private RestFsClient restFsClient;

    @Mock
    private ReactiveRestFsClient reactiveRestFsClient;

    @Mock
    private Broker broker;

    private RestFsService restFsService;

    @BeforeEach
    void setUp() {
        restFsService = new RestFsService(restFsClient, reactiveRestFsClient, broker);
    }

    @Test
    void testListFilesSuccess() {
        // Arrange
        String token = "test-token";
        List<String> path = Arrays.asList("home", "user");
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        FsListResponse mockResponse = new FsListResponse();
        mockResponse.setPath(path);
        mockResponse.setItems(Arrays.asList());

        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).listFiles(anyString(), anyList());

        // Act
        var result = restFsService.listFiles(token, path);

        // Assert
        assertNotNull(result);
        verify(restFsClient).listFiles(anyString(), eq(path));
    }

    @Test
    void testListFilesWithInvalidToken() {
        // Arrange
        String token = "invalid-token";
        List<String> path = Arrays.asList("home", "user");
        // ServiceResponse with error for invalid token
        ServiceResponse<?> serviceResponse = ServiceResponse.error(List.of(Map.of("error", "User not found")),
                "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));

        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class,
                () -> restFsService.listFiles(token, path));

        assertTrue(exception.getMessage().contains("Invalid token or user not found"));
    }

    @Test
    void testChangeDirectorySuccess() {
        // Arrange
        String token = "test-token";
        List<String> path = Arrays.asList("home", "user");
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        Map<String, Object> mockResponse = Map.of("path", "home/user");
        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).changeDirectory(anyString(), anyList());

        // Act
        var result = restFsService.changeDirectory(token, path);

        // Assert
        assertNotNull(result);
        verify(restFsClient).changeDirectory(anyString(), eq(path));
    }

    @Test
    void testCreateDirectorySuccess() {
        // Arrange
        String token = "test-token";
        List<String> path = Arrays.asList("home", "new-dir");
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        Map<String, Object> mockResponse = Map.of("created", "home/new-dir");
        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).createDirectory(anyString(), anyList());

        // Act
        var result = restFsService.createDirectory(token, path);

        // Assert
        assertNotNull(result);
        verify(restFsClient).createDirectory(anyString(), eq(path));
    }

    @Test
    void testRemoveDirectorySuccess() {
        // Arrange
        String token = "test-token";
        List<String> path = Arrays.asList("home", "old-dir");
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        Map<String, Object> mockResponse = Map.of("deleted", "home/old-dir");
        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).removeDirectory(anyString(), anyList());

        // Act
        var result = restFsService.removeDirectory(token, path);

        // Assert
        assertNotNull(result);
        verify(restFsClient).removeDirectory(anyString(), eq(path));
    }

    @Test
    void testCreateFileSuccess() {
        // Arrange
        String token = "test-token";
        List<String> path = Arrays.asList("home", "user");
        String filename = "newfile.txt";
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        Map<String, Object> mockResponse = Map.of("created_file", "home/user/newfile.txt");
        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).createFile(anyString(), anyList(), anyString());

        // Act
        var result = restFsService.createFile(token, path, filename);

        // Assert
        assertNotNull(result);
        verify(restFsClient).createFile(anyString(), eq(path), eq(filename));
    }

    @Test
    void testDeleteFileSuccess() {
        // Arrange
        String token = "test-token";
        List<String> path = Arrays.asList("home", "user");
        String filename = "oldfile.txt";
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        Map<String, Object> mockResponse = Map.of("deleted_file", "home/user/oldfile.txt");
        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).deleteFile(anyString(), anyList(), anyString());

        // Act
        var result = restFsService.deleteFile(token, path, filename);

        // Assert
        assertNotNull(result);
        verify(restFsClient).deleteFile(anyString(), eq(path), eq(filename));
    }

    // @Test
    // void testRenameSuccess() {
    // // Arrange
    // String token = "test-token";
    // List<String> path = Arrays.asList("home", "user", "oldname.txt");
    // String newName = "newname.txt";
    // Map<String, Object> userRegistration = Map.of("alias", "testUser");
    // Map<String, Object> mockResponse = Map.of("renamed", "old", "to", "new");
    // ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration,
    // "test-id");
    // doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
    // doReturn(mockResponse).when(restFsClient).rename(anyString(), anyList(),
    // anyString());

    // // Act
    // var result = restFsService.rename(token, path, newName);

    // // Assert
    // assertNotNull(result);
    // verify(restFsClient).rename(anyString(), eq(path), eq(newName));
    // }

    @Test
    void testCopySuccess() {
        // Arrange
        String fromToken = "from-token";
        List<String> fromPath = Arrays.asList("home", "from");
        String toToken = "to-token";
        List<String> toPath = Arrays.asList("home", "to");
        String fromAlias = "fromUser";
        String toAlias = "toUser";
        Map<String, Object> mockResponse = Map.of("copied", "from", "to", "to");

        // Create user registration data as Maps (since the broker returns Maps)
        Map<String, Object> fromUserRegistration = Map.of("alias", fromAlias);
        Map<String, Object> toUserRegistration = Map.of("alias", toAlias);

        ServiceResponse<?> fromResponse = ServiceResponse.ok(fromUserRegistration, "from-request-id");
        ServiceResponse<?> toResponse = ServiceResponse.ok(toUserRegistration, "to-request-id");

        // Mock the broker to return different responses for different service requests
        // Since we can't easily distinguish the ServiceRequests in this case,
        // we'll use an Answer to handle the calls differently
        doReturn(fromResponse, toResponse).when(broker).submit(any(ServiceRequest.class));

        doReturn(mockResponse).when(restFsClient).copy(anyString(), anyList(), anyString(), anyList());

        // Act
        var result = restFsService.copy(fromToken, fromPath, toToken, toPath);

        // Assert
        assertNotNull(result);
        verify(restFsClient).copy(eq(fromAlias), eq(fromPath), eq(toAlias), eq(toPath));
    }

    @Test
    void testHasFileSuccess() {
        // Arrange
        String token = "test-token";
        List<String> path = Arrays.asList("home", "user");
        String filename = "test.txt";
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        Map<String, Object> mockResponse = Map.of("exists", true, "type", "file");
        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).hasFile(anyString(), anyList(), anyString());

        // Act
        var result = restFsService.hasFile(token, path, filename);

        // Assert
        assertNotNull(result);
        verify(restFsClient).hasFile(anyString(), eq(path), eq(filename));
    }

    @Test
    void testHasFolderSuccess() {
        // Arrange
        String token = "test-token";
        List<String> path = Arrays.asList("home", "user");
        String folderName = "testFolder";
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        Map<String, Object> mockResponse = Map.of("exists", true, "type", "directory");
        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).hasFolder(anyString(), anyList(), anyString());

        // Act
        var result = restFsService.hasFolder(token, path, folderName);

        // Assert
        assertNotNull(result);
        verify(restFsClient).hasFolder(anyString(), eq(path), eq(folderName));
    }

    @Test
    void testMoveItemsSuccess() {
        // Arrange
        String token = "test-token";
        List<String> sourcePath = Arrays.asList("home", "ai", ".space");
        List<String> destPath = Arrays.asList("home", "ai");
        List<Map<String, Object>> items = Arrays.asList(
                Map.of("name", "def.json", "type", "file"));
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        Map<String, Object> mockResponse = Map.of("moved", "items");
        ServiceResponse<?> serviceResponse = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(serviceResponse).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).moveItems(anyString(), anyList(), anyList(), anyList());

        // Act
        var result = restFsService.moveItems(token, sourcePath, destPath, items);

        // Assert
        assertNotNull(result);
        verify(restFsClient).moveItems(anyString(), eq(sourcePath), eq(destPath), eq(items));
    }

    @Test
    void testGetUserAliasFromTokenSuccess() {
        // Arrange
        String token = "valid-token";
        String expectedAlias = "testUser";
        Map<String, Object> userRegistration = Map.of("alias", expectedAlias);
        ServiceResponse<?> response = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(response).when(broker).submit(any(ServiceRequest.class));

        // Use reflection or test the private method indirectly
        String resultAlias = null;
        try {
            // Call the private method through reflection for testing purposes
            java.lang.reflect.Method method = RestFsService.class.getDeclaredMethod("getUserAliasFromToken",
                    String.class);
            method.setAccessible(true);
            resultAlias = (String) method.invoke(restFsService, token);
        } catch (Exception e) {
            fail("Error calling private method: " + e.getMessage());
        }

        // Assert
        assertEquals(expectedAlias, resultAlias);
    }

    @Test
    void testGetUserAliasFromTokenFailure() {
        // Arrange
        String token = "invalid-token";
        ServiceResponse<?> response = ServiceResponse.error(List.of(Map.of("error", "User not found")), "test-id");
        doReturn(response).when(broker).submit(any(ServiceRequest.class));

        // Use reflection to test the private method
        String resultAlias = null;
        try {
            java.lang.reflect.Method method = RestFsService.class.getDeclaredMethod("getUserAliasFromToken",
                    String.class);
            method.setAccessible(true);
            resultAlias = (String) method.invoke(restFsService, token);
        } catch (Exception e) {
            fail("Error calling private method: " + e.getMessage());
        }

        // Assert
        assertNull(resultAlias);
    }

    @Test
    void testGetUserPath() {
        // Test the getUserPath method indirectly by testing methods that use it
        // Since it's private, we test its effect through other methods that use it
        String token = "valid-token";
        List<String> path = Arrays.asList("home", "user");

        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        ServiceResponse<?> response = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(response).when(broker).submit(any(ServiceRequest.class));

        FsListResponse mockResponse = new FsListResponse();
        mockResponse.setPath(path);
        mockResponse.setItems(Arrays.asList());
        doReturn(mockResponse).when(restFsClient).listFiles(anyString(), anyList());

        // Act
        var result = restFsService.listFiles(token, path);

        // Assert
        assertNotNull(result);
        verify(restFsClient).listFiles(eq("testUser"), eq(path));
    }

    @Test
    void testNullToken() {
        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class,
                () -> restFsService.listFiles(null, Arrays.asList("home", "user")));

        assertTrue(exception.getMessage().contains("Token is required"));
    }

    @Test
    void testNullPath() {
        // Arrange
        String token = "test-token";
        FsListResponse mockResponse = new FsListResponse();
        mockResponse.setPath(Arrays.asList());
        mockResponse.setItems(Arrays.asList());
        Map<String, Object> userRegistration = Map.of("alias", "testUser");
        ServiceResponse<?> response = ServiceResponse.ok(userRegistration, "test-id");
        doReturn(response).when(broker).submit(any(ServiceRequest.class));
        doReturn(mockResponse).when(restFsClient).listFiles(anyString(), isNull());

        // Act
        var result = restFsService.listFiles(token, null);

        // Assert
        assertNotNull(result);
        verify(restFsClient).listFiles(anyString(), eq(null));
    }
}
