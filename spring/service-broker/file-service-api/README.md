# File Service API

The API module for the file service, containing interface definitions and shared data structures for file operations in the Nucleus system.

## Overview

This module defines the API contracts for file system operations within the Nucleus system. It provides standardized interfaces and data structures that allow consistent file handling across different components of the system.

## Key Components

- **FileService Interface**: Core interface for file system operations
- **FileOperation Enum**: Defined file operations (ls, cd, mkdir, rmdir, newfile, deletefile, rename, copy, move)
- **FileInfo**: Data structure containing file metadata
- **DirectoryInfo**: Data structure for directory information
- **FileOperationRequest/FileOperationResponse**: Standardized request/response formats

## Operations

The API supports the following file operations:

- `ls`: List files and directories in a specified path
- `cd`: Change current directory context
- `mkdir`: Create a new directory
- `rmdir`: Remove an empty directory
- `newfile`: Create a new file
- `deletefile`: Delete a file
- `rename`: Rename a file or directory
- `copy`: Copy a file or directory
- `move`: Move a file or directory

## Data Structures

### FileInfo
Contains file metadata:
- Name, path, size, permissions
- Creation and modification timestamps
- File type indicator

### DirectoryInfo
Contains directory information:
- Path and contents list
- Total file and directory counts
- Size calculations

## Benefits

- **Consistency**: Ensures uniform file operation handling
- **Type Safety**: Provides compile-time checking of file operations
- **Standardization**: Common format for file requests and responses
- **Extensibility**: Easy to add new file operations while maintaining compatibility

## Usage

The file service API is used by:
- The file-service implementation
- The broker-gateway for routing file operations
- Client applications that interact with the file system

## Dependencies

This module contains only interface definitions and data structures with minimal external dependencies, making it a lightweight component that can be safely included in other modules.