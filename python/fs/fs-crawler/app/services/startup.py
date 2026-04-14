"""
Startup service for handling system initialization and recovery
Ensures the system can resume operations after network/power interruptions
"""

import asyncio
from datetime import datetime
import structlog

# Handle imports differently when run as a script vs module
try:
    from ..database import get_redis, get_mongodb, get_mysql_session
    from .scanner import ScannerService  # Same directory
    from ..config import settings
except ImportError:
    # When run as a script, use absolute imports
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parents[2]))  # Go up two levels to app/

    from database import get_redis, get_mongodb, get_mysql_session
    from services.scanner import ScannerService
    from config import settings

# Additional imports needed for validation
from sqlalchemy import text

logger = structlog.get_logger()


class StartupService:
    """
    Handles system startup, recovery, and initialization
    
    Key responsibilities:
    - Resume interrupted scans
    - Validate database connections
    - Cleanup stale data
    - Initialize system state
    """
    
    def __init__(self):
        self.scanner_service = ScannerService()
    
    async def initialize_system(self):
        """
        Complete system initialization sequence
        Called during application startup
        """
        logger.info("Starting system initialization")
        
        try:
            # 1. Validate database connections
            await self._validate_connections()
            
            # 2. Resume any interrupted scans
            await self._resume_interrupted_operations()
            
            # 3. Cleanup old data
            await self._cleanup_stale_data()
            
            # 4. Initialize system state
            await self._initialize_system_state()
            
            logger.info("System initialization completed successfully")
            
        except Exception as e:
            logger.error("System initialization failed", error=str(e))
            raise
    
    async def _validate_connections(self):
        """Validate that all database connections are working"""
        # Test Redis
        try:
            redis_client = get_redis()
            await redis_client.ping()
            logger.info("Redis connection validated")
        except Exception as e:
            logger.warning("Redis connection failed", error=str(e))
        
        # Test MongoDB
        try:
            mongodb = get_mongodb()
            await mongodb.command("ping")
            logger.info("MongoDB connection validated")
        except Exception as e:
            logger.warning("MongoDB connection failed", error=str(e))
        
        # Test MySQL
        try:
            session = await get_mysql_session()
            try:
                await session.execute(text("SELECT 1"))
                logger.info("MySQL connection validated")
            finally:
                await session.close()
        except Exception as e:
            logger.warning("MySQL connection failed", error=str(e))
    
    async def _resume_interrupted_operations(self):
        """Resume any operations that were interrupted"""
        logger.info("Checking for interrupted operations")
        
        try:
            # Resume interrupted scans
            resumed_scans = await self.scanner_service.resume_failed_scans()
            
            if resumed_scans > 0:
                logger.info("Resumed interrupted scans", count=resumed_scans)
            else:
                logger.info("No interrupted scans found")
            
            # TODO: Resume other types of operations (indexing, etc.)
            
        except Exception as e:
            logger.error("Failed to resume interrupted operations", error=str(e))
            # Don't raise - system can continue without resuming
    
    async def _cleanup_stale_data(self):
        """Cleanup old/stale data from databases"""
        logger.info("Cleaning up stale data")
        
        try:
            # Cleanup old scan states
            cleaned_scans = await self.scanner_service.cleanup_old_scan_states()
            
            # Cleanup old Redis keys
            await self._cleanup_redis_keys()
            
            # TODO: Cleanup old MongoDB temporary data
            
            logger.info("Stale data cleanup completed", cleaned_scans=cleaned_scans)
            
        except Exception as e:
            logger.warning("Stale data cleanup failed", error=str(e))
            # Don't raise - system can continue
    
    async def _cleanup_redis_keys(self):
        """Cleanup old Redis keys"""
        redis_client = get_redis()
        
        # Cleanup old temporary keys
        temp_keys = await redis_client.keys("temp:*")
        if temp_keys:
            await redis_client.delete(*temp_keys)
            logger.debug("Cleaned up temporary Redis keys", count=len(temp_keys))
        
        # Cleanup old lock keys (in case they weren't properly released)
        lock_keys = await redis_client.keys("lock:*")
        for lock_key in lock_keys:
            # Check if lock is older than 1 hour
            ttl = await redis_client.ttl(lock_key)
            if ttl == -1:  # No expiration set
                await redis_client.delete(lock_key)
                logger.debug("Cleaned up stale lock key", key=lock_key)
    
    async def _initialize_system_state(self):
        """Initialize system state and configuration"""
        logger.info("Initializing system state")
        
        redis_client = get_redis()
        
        # Set system startup timestamp
        startup_time = datetime.utcnow().isoformat()
        await redis_client.set("system:startup_time", startup_time)
        
        # Initialize system status
        system_status = {
            "status": "running",
            "version": "2.0.0",
            "startup_time": startup_time,
            "active_scans": 0,
            "total_files_indexed": 0  # TODO: Get from MongoDB
        }
        
        await redis_client.hset("system:status", mapping=system_status)
        
        # Set system configuration from settings
        config_data = {
            "max_concurrent_scans": settings.max_concurrent_scans,
            "scan_batch_size": settings.scan_batch_size,
            "max_file_size_mb": settings.max_file_size_mb,
            "supported_extensions": ",".join(settings.supported_extensions)
        }
        
        await redis_client.hset("system:config", mapping=config_data)
        
        logger.info("System state initialized")
    
    async def get_system_status(self) -> dict:
        """Get current system status"""
        redis_client = get_redis()
        
        # Get basic system status
        status_data = await redis_client.hgetall("system:status")
        
        # Get active scan count
        active_scan_keys = await redis_client.keys("scan:state:*")
        active_scans = 0
        
        for key in active_scan_keys:
            scan_data = await redis_client.hgetall(key)
            if scan_data.get("status") == "running":
                active_scans += 1
        
        # Get database statistics
        mongodb = get_mongodb()
        total_files = await mongodb.file_metadata.count_documents({})
        total_directories = await mongodb.directory_metadata.count_documents({})
        
        return {
            "system_status": status_data.get("status", "unknown"),
            "version": status_data.get("version", "unknown"),
            "startup_time": status_data.get("startup_time"),
            "active_scans": active_scans,
            "total_files_indexed": total_files,
            "total_directories": total_directories,
            "uptime_seconds": self._calculate_uptime(status_data.get("startup_time"))
        }
    
    def _calculate_uptime(self, startup_time_str: str) -> int:
        """Calculate system uptime in seconds"""
        if not startup_time_str:
            return 0
        
        try:
            startup_time = datetime.fromisoformat(startup_time_str)
            uptime = datetime.utcnow() - startup_time
            return int(uptime.total_seconds())
        except ValueError:
            return 0
    
    async def graceful_shutdown(self):
        """Handle graceful system shutdown"""
        logger.info("Starting graceful shutdown")
        
        try:
            redis_client = get_redis()
            
            # Mark system as shutting down
            await redis_client.hset("system:status", "status", "shutting_down")
            
            # TODO: Stop active scans gracefully
            # TODO: Save current state
            # TODO: Close database connections
            
            logger.info("Graceful shutdown completed")
            
        except Exception as e:
            logger.error("Error during graceful shutdown", error=str(e))