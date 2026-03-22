"""
Configuration management using Pydantic Settings
Replaces the old config.ini approach with environment-based config
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )
    
    # Database URLs
    redis_url: str = Field(default="redis://localhost:6379", description="Redis connection URL")
    mongodb_url: str = Field(default="mongodb://localhost:27017/media_metadata", description="MongoDB connection URL (credentials should be included in environment variable)")
    mysql_url: str = Field(default="mysql://root:rootpass@localhost:3306/mysql", description="MySQL connection URL")
    
    # MongoDB settings
    mongodb_database: str = Field(default="media_metadata", description="MongoDB database name")
    
    # Redis settings
    redis_scan_key_prefix: str = Field(default="scan:", description="Redis key prefix for scan operations")
    redis_cache_ttl: int = Field(default=3600, description="Redis cache TTL in seconds")
    
    # Scanning settings
    scan_enabled: bool = Field(default=True, description="Enable file scanning")
    deep_scan_enabled: bool = Field(default=False, description="Enable deep scanning by default")
    max_concurrent_scans: int = Field(default=4, description="Maximum concurrent scan operations")
    scan_batch_size: int = Field(default=100, description="Files to process per batch")
    
    # File processing settings
    max_file_size_mb: int = Field(default=500, description="Maximum file size to process (MB)")
    supported_extensions: list[str] = Field(
        default=[
            # Audio
            "mp3", "flac", "wav", "m4a", "ogg", "wma", "aac",
            # Video  
            "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm",
            # Images
            "jpg", "jpeg", "png", "gif", "bmp", "tiff", "webp",
            # Documents
            "pdf", "txt", "doc", "docx"
        ],
        description="Supported file extensions"
    )
    
    # Logging
    log_level: str = Field(default="INFO", description="Logging level")
    
    # API settings
    api_title: str = Field(default="Media Metadata Service", description="API title")
    api_version: str = Field(default="2.0.0", description="API version")


# Global settings instance
settings = Settings()
