"""
SQLAlchemy models for MySQL configuration tables
Based on the existing system's MySQL schema
"""

from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship

# Handle imports differently when run as a script vs module
try:
    from ..database import Base
except ImportError:
    # When run as a script, use absolute imports
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parents[2]))  # Go up two levels to app/

    from database import Base


class PathType(str, Enum):
    ALBUM = "album"
    COMPILATION = "compilation" 
    RECENT = "recent"
    GENERAL = "general"


class FileCategory(str, Enum):
    AUDIO = "audio"
    VIDEO = "video"
    IMAGE = "image"
    DOCUMENT = "document"
    OTHER = "other"


class OperationType(str, Enum):
    SCAN = "scan"
    READ = "read"
    DEEP_SCAN = "deep_scan"


class OperationStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class LibraryPath(Base):
    """Library paths configuration table"""
    __tablename__ = "library_paths"

    id = Column(Integer, primary_key=True, autoincrement=True)
    path = Column(String(500), nullable=False, unique=True)  # Changed to 500 to avoid key length issues
    name = Column(String(255))
    scan_enabled = Column(Boolean, default=True)
    deep_scan = Column(Boolean, default=False)
    path_type = Column(SQLEnum(PathType), default=PathType.GENERAL)
    auto_delete_duplicates = Column(Boolean, default=False)
    delete_lower_quality = Column(Boolean, default=True)
    quality_threshold = Column(Integer, default=100)
    preferred_formats = Column(String(255), default="FLAC,MP3")
    deletion_priority = Column(Integer, default=50)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FileType(Base):
    """File type registry table"""
    __tablename__ = "file_types"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    extension = Column(String(20), nullable=False, unique=True)
    mime_type = Column(String(100))
    category = Column(SQLEnum(FileCategory), default=FileCategory.OTHER)
    description = Column(String(255))
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    handler_mappings = relationship("HandlerFileType", back_populates="file_type")


class MetadataHandler(Base):
    """Metadata handlers registry table"""
    __tablename__ = "metadata_handlers"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    handler_class = Column(String(255), nullable=False)
    priority = Column(Integer, default=100)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    file_type_mappings = relationship("HandlerFileType", back_populates="handler")


class HandlerFileType(Base):
    """Handler to file type mapping table"""
    __tablename__ = "handler_file_types"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    handler_id = Column(Integer, ForeignKey("metadata_handlers.id", ondelete="CASCADE"), nullable=False)
    file_type_id = Column(Integer, ForeignKey("file_types.id", ondelete="CASCADE"), nullable=False)
    
    # Relationships
    handler = relationship("MetadataHandler", back_populates="file_type_mappings")
    file_type = relationship("FileType", back_populates="handler_mappings")


class ScanOperation(Base):
    """Scan operations tracking table"""
    __tablename__ = "scan_operations"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    path = Column(String(1000), nullable=False)
    operation_type = Column(SQLEnum(OperationType), nullable=False)
    status = Column(SQLEnum(OperationStatus), default=OperationStatus.PENDING)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    files_processed = Column(Integer, default=0)