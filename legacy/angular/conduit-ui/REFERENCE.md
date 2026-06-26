# Conduit UI — Reference Guide

## Configuration

- Environment: production, staging, development
- Theme: light, dark, system
- Language: en-US

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| API_URL | http://localhost:3101 | Backend API endpoint |
| WS_URL | ws://localhost:3101 | WebSocket endpoint |
| NODE_ENV | development | Runtime environment |

## Commands

| Command | Description |
|---------|-------------|
| npm start | Start dev server |
| npm run build | Production build |
| npm test | Run unit tests |

## Troubleshooting

- **CORS errors**: Verify the backend is running and API_URL is correct
- **Blank screen**: Check browser console for module loading errors
- **WebSocket disconnects**: Ensure WS_URL matches the server address
