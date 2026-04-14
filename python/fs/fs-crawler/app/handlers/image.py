"""
Image metadata handler using EXIF data
"""

import asyncio
from typing import Dict, Any, Optional
from datetime import datetime
import structlog

from .base import BaseMetadataHandler

logger = structlog.get_logger()


class ExifHandler(BaseMetadataHandler):
    """Image metadata extraction using EXIF data"""
    
    def __init__(self):
        super().__init__()
        self.supported_extensions = [
            'jpg', 'jpeg', 'tiff', 'tif', 'png', 'webp', 'bmp'
        ]
    
    async def extract_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Extract image metadata from EXIF data"""
        try:
            # Import libraries here to avoid import errors if not installed
            from PIL import Image
            from PIL.ExifTags import TAGS, GPSTAGS
            
            # Run PIL operations in thread pool since they're blocking I/O
            loop = asyncio.get_event_loop()
            
            # Open image and extract basic info
            image = await loop.run_in_executor(None, Image.open, file_path)
            
            metadata = {}
            
            # Basic image information
            metadata.update({
                'width': image.width,
                'height': image.height,
                'format': image.format,
                'mode': image.mode,
            })
            
            # Extract EXIF data if available
            if hasattr(image, '_getexif'):
                exif_data = await loop.run_in_executor(None, image._getexif)
                if exif_data:
                    exif_metadata = self._process_exif_data(exif_data)
                    metadata.update(exif_metadata)
            
            # Close image to free memory
            image.close()
            
            return metadata
            
        except ImportError:
            logger.error("PIL/Pillow not installed - image metadata extraction disabled")
            return None
        except Exception as e:
            logger.warning("Failed to extract image metadata", file=file_path, error=str(e))
            return None
    
    def _process_exif_data(self, exif_data: Dict) -> Dict[str, Any]:
        """Process raw EXIF data into readable metadata"""
        metadata = {}
        
        for tag_id, value in exif_data.items():
            tag_name = TAGS.get(tag_id, tag_id)
            
            # Handle specific EXIF tags
            if tag_name == 'DateTime':
                metadata['creation_date'] = self._parse_exif_datetime(value)
            elif tag_name == 'DateTimeOriginal':
                metadata['date_taken'] = self._parse_exif_datetime(value)
            elif tag_name == 'Make':
                metadata['camera_make'] = str(value).strip()
            elif tag_name == 'Model':
                metadata['camera_model'] = str(value).strip()
            elif tag_name == 'LensModel':
                metadata['lens_model'] = str(value).strip()
            elif tag_name == 'Software':
                metadata['software'] = str(value).strip()
            elif tag_name == 'Artist':
                metadata['artist'] = str(value).strip()
            elif tag_name == 'Copyright':
                metadata['copyright'] = str(value).strip()
            elif tag_name == 'ImageDescription':
                metadata['description'] = str(value).strip()
            elif tag_name == 'Orientation':
                metadata['orientation'] = int(value)
            elif tag_name == 'XResolution':
                metadata['x_resolution'] = float(value)
            elif tag_name == 'YResolution':
                metadata['y_resolution'] = float(value)
            elif tag_name == 'ResolutionUnit':
                metadata['resolution_unit'] = int(value)
            elif tag_name == 'ColorSpace':
                metadata['color_space'] = int(value)
            elif tag_name == 'ExifImageWidth':
                metadata['exif_width'] = int(value)
            elif tag_name == 'ExifImageHeight':
                metadata['exif_height'] = int(value)
            
            # Camera settings
            elif tag_name == 'FNumber':
                metadata['aperture'] = f"f/{float(value):.1f}"
            elif tag_name == 'ExposureTime':
                metadata['shutter_speed'] = self._format_exposure_time(value)
            elif tag_name == 'ISOSpeedRatings':
                metadata['iso'] = int(value)
            elif tag_name == 'FocalLength':
                metadata['focal_length'] = f"{float(value):.1f}mm"
            elif tag_name == 'Flash':
                metadata['flash'] = self._decode_flash_value(int(value))
            elif tag_name == 'WhiteBalance':
                metadata['white_balance'] = int(value)
            elif tag_name == 'ExposureMode':
                metadata['exposure_mode'] = int(value)
            elif tag_name == 'SceneCaptureType':
                metadata['scene_type'] = int(value)
            
            # GPS data
            elif tag_name == 'GPSInfo':
                gps_metadata = self._process_gps_data(value)
                metadata.update(gps_metadata)
        
        return metadata
    
    def _parse_exif_datetime(self, datetime_str: str) -> Optional[datetime]:
        """Parse EXIF datetime string"""
        try:
            return datetime.strptime(datetime_str, '%Y:%m:%d %H:%M:%S')
        except (ValueError, TypeError):
            return None
    
    def _format_exposure_time(self, exposure_value) -> str:
        """Format exposure time as a readable string"""
        try:
            if isinstance(exposure_value, tuple):
                numerator, denominator = exposure_value
                if denominator == 1:
                    return f"{numerator}s"
                else:
                    return f"1/{int(denominator/numerator)}s"
            else:
                return f"{float(exposure_value)}s"
        except:
            return str(exposure_value)
    
    def _decode_flash_value(self, flash_value: int) -> str:
        """Decode flash value to readable string"""
        flash_modes = {
            0: "No Flash",
            1: "Flash Fired",
            5: "Flash Fired, Return not detected",
            7: "Flash Fired, Return detected",
            9: "Flash Fired, Compulsory Flash Mode",
            13: "Flash Fired, Compulsory Flash Mode, Return not detected",
            15: "Flash Fired, Compulsory Flash Mode, Return detected",
            16: "Flash did not fire, Compulsory Flash Mode",
            24: "Flash did not fire, Auto Mode",
            25: "Flash Fired, Auto Mode",
            29: "Flash Fired, Auto Mode, Return not detected",
            31: "Flash Fired, Auto Mode, Return detected",
            32: "No Flash function",
            65: "Flash Fired, Red-eye Reduction Mode",
            69: "Flash Fired, Red-eye Reduction Mode, Return not detected",
            71: "Flash Fired, Red-eye Reduction Mode, Return detected",
            73: "Flash Fired, Compulsory Flash Mode, Red-eye Reduction Mode",
            77: "Flash Fired, Compulsory Flash Mode, Red-eye Reduction Mode, Return not detected",
            79: "Flash Fired, Compulsory Flash Mode, Red-eye Reduction Mode, Return detected",
            89: "Flash Fired, Auto Mode, Red-eye Reduction Mode",
            93: "Flash Fired, Auto Mode, Return not detected, Red-eye Reduction Mode",
            95: "Flash Fired, Auto Mode, Return detected, Red-eye Reduction Mode"
        }
        return flash_modes.get(flash_value, f"Unknown ({flash_value})")
    
    def _process_gps_data(self, gps_info: Dict) -> Dict[str, Any]:
        """Process GPS EXIF data"""
        gps_metadata = {}
        
        try:
            # Convert GPS coordinates
            if 1 in gps_info and 2 in gps_info:  # GPSLatitudeRef and GPSLatitude
                lat_ref = gps_info[1]
                lat_coords = gps_info[2]
                latitude = self._convert_gps_coordinate(lat_coords, lat_ref)
                if latitude is not None:
                    gps_metadata['gps_latitude'] = latitude
            
            if 3 in gps_info and 4 in gps_info:  # GPSLongitudeRef and GPSLongitude
                lon_ref = gps_info[3]
                lon_coords = gps_info[4]
                longitude = self._convert_gps_coordinate(lon_coords, lon_ref)
                if longitude is not None:
                    gps_metadata['gps_longitude'] = longitude
            
            if 5 in gps_info and 6 in gps_info:  # GPSAltitudeRef and GPSAltitude
                alt_ref = gps_info[5]
                alt_value = gps_info[6]
                altitude = float(alt_value)
                if alt_ref == 1:  # Below sea level
                    altitude = -altitude
                gps_metadata['gps_altitude'] = altitude
            
            if 7 in gps_info:  # GPSTimeStamp
                gps_metadata['gps_timestamp'] = str(gps_info[7])
            
            if 29 in gps_info:  # GPSDateStamp
                gps_metadata['gps_datestamp'] = str(gps_info[29])
        
        except Exception as e:
            logger.warning("Failed to process GPS data", error=str(e))
        
        return gps_metadata
    
    def _convert_gps_coordinate(self, coord_tuple, ref) -> Optional[float]:
        """Convert GPS coordinate from DMS to decimal degrees"""
        try:
            degrees, minutes, seconds = coord_tuple
            decimal = float(degrees) + float(minutes)/60 + float(seconds)/3600
            
            if ref in ['S', 'W']:
                decimal = -decimal
            
            return decimal
        except:
            return None