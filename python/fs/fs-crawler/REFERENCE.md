# FS Crawler — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `MAX_CONCURRENT_SCANS` | 2 | Maximum concurrent scan operations |
| `SCAN_BATCH_SIZE` | 50 | Files processed per checkpoint interval |
| `REDIS_URL` | redis://localhost:6379 | Redis connection string |
| `MONGODB_URL` | mongodb://localhost:27017 | MongoDB connection string |
| `MYSQL_URL` | mysql://localhost:3306 | MySQL connection string |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | redis://localhost:6379 | Redis connection |
| `MONGODB_URL` | mongodb://localhost:27017 | MongoDB connection |
| `MYSQL_URL` | mysql://localhost:3306 | MySQL connection |
| `MAX_CONCURRENT_SCANS` | 2 | Max parallel scans |
| `SCAN_BATCH_SIZE` | 50 | Checkpoint interval |

## Commands

| Command | Description |
|---------|-------------|
| `docker-compose up --build -d` | Start all services using Docker Compose |
| `docker-compose logs -f app` | Follow application logs |
| `curl http://localhost:8000/health` | Health check |
| `curl http://localhost:8000/docs` | API documentation (Swagger) |
| `curl -X POST http://localhost:8000/api/v1/scan/start` | Start a scan |

## Troubleshooting

- **Scan not resuming**: Check Redis connectivity — `docker-compose logs redis` and verify scan state keys in Redis Commander (port 8081)
- **Database connection failures**: Verify all container networks are connected — `docker-compose ps` and check individual container logs
- **Duplicate detection errors**: Ensure audio fingerprinting libraries are installed in the container
- **High memory usage**: Reduce SCAN_BATCH_SIZE or MAX_CONCURRENT_SCANS
- **Container startup order**: The app container may fail to connect if databases aren't ready yet — Docker Compose health checks handle this
