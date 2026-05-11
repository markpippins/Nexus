# File Service

This module is responsible for handling all file-related operations in the application. It provides a token-based authenticated interface for interacting with the file system and is consumed by the `broker-gateway`.

## Overview

The file service is built with Spring Boot and consists of the following key components:

-   `RestFsController`: The main controller that exposes the file system operations as REST endpoints.
-   `RestFsService`: A service that contains the business logic for handling file operations and token validation.
-   `RestFsClient` and `ReactiveRestFsClient`: Clients for interacting with the file system.
-   `LoginService`: Integration with authentication service for token validation.

## Security & Authentication

The file service now implements **token-based authentication** instead of alias-based access:

- Each file operation requires a valid authentication token
- The token is validated against the `login-service`
- Only authenticated users can access their own files
- No direct access to other users' files is permitted

## API

The file service exposes the following endpoints through the broker system:

-   `POST /` via broker gateway: The main endpoint for all file operations. The operation to be performed is specified in the request body.

### Supported Operations (All require valid token):

-   `listFiles`: Lists the files in a directory (requires token).
-   `changeDirectory`: Changes the current directory (requires token).
-   `createDirectory`: Creates a new directory (requires token).
-   `removeDirectory`: Removes a directory (requires token).
-   `createFile`: Creates a new file (requires token).
-   `deleteFile`: Deletes a file (requires token).
-   `rename`: Renames a file or directory (requires token).
-   `copy`: Copies a file or directory (requires fromToken and toToken for cross-user operations).
-   `hasFile`: Checks if a file exists (requires token).
-   `hasFolder`: Checks if a folder exists (requires token).

### Parameters

Previous operations used `alias` parameter to identify users. Current operations use `token` parameter:

```json
{
  "service": "restFsService",
  "operation": "listFiles", 
  "params": {
    "token": "valid-uuid-token",
    "path": ["documents", "private"]
  }
}
```

## Integration

The file service integrates with:
- `login-service` for token validation
- `broker-service` for request routing
- File system backend for actual file operations
