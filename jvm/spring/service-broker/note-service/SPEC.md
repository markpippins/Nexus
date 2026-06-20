# Note Service — Specification

## Functional Requirements

- CRUD operations for textual notes with rich content (Markdown)
- Support tagging and categorization of notes
- Provide full-text search across note content and titles
- Allow sharing notes with other users with permission levels (view, edit)

## Non-Functional Requirements

- P99 read latency under 50ms for individual notes
- Full-text search indexing within 500ms of note creation
- Pagination: maximum 100 items per page

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/notes | Create a new note |
| GET | /api/notes/{noteId} | Get a note by ID |
| GET | /api/notes | List notes with pagination, tags, and search |
| PUT | /api/notes/{noteId} | Update a note |
| DELETE | /api/notes/{noteId} | Delete a note |
| POST | /api/notes/{noteId}/share | Share a note with another user |
| GET | /api/notes/{noteId}/permissions | Get sharing permissions for a note |

## Data Model

- Note: id (UUID), title (String), content (String), tags (String[]), ownerId (UUID), createdAt, updatedAt
- NotePermission: id (UUID), noteId (UUID), userId (UUID), permissionLevel (VIEW|EDIT), createdAt
