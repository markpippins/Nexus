# User Access Service

The user management service module for the Nexus system, responsible for handling all user-related operations including registration, authentication, and profile management.

## Overview

The user access service provides comprehensive user management capabilities within the Nexus system. It handles user registration, authentication, profile management, and all other user-related operations. The service integrates with the broker system to process user requests from various clients and uses MongoDB for data persistence.

## Key Features

- **User Registration**: Create new user accounts with validation
- **Authentication**: Secure user login and credential verification
- **Profile Management**: View and update user profile information
- **User Search**: Find and retrieve user information by various criteria
- **Password Management**: Secure password updates and recovery
- **Account Security**: Multi-factor authentication support
- **User Validation**: Verify user data integrity and compliance
- **Session Management**: Handle user sessions and authentication tokens

## Architecture

The user access service includes:

- **UserService**: Core business logic for user operations
- **UserRepository**: Handles user data persistence in MongoDB
- **ProfileService**: Manages user profile operations
- **ProfileRepository**: Handles profile data persistence in MongoDB

## Dual ID System

The service implements a dual ID architecture to maintain compatibility with existing web clients:

- **Long ID**: For client compatibility (maintains numeric ID expectation for web clients)
- **String mongoId**: Internal MongoDB document ID for storage and retrieval

When creating users, the system generates sequential Long IDs that are compatible with existing client code, while using MongoDB's native String IDs internally.

## API

The service handles requests through the broker system with operations including:

- `login`: Authenticate user with credentials
- `createUser`: Create a new user account
- `findById`: Retrieve user by ID
- `findByAlias`: Retrieve user by alias/username
- `findByEmail`: Retrieve user by email
- `findAll`: Retrieve all users
- `addUser`: Add a new user
- `save`: Save/Update user information
- `update`: Update existing user profile information
- `delete`: Delete user by ID
- `deleteUser`: Delete user by ID (alias for delete)

## Security Features

- **Password Security**: Secure password handling and verification
- **Input Validation**: Comprehensive validation of all user inputs
- **XSS Prevention**: Proper output encoding for user-generated content
- **Rate Limiting**: Protection against brute force attacks

## Configuration

The user access service supports configuration for:
- MongoDB connection settings
- Password complexity requirements
- User registration settings
- Security logging levels

## Running with MongoDB

### Prerequisites
- Docker installed

### Running MongoDB with Docker

The Nexus platform provides convenient scripts to start MongoDB:

**On Windows:**
```bash
mongodb-docker-start.bat
```

**On Linux/Mac:**
```bash
./mongodb-docker-start.sh
```

## Data Management

- **User Data Storage**: Secure MongoDB document storage
- **Privacy Compliance**: Adherence to data privacy regulations
- **Document-based Modeling**: Flexible user data structure in MongoDB
- **Audit Logging**: Tracking of user account changes

## Integration

The user access service integrates with:
- Login service for authentication operations
- Security components for access control
- The broker service for request routing
- User API for DTOs and shared models

## Best Practices

- All sensitive operations require proper authentication
- Proper validation of all user inputs
- Secure handling of password recovery processes
- Regular updates to security measures