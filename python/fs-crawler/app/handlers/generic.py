"""
Generic file handler for basic file information
"""

import os
import asyncio
from typing import Dict, Any, Optional
from pathlib import Path
import structlog

from .base import BaseMetadataHandler

logger = structlog.get_logger()


class GenericFileHandler(BaseMetadataHandler):
    """Generic file metadata extraction for all file types"""
    
    def __init__(self):
        super().__init__()
        # No specific extensions - handles all files
        self.supported_extensions = []
    
    async def extract_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Extract basic file system metadata"""
        try:
            # Run file operations in thread pool
            loop = asyncio.get_event_loop()
            
            # Get file stats
            stat_info = await loop.run_in_executor(None, os.stat, file_path)
            path_obj = Path(file_path)
            
            metadata = {
                'file_permissions': oct(stat_info.st_mode)[-3:],
                'file_owner_uid': stat_info.st_uid,
                'file_group_gid': stat_info.st_gid,
                'file_inode': stat_info.st_ino,
                'file_links': stat_info.st_nlink,
            }
            
            # Try to detect file type using python-magic if available
            try:
                import magic
                file_type = await loop.run_in_executor(None, magic.from_file, file_path)
                metadata['file_type_description'] = file_type
                
                # Get MIME type
                mime_type = await loop.run_in_executor(None, magic.from_file, file_path, mime=True)
                metadata['detected_mime_type'] = mime_type
                
            except ImportError:
                logger.debug("python-magic not available, skipping file type detection")
            except Exception as e:
                logger.debug("Failed to detect file type", file=file_path, error=str(e))
            
            # Check if file appears to be text-based
            if await self._is_text_file(file_path):
                metadata['is_text_file'] = True
                
                # For small text files, extract some content for searching
                if stat_info.st_size < 1024 * 1024:  # Less than 1MB
                    try:
                        content_sample = await self._extract_text_sample(file_path)
                        if content_sample:
                            metadata['text_content_sample'] = content_sample
                    except Exception as e:
                        logger.debug("Failed to extract text sample", file=file_path, error=str(e))
            else:
                metadata['is_text_file'] = False
            
            # Check if file is executable
            metadata['is_executable'] = os.access(file_path, os.X_OK)
            
            # Check if file is hidden (starts with dot on Unix-like systems)
            metadata['is_hidden'] = path_obj.name.startswith('.')
            
            return metadata
            
        except Exception as e:
            logger.warning("Failed to extract generic metadata", file=file_path, error=str(e))
            return None
    
    async def _is_text_file(self, file_path: str) -> bool:
        """Check if file appears to be text-based"""
        try:
            loop = asyncio.get_event_loop()
            
            # Read first 1024 bytes to check for binary content
            def read_sample():
                with open(file_path, 'rb') as f:
                    return f.read(1024)
            
            sample = await loop.run_in_executor(None, read_sample)
            
            # Check for null bytes (common in binary files)
            if b'\x00' in sample:
                return False
            
            # Try to decode as UTF-8
            try:
                sample.decode('utf-8')
                return True
            except UnicodeDecodeError:
                # Try other common encodings
                for encoding in ['latin-1', 'cp1252', 'iso-8859-1']:
                    try:
                        sample.decode(encoding)
                        return True
                    except UnicodeDecodeError:
                        continue
                
                return False
                
        except Exception:
            return False
    
    async def _extract_text_sample(self, file_path: str, max_chars: int = 500) -> Optional[str]:
        """Extract a sample of text content for indexing"""
        try:
            loop = asyncio.get_event_loop()
            
            def read_text():
                encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
                
                for encoding in encodings:
                    try:
                        with open(file_path, 'r', encoding=encoding) as f:
                            content = f.read(max_chars * 2)  # Read a bit more than needed
                            
                            # Clean up the content
                            content = content.replace('\r\n', ' ').replace('\n', ' ').replace('\t', ' ')
                            
                            # Remove multiple spaces
                            import re
                            content = re.sub(r'\s+', ' ', content).strip()
                            
                            # Truncate to max_chars
                            if len(content) > max_chars:
                                content = content[:max_chars] + '...'
                            
                            return content
                    except UnicodeDecodeError:
                        continue
                
                return None
            
            return await loop.run_in_executor(None, read_text)
            
        except Exception:
            return None