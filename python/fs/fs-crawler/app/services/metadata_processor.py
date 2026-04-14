"""
Metadata processing service - modernized version of the original read.py
Handles extraction of metadata from various file types
"""

import os
import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import structlog

# Handle imports differently when run as a script vs module
try:
    from ..models.mongodb_models import FileMetadata, AudioMetadata, VideoMetadata, ImageMetadata, DocumentMetadata
    from ..handlers.audio import MutagenHandler
    from ..handlers.image import ExifHandler
    from ..handlers.generic import GenericFileHandler
    from ..config import settings
except ImportError:
    # When run as a script, use absolute imports
    import sys
    sys.path.append(str(Path(__file__).parents[2]))  # Go up two levels to app/

    from models.mongodb_models import FileMetadata, AudioMetadata, VideoMetadata, ImageMetadata, DocumentMetadata
    from handlers.audio import MutagenHandler
    from handlers.image import ExifHandler
    from handlers.generic import GenericFileHandler
    from config import settings

logger = structlog.get_logger()


class MetadataProcessor:
    """
    Centralized metadata processing service
    
    Improvements over original:
    - Plugin-based handler system
    - Async processing
    - Better error handling
    - Flexible metadata schema
    """
    
    def __init__(self):
        self.handlers = {}
        self._initialize_handlers()
    
    def _initialize_handlers(self):
        """Initialize metadata handlers"""
        # Audio handlers
        self.handlers['audio'] = MutagenHandler()
        
        # Image handlers  
        self.handlers['image'] = ExifHandler()
        
        # Generic file handler (always last)
        self.handlers['generic'] = GenericFileHandler()
        
        logger.info("Metadata handlers initialized", handlers=list(self.handlers.keys()))
    
    async def process_file(self, file_path: str) -> Optional[FileMetadata]:
        """
        Process a file and extract all available metadata
        Enhanced for duplicate detection and quality assessment
        
        Args:
            file_path: Absolute path to the file
            
        Returns:
            FileMetadata object or None if processing failed
        """
        try:
            # Get basic file information
            stat_info = os.stat(file_path)
            path_obj = Path(file_path)
            
            # Determine file category and MIME type
            mime_type, _ = mimetypes.guess_type(file_path)
            file_category = self._determine_file_category(path_obj.suffix.lower(), mime_type)
            
            # Generate content hash for duplicate detection
            content_hash = await self._generate_content_hash(file_path)
            
            # Classify path type for deletion rules
            path_type = self._classify_path_type(file_path)
            
            # Create base metadata
            base_metadata = {
                "absolute_path": file_path,
                "filename": path_obj.name,
                "directory_path": str(path_obj.parent),
                "file_size": stat_info.st_size,
                "file_extension": path_obj.suffix.lower().lstrip('.'),
                "mime_type": mime_type,
                "file_category": file_category,
                "file_modified": datetime.fromtimestamp(stat_info.st_mtime),
                "file_created": datetime.fromtimestamp(stat_info.st_ctime) if hasattr(stat_info, 'st_birthtime') else None,
                "content_hash": content_hash,
                "path_type": path_type,
                "metadata": {},
                "tags": [],
                "searchable_text": ""
            }
            
            # Process with appropriate handlers
            extracted_metadata = {}
            
            # Try category-specific handler first
            if file_category in self.handlers:
                try:
                    category_metadata = await self.handlers[file_category].extract_metadata(file_path)
                    if category_metadata:
                        extracted_metadata.update(category_metadata)
                except Exception as e:
                    logger.warning("Category handler failed", 
                                 category=file_category, 
                                 file=file_path, 
                                 error=str(e))
            
            # Always run generic handler for basic file info
            try:
                generic_metadata = await self.handlers['generic'].extract_metadata(file_path)
                if generic_metadata:
                    # Generic metadata has lower priority
                    for key, value in generic_metadata.items():
                        if key not in extracted_metadata:
                            extracted_metadata[key] = value
            except Exception as e:
                logger.warning("Generic handler failed", file=file_path, error=str(e))
            
            # Merge extracted metadata
            base_metadata["metadata"] = extracted_metadata
            
            # Generate searchable text
            base_metadata["searchable_text"] = self._generate_searchable_text(
                base_metadata, extracted_metadata
            )
            
            # Generate tags
            base_metadata["tags"] = self._generate_tags(base_metadata, extracted_metadata)
            
            # Create appropriate metadata object based on category
            if file_category == "audio":
                return AudioMetadata(**base_metadata)
            elif file_category == "video":
                return VideoMetadata(**base_metadata)
            elif file_category == "image":
                return ImageMetadata(**base_metadata)
            elif file_category == "document":
                return DocumentMetadata(**base_metadata)
            else:
                return FileMetadata(**base_metadata)
                
        except Exception as e:
            logger.error("Failed to process file", file=file_path, error=str(e))
            return None
    
    def _determine_file_category(self, extension: str, mime_type: Optional[str]) -> str:
        """Determine file category based on extension and MIME type"""
        extension = extension.lstrip('.')
        
        # Audio extensions
        audio_exts = {'mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma', 'aac', 'opus'}
        if extension in audio_exts or (mime_type and mime_type.startswith('audio/')):
            return 'audio'
        
        # Video extensions
        video_exts = {'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'}
        if extension in video_exts or (mime_type and mime_type.startswith('video/')):
            return 'video'
        
        # Image extensions
        image_exts = {'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'svg'}
        if extension in image_exts or (mime_type and mime_type.startswith('image/')):
            return 'image'
        
        # Document extensions
        doc_exts = {'pdf', 'txt', 'doc', 'docx', 'rtf', 'odt'}
        if extension in doc_exts or (mime_type and mime_type.startswith('text/')):
            return 'document'
        
        return 'other'
    
    def _generate_searchable_text(self, base_metadata: Dict[str, Any], extracted_metadata: Dict[str, Any]) -> str:
        """Generate searchable text from metadata"""
        text_parts = []
        
        # Add filename (without extension)
        filename_no_ext = Path(base_metadata["filename"]).stem
        text_parts.append(filename_no_ext)
        
        # Add common metadata fields that are text-searchable
        searchable_fields = [
            'title', 'artist', 'album', 'albumartist', 'genre',
            'author', 'creator', 'subject', 'description', 'keywords',
            'camera_make', 'camera_model'
        ]
        
        for field in searchable_fields:
            if field in extracted_metadata and extracted_metadata[field]:
                text_parts.append(str(extracted_metadata[field]))
        
        return ' '.join(text_parts).lower()
    
    def _generate_tags(self, base_metadata: Dict[str, Any], extracted_metadata: Dict[str, Any]) -> List[str]:
        """Generate tags from metadata for easier filtering"""
        tags = []
        
        # Add file category as tag
        tags.append(base_metadata["file_category"])
        
        # Add file extension as tag
        tags.append(base_metadata["file_extension"])
        
        # Add genre/category tags
        if 'genre' in extracted_metadata and extracted_metadata['genre']:
            genre = str(extracted_metadata['genre']).lower()
            tags.append(f"genre:{genre}")
        
        # Add year tag if available
        year_fields = ['year', 'date', 'creation_date']
        for field in year_fields:
            if field in extracted_metadata and extracted_metadata[field]:
                try:
                    year = str(extracted_metadata[field])[:4]  # Extract year part
                    if year.isdigit():
                        tags.append(f"year:{year}")
                        break
                except:
                    pass
        
        return list(set(tags))  # Remove duplicates
    
    def get_supported_extensions(self) -> List[str]:
        """Get list of all supported file extensions"""
        return settings.supported_extensions    

    async def _generate_content_hash(self, file_path: str) -> str:
        """
        Generate content hash for duplicate detection
        Uses first and last chunks to balance speed vs accuracy
        """
        import hashlib
        
        try:
            loop = asyncio.get_event_loop()
            
            def hash_file():
                hasher = hashlib.md5()
                
                with open(file_path, 'rb') as f:
                    # Read first 64KB
                    chunk = f.read(65536)
                    if chunk:
                        hasher.update(chunk)
                    
                    # Seek to end and read last 64KB (if file is large enough)
                    f.seek(0, 2)  # Seek to end
                    file_size = f.tell()
                    
                    if file_size > 131072:  # If file > 128KB
                        f.seek(-65536, 2)  # Seek to 64KB from end
                        chunk = f.read(65536)
                        if chunk:
                            hasher.update(chunk)
                
                return hasher.hexdigest()
            
            return await loop.run_in_executor(None, hash_file)
            
        except Exception as e:
            logger.warning("Failed to generate content hash", file=file_path, error=str(e))
            return ""
    
    def _classify_path_type(self, file_path: str) -> str:
        """
        Classify path type for deletion rules
        Determines if file is in album, compilation, misc directory, etc.
        """
        path_lower = file_path.lower()
        path_parts = Path(file_path).parts
        
        # Look for path indicators
        for part in path_parts:
            part_lower = part.lower()
            
            # Album indicators
            if any(indicator in part_lower for indicator in [
                'album', 'discography', 'studio', 'live', 'concert'
            ]):
                return 'album'
            
            # Compilation indicators  
            if any(indicator in part_lower for indicator in [
                'compilation', 'various', 'va -', 'mixed', 'collection',
                'best of', 'greatest hits', 'anthology'
            ]):
                return 'compilation'
            
            # Single/EP indicators
            if any(indicator in part_lower for indicator in [
                'single', 'ep -', 'maxi'
            ]):
                return 'single'
            
            # Soundtrack indicators
            if any(indicator in part_lower for indicator in [
                'soundtrack', 'ost', 'original score'
            ]):
                return 'soundtrack'
        
        # Check directory structure depth and naming
        # Deeper, organized structures are likely albums
        if len(path_parts) >= 4:  # /media/music/artist/album/file
            # Check if parent directory looks like an album
            parent_dir = path_parts[-2].lower()
            if not any(misc_indicator in parent_dir for misc_indicator in [
                'misc', 'unsorted', 'temp', 'download', 'new'
            ]):
                return 'album'
        
        # Default to miscellaneous
        return 'misc'
    
    def get_path_type_priority(self, path_type: str) -> int:
        """
        Get priority score for path types (higher = keep, lower = delete)
        Used in duplicate resolution
        """
        priorities = {
            'album': 100,      # Highest priority - organized albums
            'soundtrack': 90,   # High priority - soundtracks
            'single': 80,      # Medium-high - official singles
            'compilation': 70,  # Medium - compilations
            'misc': 50         # Lowest - miscellaneous/unsorted
        }
        
        return priorities.get(path_type, 50)