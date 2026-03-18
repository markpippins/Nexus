# User API

The API module for user services, containing interface definitions and shared data structures for user management operations in the Nucleus system.

## Overview

This module defines the API contracts for user management within the Nucleus system. It provides standardized interfaces and data structures that allow consistent user handling across different components of the system, including authentication, profile management, and user data operations.

## Key Components

- **UserService Interface**: Core interface for user management operations
- **UserOperation Enum**: Defined user operations (login, getUserByAlias, create, update, etc.)
- **User**: Data structure representing user information
- **UserProfile**: Extended data structure for user profile details
- **UserRequest/UserResponse**: Standardized request/response formats
- **AuthenticationResult**: Data structure for authentication outcomes

## Operations

The API supports the following user operations:

- `login`: Authenticate user credentials
- `getUserByAlias`: Retrieve user information by alias/username
- `create`: Create a new user account
- `update`: Update existing user information
- `delete`: Remove a user account
- `changePassword`: Update user password
- `validateUser`: Verify user data integrity
- `searchUsers`: Find users matching specified criteria

## Data Structures

### User
Contains essential user information:
- ID, alias/username, email
- Full name and basic profile information
- Account status and creation date
- Security-related fields

### UserProfile
Contains extended user profile information:
- Personal details and preferences
- Contact information
- Profile picture and custom settings
- Extended account information

## Benefits

- **Consistency**: Ensures uniform user operation handling
- **Type Safety**: Provides compile-time checking of user operations
- **Standardization**: Common format for user requests and responses
- **Extensibility**: Easy to add new user operations while maintaining compatibility
- **Decoupling**: Allows user service implementations to change without affecting clients

## Usage

The user API is used by:
- The user-service implementation
- The broker-gateway for routing user operations
- Authentication and security components
- Client applications that interact with user data

## Dependencies

This module contains only interface definitions and data structures with minimal external dependencies, making it a lightweight component that can be safely included in other modules.