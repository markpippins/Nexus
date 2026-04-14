"""
Base metadata handler interface
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List


class BaseMetadataHandler(ABC):
    """Base class for all metadata handlers"""
    
    def __init__(self):
        self.name = self.__class__.__name__
        self.supported_extensions: List[str] = []
    
    @abstractmethod
    async def extract_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Extract metadata from a file
        
        Args:
            file_path: Absolute path to the file
            
        Returns:
            Dictionary of metadata or None if extraction failed
        """
        pass
    
    def can_handle(self, file_path: str) -> bool:
        """Check if this handler can process the given file"""
        if not self.supported_extensions:
            return True  # Generic handlers can handle any file
        
        extension = file_path.lower().split('.')[-1]
        return extension in self.supported_extensions
    
    def _safe_extract(self, func, *args, **kwargs) -> Any:
        """Safely execute extraction function with error handling"""
        try:
            return func(*args, **kwargs)
        except Exception:
            return None