# Note Service

A Spring Boot service for managing user notes with MongoDB persistence and token-based authentication.

## Overview

The Note Service provides operations for creating, retrieving, updating, and deleting user notes. It integrates with the broker system to handle requests and uses token-based authentication to validate user identity against the login service.

## Features

- **MongoDB Persistence**: Notes are stored in MongoDB with efficient querying
- **Token-Based Authentication**: Validates user tokens via the login service through broker communication
- **Broker Integration**: Full integration with the Nexus broker system
- **Secure Access**: Users can only access their own notes via token validation

## Data Model

The Note entity has the following fields:
- `id`: MongoDB ObjectId (primary key)
- `userId`: User's MongoDB ID (from login token validation)
- `source`: Source identifier for the note
- `key`: Unique key for the note within the source
- `content`: Actual note content

## Broker Operations

The service exposes the following broker operations:

- `getNote(token, source, key)`: Retrieve a note by token, source, and key
- `saveNote(token, source, key, content)`: Save or update a note
- `deleteNote(token, source, key)`: Delete a note
- `getNotesByToken(token)`: Retrieve all notes for a user
- `getNotesByTokenAndSource(token, source)`: Retrieve notes for a user from a specific source

## Architecture

The service follows the Nexus architecture pattern:
1. Client sends request to broker-gateway
2. Request routed to note-service via broker
3. note-service validates token by calling login-service through broker
4. note-service performs requested operation on MongoDB
5. Response returned through broker system

## Dependencies

- **broker-service**: For internal service communication
- **login-service**: For token validation
- **MongoDB**: For data persistence

## Configuration

The service is configured as part of the broker-gateway and does not run independently. It's included via the broker-gateway's component scanning.

## Security

- All operations require a valid token from the login service
- Token validation occurs via broker communication with the login service
- Users can only access their own notes based on the validated token