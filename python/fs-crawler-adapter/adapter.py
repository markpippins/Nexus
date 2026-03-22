"""
FS Crawler Broker Adapter

This adapter wraps the fs-crawler REST API and makes it compatible with the
Atomic Platform's broker service pattern.

It demonstrates how ANY REST API (Python, Node.js, Go, etc.) can be integrated
into the broker ecosystem without modifying the original service.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import os
import structlog
from typing import Optional, Dict, Any

# Configure logging
logger = structlog.get_logger()

# Configuration
FS_CRAWLER_URL = os.getenv("FS_CRAWLER_URL", "http://localhost:8000")
HOST_SERVER_URL = os.getenv("HOST_SERVER_URL", "http://localhost:8085")
ADAPTER_PORT = int(os.getenv("ADAPTER_PORT", "8001"))
ADAPTER_HOST = os.getenv("ADAPTER_HOST", "localhost")

app = FastAPI(
    title="FS Crawler Broker Adapter",
    description="Broker-compatible adapter for fs-crawler service",
    version="1.0.0"
)


class BrokerRequest(BaseModel):
    """Standard broker request format"""
    operation: str
    params: Dict[str, Any] = {}


class BrokerResponse(BaseModel):
    """Standard broker response format"""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


@app.on_event("startup")
async def register_with_host_server():
    """
    Register this adapter with the service-registry on startup.
    This makes the fs-crawler service discoverable by the broker-gateway.
    """
    registration = {
        "serviceName": "fsCrawlerService",
        "operations": [
            "startScan",
            "getScanStatus",
            "searchFiles",
            "getFileMetadata",
            "getStatistics",
            "getDuplicates",
            "detectDuplicates",
            "listRules",
            "createRule",
            "deleteRule",
            "resolveDuplicates"
        ],
        "endpoint": f"http://{ADAPTER_HOST}:{ADAPTER_PORT}",
        "healthCheck": f"http://{ADAPTER_HOST}:{ADAPTER_PORT}/health",
        "framework": "FastAPI-Adapter",
        "version": "1.0.0",
        "port": ADAPTER_PORT,
        "metadata": {
            "type": "adapter",
            "wraps": "fs-crawler",
            "original_service": FS_CRAWLER_URL
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{HOST_SERVER_URL}/api/v1/registry/register",
                json=registration,
                timeout=5.0
            )
            logger.info(
                "registered_with_host_server",
                status_code=response.status_code,
                service_name=registration["serviceName"]
            )
    except Exception as e:
        logger.error("failed_to_register", error=str(e))
        # Don't fail startup - service can still work without registration


@app.post("/api/broker/execute", response_model=BrokerResponse)
async def execute_broker_operation(request: BrokerRequest):
    """
    Main broker-compatible endpoint.
    Maps broker operations to fs-crawler REST endpoints.
    """
    operation = request.operation
    params = request.params
    
    logger.info("executing_operation", operation=operation, params=params)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            
            # Scanning Operations
            if operation == "startScan":
                path = params.get("path")
                response = await client.post(
                    f"{FS_CRAWLER_URL}/scan/start",
                    params={"path": path} if path else {}
                )
                data = response.json()
                
            elif operation == "getScanStatus":
                response = await client.get(f"{FS_CRAWLER_URL}/scan/status")
                data = response.json()
            
            # Search Operations
            elif operation == "searchFiles":
                search_params = {
                    "q": params.get("query"),
                    "file_type": params.get("fileType"),
                    "limit": params.get("limit", 50),
                    "offset": params.get("offset", 0)
                }
                # Remove None values
                search_params = {k: v for k, v in search_params.items() if v is not None}
                
                response = await client.get(
                    f"{FS_CRAWLER_URL}/search",
                    params=search_params
                )
                data = response.json()
            
            elif operation == "getFileMetadata":
                file_id = params.get("fileId")
                if not file_id:
                    raise HTTPException(status_code=400, detail="fileId is required")
                
                response = await client.get(f"{FS_CRAWLER_URL}/files/{file_id}")
                data = response.json()
            
            # Statistics Operations
            elif operation == "getStatistics":
                response = await client.get(f"{FS_CRAWLER_URL}/stats")
                data = response.json()
            
            # Duplicate Operations
            elif operation == "getDuplicates":
                method = params.get("method", "fingerprint")
                limit = params.get("limit", 50)
                
                response = await client.get(
                    f"{FS_CRAWLER_URL}/duplicates/groups",
                    params={"method": method, "limit": limit}
                )
                data = response.json()
            
            elif operation == "detectDuplicates":
                auto_mark = params.get("autoMark", False)
                
                response = await client.post(
                    f"{FS_CRAWLER_URL}/duplicates/detect",
                    params={"auto_mark": auto_mark}
                )
                data = response.json()
            
            # Rules Operations
            elif operation == "listRules":
                enabled_only = params.get("enabledOnly", True)
                
                response = await client.get(
                    f"{FS_CRAWLER_URL}/rules",
                    params={"enabled_only": enabled_only}
                )
                data = response.json()
            
            elif operation == "createRule":
                rule_data = params.get("rule")
                if not rule_data:
                    raise HTTPException(status_code=400, detail="rule data is required")
                
                response = await client.post(
                    f"{FS_CRAWLER_URL}/rules",
                    json=rule_data
                )
                data = response.json()
            
            elif operation == "deleteRule":
                rule_id = params.get("ruleId")
                if not rule_id:
                    raise HTTPException(status_code=400, detail="ruleId is required")
                
                response = await client.delete(f"{FS_CRAWLER_URL}/rules/{rule_id}")
                data = response.json()
            
            # Resolution Operations
            elif operation == "resolveDuplicates":
                dry_run = params.get("dryRun", True)
                batch_size = params.get("batchSize", 50)
                
                response = await client.post(
                    f"{FS_CRAWLER_URL}/duplicates/resolve",
                    params={"dry_run": dry_run, "batch_size": batch_size}
                )
                data = response.json()
            
            else:
                return BrokerResponse(
                    success=False,
                    error=f"Unknown operation: {operation}"
                )
            
            # Check if the underlying service returned an error
            if response.status_code >= 400:
                return BrokerResponse(
                    success=False,
                    error=f"FS Crawler error: {data.get('detail', 'Unknown error')}"
                )
            
            return BrokerResponse(success=True, data=data)
            
    except httpx.TimeoutException:
        logger.error("operation_timeout", operation=operation)
        return BrokerResponse(
            success=False,
            error="Operation timed out"
        )
    except httpx.RequestError as e:
        logger.error("request_error", operation=operation, error=str(e))
        return BrokerResponse(
            success=False,
            error=f"Failed to connect to fs-crawler: {str(e)}"
        )
    except Exception as e:
        logger.error("unexpected_error", operation=operation, error=str(e))
        return BrokerResponse(
            success=False,
            error=f"Unexpected error: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    Verifies both adapter and underlying fs-crawler service are healthy.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Check if fs-crawler is reachable
            response = await client.get(f"{FS_CRAWLER_URL}/stats")
            fs_crawler_healthy = response.status_code == 200
    except Exception:
        fs_crawler_healthy = False
    
    return {
        "status": "ok" if fs_crawler_healthy else "degraded",
        "adapter": "healthy",
        "fs_crawler": "healthy" if fs_crawler_healthy else "unreachable",
        "fs_crawler_url": FS_CRAWLER_URL
    }


@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "FS Crawler Broker Adapter",
        "version": "1.0.0",
        "description": "Broker-compatible adapter for fs-crawler service",
        "fs_crawler_url": FS_CRAWLER_URL,
        "operations": [
            "startScan", "getScanStatus", "searchFiles", "getFileMetadata",
            "getStatistics", "getDuplicates", "detectDuplicates",
            "listRules", "createRule", "deleteRule", "resolveDuplicates"
        ],
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=ADAPTER_PORT)
