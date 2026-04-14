# FS Crawler Adapter Quick Start

## 5-Minute Setup

### 1. Install Dependencies
```bash
cd python/fs-crawler-adapter
pip install -r requirements.txt
```

### 2. Configure
```bash
cp .env.example .env
```

Edit `.env`:
```bash
FS_CRAWLER_URL=http://localhost:8000
HOST_SERVER_URL=http://localhost:8085
ADAPTER_PORT=8001
```

### 3. Start Services

Terminal 1 - Service Registry:
```bash
cd spring/service-registry
mvn spring-boot:run
```

Terminal 2 - FS Crawler:
```bash
cd python/fs-crawler
python -m uvicorn app.main:app --port 8000
```

Terminal 3 - Adapter:
```bash
cd python/fs-crawler-adapter
python adapter.py
```

### 4. Test

```bash
# Test adapter directly
curl -X POST http://localhost:8001/api/broker/execute \
  -H "Content-Type: application/json" \
  -d '{"operation": "getStatistics", "params": {}}'

# Verify registration
curl http://localhost:8085/api/registry/services
```

## Common Operations

### Start Scan
```bash
curl -X POST http://localhost:8001/api/broker/execute \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "startScan",
    "params": {"path": "/media/music"}
  }'
```

### Search Files
```bash
curl -X POST http://localhost:8001/api/broker/execute \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "searchFiles",
    "params": {
      "query": "beethoven",
      "fileType": "audio",
      "limit": 10
    }
  }'
```

### Get Duplicates
```bash
curl -X POST http://localhost:8001/api/broker/execute \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "getDuplicates",
    "params": {"method": "fingerprint", "limit": 5}
  }'
```

## Troubleshooting

**Adapter won't start**: Check if port 8001 is available  
**Can't connect to fs-crawler**: Verify fs-crawler is running on port 8000  
**Registration fails**: Ensure service-registry is running on port 8085  

## Next Steps

- Read [full documentation](README.md)
- Learn about [adapter pattern](../../docs/REST_API_ADAPTER_PATTERN.md)
- Create your own adapter for other services