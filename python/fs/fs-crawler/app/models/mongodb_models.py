"""
Pydantic models for MongoDB document schemas
Replaces Elasticsearch with flexible MongoDB document storage
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from bson import ObjectId


class PyObjectId(ObjectId):
    """Custom ObjectId type for Pydantic"""

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        from pydantic_core import core_schema
        return core_schema.no_info_after_validator_function(
            cls.validate,
            core_schema.str_schema(),
        )

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)


class FileMetadata(BaseModel):
    """Base file metadata document"""
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    
    # File system information
    absolute_path: str
    filename: str
    directory_path: str
    file_size: int
    file_extension: str
    mime_type: Optional[str] = None
    
    # Timestamps
    file_modified: datetime
    file_created: Optional[datetime] = None
    indexed_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # File type and category
    file_category: str  # audio, video, image, document, other
    
    # Generic metadata (flexible schema)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Processing status
    processing_status: str = "pending"  # pending, processed, error
    processing_errors: List[str] = Field(default_factory=list)
    
    # Search and indexing
    tags: List[str] = Field(default_factory=list)
    searchable_text: str = ""
    
    # Duplicate detection and quality assessment
    content_hash: Optional[str] = None  # File content hash
    quality_score: Optional[int] = None  # Quality score for duplicate comparison
    audio_fingerprint: Optional[str] = None  # Audio content fingerprint
    
    # Path classification for deletion rules
    path_type: Optional[str] = None  # album, compilation, misc, etc.
    library_path_id: Optional[int] = None  # Reference to library path configuration
    deletion_candidate: bool = False  # Marked for potential deletion
    deletion_reason: Optional[str] = None  # Reason for deletion candidacy
    
    # Duplicate relationships
    duplicate_group_id: Optional[str] = None  # Groups duplicate files together
    is_best_quality: bool = False  # True if this is the best quality in duplicate group
    duplicate_of: Optional[PyObjectId] = None  # Reference to better quality duplicate
    
    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


class AudioMetadata(FileMetadata):
    """Audio file specific metadata"""
    
    # Audio-specific fields that will be stored in the metadata dict
    # but defined here for documentation and validation
    
    def __init__(self, **data):
        super().__init__(**data)
        self.file_category = "audio"
        
        # Common audio metadata fields (stored in metadata dict):
        # - title, artist, album, albumartist
        # - track_number, disc_number, total_tracks, total_discs
        # - year, date, genre
        # - duration, bitrate, sample_rate, channels
        # - codec, encoding


class VideoMetadata(FileMetadata):
    """Video file specific metadata"""
    
    def __init__(self, **data):
        super().__init__(**data)
        self.file_category = "video"
        
        # Common video metadata fields (stored in metadata dict):
        # - title, description, duration
        # - width, height, aspect_ratio, frame_rate
        # - video_codec, audio_codec, bitrate
        # - creation_date, location


class ImageMetadata(FileMetadata):
    """Image file specific metadata"""
    
    def __init__(self, **data):
        super().__init__(**data)
        self.file_category = "image"
        
        # Common image metadata fields (stored in metadata dict):
        # - width, height, color_space, bit_depth
        # - camera_make, camera_model, lens_model
        # - iso, aperture, shutter_speed, focal_length
        # - gps_latitude, gps_longitude, gps_altitude
        # - creation_date, orientation


class DocumentMetadata(FileMetadata):
    """Document file specific metadata"""
    
    def __init__(self, **data):
        super().__init__(**data)
        self.file_category = "document"
        
        # Common document metadata fields (stored in metadata dict):
        # - title, author, subject, creator, producer
        # - creation_date, modification_date
        # - page_count, word_count, character_count
        # - language, keywords


class DirectoryMetadata(BaseModel):
    """Directory metadata document"""
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    
    absolute_path: str
    directory_name: str
    parent_path: Optional[str] = None
    
    # Directory attributes (from the original system)
    is_album: bool = False
    is_compilation: bool = False
    is_recent: bool = False
    
    # Statistics
    total_files: int = 0
    total_size: int = 0
    file_types: Dict[str, int] = Field(default_factory=dict)  # extension -> count
    
    # Timestamps
    last_scanned: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Metadata aggregated from files
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}