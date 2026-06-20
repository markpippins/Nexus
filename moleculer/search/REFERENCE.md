# Moleculer Search — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `SERVICE_PORT` | 4050 | HTTP API port |
| `SERVICE_HOST` | localhost | Service host for registry registration |
| `SERVICE_REGISTRY_URL` | http://localhost:8085/api/v1/registry | Registry API endpoint |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICE_REGISTRY_URL` | http://localhost:8085/api/v1/registry | Registry URL |
| `GOOGLE_API_KEY` | — | Google Custom Search API key |
| `GOOGLE_SEARCH_ENGINE_ID` | — | Google Custom Search Engine ID |
| `SERVICE_PORT` | 4050 | HTTP API port |
| `SERVICE_HOST` | localhost | Host for registration |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run in production mode |
| `curl -X POST -d '{"query":"test"}' http://localhost:4050/api/search/simple` | Execute a test search |
| `curl http://localhost:4050/api/health` | Health check |

## Troubleshooting

- **Search returns empty**: Verify GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID are set correctly in .env
- **Registry registration failed**: Ensure the Service Registry is running on port 8085 and the REST API is reachable
- **Moleculer broker not connecting**: Check that no other Moleculer process is using the same transporter port
- **Adding a new provider**: Create a new service file in services/, define actions, and update the registry-client to include the new operations
