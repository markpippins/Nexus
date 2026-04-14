# FS Crawler Broker Adapter

A broker-compatible adapter that wraps the fs-crawler REST API, demonstrating how **any REST API** can be integrated into the Atomic Platform's broker ecosystem.

## Purpose

This adapter shows the **REST-to-Broker pattern**: wrapping existing REST APIs to make them discoverable and accessible through the broker-gateway, without modifying the original service.

## Architecture

```
Angular Client
    ↓
Broker Gateway (8080)
    ↓ (queries service-registry)
    ↓ "Which service handles 'startScan'?"
    ↓
Service Registry (8085) → "fsCrawlerService at localhost:8001"
    ↓
FS Crawler Adapter (8001) → Maps broker operations to REST endpoints
    ↓
FS Crawler (8000) → Executes actual file scanning
```

## How It Works

### 1. Registration
On startup, the adapter registers with service-registry:
```python
{
  "serviceName": "fsCrawlerService",
  "operations": ["startScan", "searchFiles", "getDuplicates", ...],
  "endpoint": "http://localhost:8001",
  "framework": "FastAPI-Adapter"
}
```

### 2. Operation Mapping
The adapter maps broker operations to fs-crawler REST endpoints:

| Broker Operation | REST Endpoint | Method |
|-----------------|---------------|--------|
| `startScan` | `/scan/start` | POST |
| `searchFiles` | `/search` | GET |
| `getDuplicates` | `/duplicates/groups` | GET |
| `createRule` | `/rules` | POST |

### 3. Request Flow
```
Client → Broker Gateway → Adapter → FS Crawler
  {operation: "startScan"}  →  POST /scan/start
```

## Installation

```bash
cd python/fs-crawler-adapter

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your settings
```

## Running

### Development
```bash
python adapter.py
```

### Production
```bash
uvicorn adapter:app --host 0.0.0.0 --port 8001
```

### With Docker
```bash
docker build -t fs-crawler-adapter .
docker run -p 8001:8001 \
  -e FS_CRAWLER_URL=http://fs-crawler:8000 \
  -e HOST_SERVER_URL=http://service-registry:8085 \
  fs-crawler-adapter
```

## Supported Operations

### Scanning
- **startScan**: Start scanning a path or all libraries
  ```json
  {
    "operation": "startScan",
    "params": {"path": "/media/music"}
  }
  ```

- **getScanStatus**: Get current scan status
  ```json
  {
    "operation": "getScanStatus",
    "params": {}
  }
  ```

### Search
- **searchFiles**: Search for files by metadata
  ```json
  {
    "operation": "searchFiles",
    "params": {
      "query": "beethoven",
      "fileType": "audio",
      "limit": 50
    }
  }
  ```

- **getFileMetadata**: Get detailed metadata for a file
  ```json
  {
    "operation": "getFileMetadata",
    "params": {"fileId": "507f1f77bcf86cd799439011"}
  }
  ```

### Statistics
- **getStatistics**: Get system statistics
  ```json
  {
    "operation": "getStatistics",
    "params": {}
  }
  ```

### Duplicates
- **getDuplicates**: Get duplicate file groups
  ```json
  {
    "operation": "getDuplicates",
    "params": {
      "method": "fingerprint",
      "limit": 50
    }
  }
  ```

- **detectDuplicates**: Start duplicate detection
  ```json
  {
    "operation": "detectDuplicates",
    "params": {"autoMark": false}
  }
  ```

### Rules
- **listRules**: List deletion rules
  ```json
  {
    "operation": "listRules",
    "params": {"enabledOnly": true}
  }
  ```

- **createRule**: Create a new rule
  ```json
  {
    "operation": "createRule",
    "params": {
      "rule": {
        "name": "Delete low quality MP3s",
        "enabled": true,
        "conditions": [...]
      }
    }
  }
  ```

- **deleteRule**: Delete a rule
  ```json
  {
    "operation": "deleteRule",
    "params": {"ruleId": "rule123"}
  }
  ```

### Resolution
- **resolveDuplicates**: Resolve duplicates using rules
  ```json
  {
    "operation": "resolveDuplicates",
    "params": {
      "dryRun": true,
      "batchSize": 50
    }
  }
  ```

## Testing

### Direct Test (Adapter)
```bash
curl -X POST http://localhost:8001/api/broker/execute \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "getStatistics",
    "params": {}
  }'
```

### Through Broker Gateway
```bash
curl -X POST http://localhost:8080/api/broker/submitRequest \
  -H "Content-Type: application/json" \
  -d '{
    "service": "fsCrawlerService",
    "operation": "getStatistics",
    "params": {}
  }'
```

## Health Check

```bash
curl http://localhost:8001/health
```

Response:
```json
{
  "status": "ok",
  "adapter": "healthy",
  "fs_crawler": "healthy",
  "fs_crawler_url": "http://localhost:8000"
}
```

## Creating Your Own Adapter

This adapter serves as a template for wrapping **any** REST API. To adapt it:

1. **Copy the adapter structure**
2. **Update the registration** with your service name and operations
3. **Map operations** to your REST endpoints in `execute_broker_operation()`
4. **Update health check** to verify your service

### Example: Wrapping a Weather API

```python
@app.post("/api/broker/execute")
async def execute_broker_operation(request: BrokerRequest):
    operation = request.operation
    params = request.params
    
    async with httpx.AsyncClient() as client:
        if operation == "getCurrentWeather":
            city = params.get("city")
            response = await client.get(
                f"{WEATHER_API_URL}/current",
                params={"q": city, "appid": API_KEY}
            )
            data = response.json()
            
        elif operation == "getForecast":
            city = params.get("city")
            days = params.get("days", 5)
            response = await client.get(
                f"{WEATHER_API_URL}/forecast",
                params={"q": city, "days": days, "appid": API_KEY}
            )
            data = response.json()
        
        return BrokerResponse(success=True, data=data)
```

## Benefits of This Pattern

✅ **No Service Modification**: fs-crawler stays unchanged  
✅ **Language Agnostic**: Wrap Python, Node.js, Go, Ruby, anything  
✅ **Unified Discovery**: All services in service-registry registry  
✅ **Centralized Routing**: Everything goes through broker-gateway  
✅ **Flexible Integration**: Wrap internal services, external APIs, legacy systems  

## See Also

- [Service Registry Documentation](../../spring/service-registry/README.md)
- [Service Registry Architecture](../../docs/SERVICE_REGISTRY_ARCHITECTURE.md)
- [FS Crawler Service](../fs-crawler/README.md)