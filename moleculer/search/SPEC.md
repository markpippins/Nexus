# Moleculer Search — Specification

## Functional Requirements

- Provide modular search providers as independent Moleculer microservices
- Support Google Custom Search API integration with pagination
- Register with the Spring Service Registry on startup with periodic heartbeats
- Expose RESTful HTTP endpoints via moleculer-web
- Enable extensibility for additional search providers (Gemini, Unsplash, etc.)

## Non-Functional Requirements

- Each search type is an independent Moleculer service
- Heartbeat re-registration every 30 seconds
- Automatic retry on registration failure
- Hot reload in development mode
- Registration persistence in Service Registry's H2 database

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/search/simple | Execute a Google search |
| GET | /api/health | Health check endpoint |

## Data Model

- SearchRequest: query (String), token (String), page (Integer), size (Integer)
- SearchResult: title (String), url (String), snippet (String), source (String)
- ServiceRegistration: serviceName (String), operations (String[]), endpoint (String), healthCheck (String), framework (String), version (String), metadata (JSON)
