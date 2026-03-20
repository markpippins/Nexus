# Broker Gateway Proxy

An AdonisJS-based reverse proxy that sits in front of `spring/broker-gateway` to provide cross-cutting concerns like rate limiting, request logging, and future authorization capabilities.

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌──────────────────┐
│  Clients        │────▶│  broker-gateway-proxy       │────▶│  broker-gateway  │
│  (Nexus UI,     │     │  (AdonisJS)                 │     │  (Spring)        │
│   etc.)         │     │  Port: 8080                 │     │  Port: 8081      │
└─────────────────┘     └─────────────────────────────┘     └──────────────────┘
                                  │
                                  ▼
                        ┌─────────────────┐
                        │  Host-Server    │
                        │  (Registration) │
                        │  Port: 8888     │
                        └─────────────────┘
```

## Project Structure

| File | Purpose |
|------|---------|
| `.env` | Environment configuration (port 8080, upstream URL, service-registry settings) |
| `config/proxy.ts` | Proxy configuration (upstream URL, timeout, headers to strip/add) |
| `start/env.ts` | Environment schema validation for all required variables |
| `start/routes.ts` | Route definitions (health check + catch-all proxy) |
| `start/host_server.ts` | Preload script for service-registry registration on startup |
| `app/services/proxy_service.ts` | Core proxy logic - forwards requests to broker-gateway with proper error handling |
| `app/services/host_server_client.ts` | Host-server registration and heartbeat client |
| `app/controllers/proxy_controller.ts` | HTTP controller that delegates to ProxyService |

## Key Features

1. **Transparent Proxying**: All requests (except `/health`) are forwarded to broker-gateway
2. **ServiceResponse Error Format**: When the upstream fails, the proxy returns errors in the same JSON format as broker-gateway:
   ```json
   {
     "ok": false,
     "data": null,
     "errors": [{ "field": "proxy", "message": "Upstream request failed: ..." }],
     "requestId": "proxy-1234567890-abc123",
     "ts": "2026-01-21T04:00:00.000Z",
     "version": "1.0",
     "service": "broker-gateway-proxy",
     "operation": "POST /api/broker/submit",
     "encrypt": false
   }
   ```
3. **Host-Server Registration**: On startup, the proxy registers with service-registry and sends heartbeats every 30 seconds
4. **Graceful Shutdown**: Deregisters from service-registry on application termination
5. **Request Context Headers**: Adds `X-Forwarded-For`, `X-Real-IP`, and `X-Forwarded-By` headers for rate limiting and tracing

## Port Configuration

| Service | Port | Role |
|---------|------|------|
| **broker-gateway-proxy** | 8080 | Public-facing entry point (clients connect here) |
| **broker-gateway** | 8081 | Internal upstream (not exposed to clients) |
| **service-registry** | 8888 | Service registry |

## Getting Started

### Prerequisites

- Node.js 20+
- broker-gateway running on port 8081
- service-registry running on port 8888 (optional, for registration)

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```env
PORT=8080
HOST=0.0.0.0

# Upstream broker-gateway
BROKER_GATEWAY_URL=http://localhost:8081

# Host-Server registration
HOST_SERVER_URL=http://localhost:8888
SERVICE_NAME=broker-gateway-proxy
SERVICE_HOST=localhost
SERVICE_PORT=8080
HEARTBEAT_INTERVAL_MS=30000
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
cd build
npm ci --omit="dev"
node bin/server.js
```

## API

### Health Check

```
GET /health
```

Returns:
```json
{
  "status": "UP",
  "service": "broker-gateway-proxy",
  "timestamp": "2026-01-21T04:00:00.000Z"
}
```

### Proxy

All other requests are forwarded to broker-gateway with:
- Original HTTP method preserved
- Query parameters preserved
- Request body forwarded (JSON, form-urlencoded, or raw)
- Response headers and status code passed through

## Testing the Proxy

To test the proxy end-to-end:

1. **Update broker-gateway** to listen on port 8081 (update `application.properties`)
2. **Start service-registry** on port 8888
3. **Start the proxy**: `npm run dev` in this directory
4. **Update Nexus UI**: Point `environment.ts` to port 8080

## Future Enhancements

- [ ] **Rate Limiting**: Using `@adonisjs/limiter` with Redis backing (per-IP)
- [ ] **Authorization**: Using AdonisJS Bouncer for role-based access control
- [ ] **Request/Response Logging**: Middleware for audit trails
- [ ] **Metrics Collection**: Request counts, latencies, error rates
- [ ] **Circuit Breaker**: Graceful degradation when upstream is unavailable
- [ ] **Rate Limit Headers**: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Related Projects

- `spring/broker-gateway` - Upstream service being proxied
- `spring/service-registry` - Service registry for registration
- `web/angular/nexus` - Frontend UI that connects through this proxy
