# Broker Gateway Proxy — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Service port |
| `HOST` | 0.0.0.0 | Bind address |
| `BROKER_GATEWAY_URL` | http://localhost:8081 | Upstream broker gateway URL |
| `HOST_SERVER_URL` | http://localhost:8085 | Service registry URL |
| `HEARTBEAT_INTERVAL_MS` | 30000 | Registry heartbeat interval |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Service port |
| `BROKER_GATEWAY_URL` | http://localhost:8081 | Upstream gateway |
| `HOST_SERVER_URL` | http://localhost:8085 | Registry URL |
| `SERVICE_NAME` | broker-gateway-proxy | Service name for registration |
| `HEARTBEAT_INTERVAL_MS` | 30000 | Heartbeat interval |
| `NODE_ENV` | development | Runtime environment |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode |
| `npm run build` | Build for production |
| `cd build && node bin/server.js` | Run production build |
| `curl http://localhost:8080/health` | Health check |
| `curl http://localhost:8080/api/test` | Test proxying to upstream |

## Troubleshooting

- **502 Bad Gateway**: The upstream broker-gateway on port 8081 is not reachable — verify it's running
- **Registry registration failed**: Ensure the service registry is running on port 8085
- **Heartbeat not sending**: Check HEARTBEAT_INTERVAL_MS configuration and registry connectivity
- **CORS errors**: The proxy passes through CORS headers from the upstream — verify broker-gateway CORS configuration
