# Moleculer Search Service

A Moleculer-based microservices application providing multiple search providers (Google, Gemini, Unsplash, etc.) that integrates with the Spring Boot broker-gateway via service registration.

## Architecture

```
Angular Client -> Broker Gateway -> Moleculer Search Service
                       ↑                    ↓
                       |              (registers with)
                       |                    ↓
                  Service Registry ←─────────────┘
                (Service Registry)
                       
Moleculer Services:
├── Google Search
├── Gemini Search (future)
└── Unsplash Search (future)
```

## Features

- **Modular Search Providers**: Each search type is an independent Moleculer service
- **Service Registration**: Automatically registers with Spring service-registry on startup
- **Health Checks**: Provides health endpoints for monitoring
- **RESTful API**: Exposes HTTP endpoints via moleculer-web
- **Hot Reload**: Development mode with automatic service reloading

## Services

### google-search
Provides Google Custom Search API integration
- **Action**: `simpleSearch` - Performs basic Google search
- **Params**: `{ query: string, token?: string }`

### api
HTTP gateway service using moleculer-web
- **Endpoint**: `POST /api/search/simple` - Trigger Google search
- **Endpoint**: `GET /api/health` - Health check

### registry-client
Handles registration with Service Registry
- Registers on startup via REST API
- Periodic heartbeat re-registration (every 30s)
- Automatic retry on failure
- Persistent registration in H2 database

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Google API credentials
```

3. Run in development mode:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## Environment Variables

- `SERVICE_REGISTRY_URL` - Service Registry registry endpoint (default: http://localhost:8085/api/v1/registry)
- `GOOGLE_API_KEY` - Google Custom Search API key
- `GOOGLE_SEARCH_ENGINE_ID` - Google Custom Search Engine ID
- `SERVICE_PORT` - Port for HTTP API (default: 4050)
- `SERVICE_HOST` - Host for service registration (default: localhost)

## Integration with Service Registry

The service automatically registers with the Service Registry on startup via REST API:

```json
{
  "serviceName": "moleculer-search",
  "operations": ["simpleSearch"],
  "endpoint": "http://localhost:4050",
  "healthCheck": "http://localhost:4050/api/health",
  "framework": "Moleculer",
  "version": "1.0.0",
  "port": 4050,
  "metadata": {
    "type": "moleculer",
    "provider": "google"
  }
}
```

The registration is persisted in the Service Registry's H2 database. The Broker Gateway queries the Service Registry to route requests to registered services.

## Adding New Search Providers

Create a new service file in `services/`:

```typescript
// services/gemini-search.service.ts
import { Service, ServiceBroker, Context } from "moleculer";

export default class GeminiSearchService extends Service {
  constructor(broker: ServiceBroker) {
    super(broker);
    this.parseServiceSchema({
      name: "gemini-search",
      actions: {
        search: {
          params: { query: "string" },
          async handler(ctx: Context) {
            // Implement Gemini search
          }
        }
      }
    });
  }
}
```

Then update `registry-client.service.ts` to include the new operation in registration.