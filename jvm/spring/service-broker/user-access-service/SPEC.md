# User Access Service — Specification

## Functional Requirements

- Register new user accounts with input validation
- Authenticate users with credentials (login/password)
- Manage user profiles (view, update, search)
- Support password management (secure updates, recovery)
- Provide session management and authentication tokens
- Implement multi-factor authentication support
- Maintain dual ID system (Long IDs for client compatibility, String mongoIds for MongoDB)

## Non-Functional Requirements

- MongoDB for flexible document-based persistence
- bcrypt password hashing (cost factor 12)
- Rate limiting for brute force attack protection
- XSS prevention through proper output encoding
- Audit logging for all account changes

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| (Broker) | login | Authenticate user with credentials |
| (Broker) | createUser | Create a new user account |
| (Broker) | findById | Retrieve user by ID |
| (Broker) | findByEmail | Retrieve user by email |
| (Broker) | findAll | Retrieve all users |
| (Broker) | update | Update user profile |
| (Broker) | delete | Delete user by ID |

## Data Model

- User: id (Long), mongoId (String), username (String), email (String), passwordHash (String), displayName (String), roles (String[]), mfaEnabled (Boolean), createdAt (Instant), updatedAt (Instant)
- UserProfile: userId (Long), avatarUrl (String), bio (String), preferences (JSON)
- Session: id (UUID), userId (Long), token (String), ipAddress (String), expiresAt (Instant), createdAt (Instant)
