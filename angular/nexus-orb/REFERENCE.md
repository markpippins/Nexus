# Nexus Orb — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `API_ENDPOINT` | — | Backend API endpoint |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| (none) | — | All configuration via Angular environment files |

## Commands

| Command | Description |
|---------|-------------|
| `ng serve` | Start dev server on port 4200 |
| `ng build` | Build for production |
| `ng test` | Run unit tests with Vitest |
| `ng generate component component-name` | Scaffold a new component |

## Troubleshooting

- **ng serve fails**: Check Node.js version (18+) and run `npm install` to ensure dependencies are installed
- **Tests not running**: Verify Vitest configuration in the project's test setup
