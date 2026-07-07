# User Access Service — Specification

## Functional Requirements

- **Account Management:** Handle registration with validation, profile management (view, update, search), and password management.
- **Authentication:** Provide login/password authentication and token-based session management.
- **Identification:** Single UUID primary key pattern (generated via PostgreSQL `gen_random_uuid()`).

## Non-Functional Requirements

- **Storage:** PostgreSQL via JPA, `assembly` schema.
- **Security:** bcrypt (cost factor 12) for password hashing, rate limiting for brute force protection, XSS prevention, and audit logging for all account changes.

## API Endpoints

All operations are performed via the broker: `login`, `createUser`, `findById`, `findByEmail`, `findAll`, `update`, and `delete`.

## Data Model

### Assembly Schema — `assembly.users`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `UUID` | PK, default `gen_random_uuid()` |
| `alias` | `VARCHAR(255)` | NOT NULL, UNIQUE |
| `email` | `VARCHAR(255)` | NOT NULL, UNIQUE |
| `password` | `TEXT` | NOT NULL (bcrypt hash) |
| `identifier` | `VARCHAR(255)` | Optional external identifier |
| `admin` | `BOOLEAN` | DEFAULT FALSE |
| `avatar_url` | `VARCHAR(255)` | Optional profile avatar URL |
| `created_at` | `TIMESTAMPTZ` | DEFAULT NOW() |
| `updated_at` | `TIMESTAMPTZ` | DEFAULT NOW() |

### Social Graph Tables (in `assembly` schema)

- `user_followers` — Junction table (user_id, follower_id)
- `user_following` — Junction table (user_id, following_id)
- `user_friends` — Junction table (user_id, friend_id)

## Tech Stack

- **Framework:** Spring Boot 4.x, Java 21
- **Persistence:** Spring Data JPA + PostgreSQL (assembly schema)
- **Auth:** JWT tokens, bcrypt password hashing
- **Build:** Maven
