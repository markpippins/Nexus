"""
Media Metadata Indexing Service
Modern replacement for the legacy media_hound system
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

# Handle imports differently when run as a script vs module
try:
    from .config import settings
    from .database import init_databases, close_databases, get_redis, get_mongodb
    from .api.routes import router
except ImportError:
    # When run as a script, use absolute imports
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent))

    from config import settings
    from database import init_databases, close_databases, get_redis, get_mongodb
    from api.routes import router


# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager with robust startup/shutdown"""
    logger.info("Starting Media Metadata Service")
    
    # Initialize database connections
    await init_databases()
    logger.info("Database connections initialized")
    
    # Initialize system and resume operations
    try:
        from .services.startup import StartupService
    except ImportError:
        from services.startup import StartupService
    startup_service = StartupService()
    await startup_service.initialize_system()
    
    # Store startup service in app state for access in routes
    app.state.startup_service = startup_service
    
    yield
    
    # Graceful shutdown
    logger.info("Shutting down Media Metadata Service")
    await startup_service.graceful_shutdown()
    await close_databases()


app = FastAPI(
    title="Media Metadata Service",
    description="Modern media file metadata indexing and search service",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api/v1")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Media Metadata Service",
        "version": "2.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        # Test database connections
        redis_status = "connected"
        try:
            redis_client = get_redis()
            await redis_client.ping()
        except:
            redis_status = "disconnected"
        
        mongodb_status = "connected"
        try:
            mongodb = get_mongodb()
            await mongodb.command("ping")
        except:
            mongodb_status = "disconnected"
        
        mysql_status = "connected"
        try:
            from database import async_session_maker
            async with async_session_maker() as session:
                from sqlalchemy import text
                await session.execute(text("SELECT 1"))
        except:
            mysql_status = "disconnected"
        
        overall_status = "healthy" if all(
            status == "connected" 
            for status in [redis_status, mongodb_status, mysql_status]
        ) else "unhealthy"
        
        return {
            "status": overall_status,
            "databases": {
                "redis": redis_status,
                "mongodb": mongodb_status, 
                "mysql": mysql_status
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }


@app.get("/system/status")
async def system_status():
    """Get detailed system status including scan operations"""
    try:
        startup_service = app.state.startup_service
        status = await startup_service.get_system_status()
        return status
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8004,
        reload=True,
        log_config=None  # Use structlog instead
    )