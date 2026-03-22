"""
Audio metadata handler using Mutagen
Enhanced for duplicate detection and quality assessment
"""

import asyncio
import hashlib
from typing import Dict, Any, Optional
import structlog

from .base import BaseMetadataHandler

logger = structlog.get_logger()


class MutagenHandler(BaseMetadataHandler):
    """Audio metadata extraction using Mutagen library"""
    
    def __init__(self):
        super().__init__()
        self.supported_extensions = [
            'mp3', 'flac', 'ogg', 'mp4', 'm4a', 'wma', 'wav', 'aac', 'opus'
        ]
    
    async def extract_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Extract audio metadata using Mutagen"""
        try:
            # Import mutagen here to avoid import errors if not installed
            from mutagen import File as MutagenFile
            from mutagen.id3 import ID3NoHeaderError
            
            # Run mutagen in thread pool since it's blocking I/O
            loop = asyncio.get_event_loop()
            audio_file = await loop.run_in_executor(None, MutagenFile, file_path)
            
            if audio_file is None:
                return None
            
            metadata = {}
            
            # Extract common audio metadata
            metadata.update({
                'title': self._get_tag_value(audio_file, ['TIT2', 'TITLE', '\xa9nam']),
                'artist': self._get_tag_value(audio_file, ['TPE1', 'ARTIST', '\xa9ART']),
                'album': self._get_tag_value(audio_file, ['TALB', 'ALBUM', '\xa9alb']),
                'albumartist': self._get_tag_value(audio_file, ['TPE2', 'ALBUMARTIST', 'aART']),
                'date': self._get_tag_value(audio_file, ['TDRC', 'DATE', '\xa9day']),
                'year': self._get_year_from_date(audio_file),
                'genre': self._get_tag_value(audio_file, ['TCON', 'GENRE', '\xa9gen']),
                'track_number': self._get_track_number(audio_file),
                'disc_number': self._get_disc_number(audio_file),
                'total_tracks': self._get_total_tracks(audio_file),
                'total_discs': self._get_total_discs(audio_file),
            })
            
            # Audio technical information
            if hasattr(audio_file, 'info') and audio_file.info:
                info = audio_file.info
                duration = getattr(info, 'length', None)
                bitrate = getattr(info, 'bitrate', None)
                sample_rate = getattr(info, 'sample_rate', None)
                
                metadata.update({
                    'duration': duration,
                    'bitrate': bitrate,
                    'sample_rate': sample_rate,
                    'channels': getattr(info, 'channels', None),
                    'bits_per_sample': getattr(info, 'bits_per_sample', None),
                })
                
                # Format-specific codec information
                codec = None
                if hasattr(info, 'codec'):
                    codec = info.codec
                elif 'mp3' in file_path.lower():
                    codec = 'MP3'
                elif 'flac' in file_path.lower():
                    codec = 'FLAC'
                elif 'ogg' in file_path.lower():
                    codec = 'OGG'
                elif 'm4a' in file_path.lower():
                    codec = 'AAC'
                
                if codec:
                    metadata['codec'] = codec
                
                # Quality scoring for duplicate detection
                metadata['quality_score'] = self._calculate_quality_score(codec, bitrate, sample_rate)
                
                # Audio fingerprint for duplicate detection
                if duration and bitrate and sample_rate:
                    fingerprint = self._generate_audio_fingerprint(
                        duration, bitrate, sample_rate, 
                        metadata.get('title', ''), 
                        metadata.get('artist', ''),
                        metadata.get('album', '')
                    )
                    metadata['audio_fingerprint'] = fingerprint
            
            # Clean up None values and convert to strings where appropriate
            cleaned_metadata = {}
            for key, value in metadata.items():
                if value is not None:
                    if isinstance(value, (list, tuple)) and len(value) > 0:
                        cleaned_metadata[key] = str(value[0])
                    elif not isinstance(value, (dict, list, tuple)):
                        cleaned_metadata[key] = str(value) if value != '' else None
                    else:
                        cleaned_metadata[key] = value
            
            return {k: v for k, v in cleaned_metadata.items() if v is not None}
            
        except ImportError:
            logger.error("Mutagen not installed - audio metadata extraction disabled")
            return None
        except Exception as e:
            logger.warning("Failed to extract audio metadata", file=file_path, error=str(e))
            return None
    
    def _get_tag_value(self, audio_file, tag_keys):
        """Get tag value trying multiple possible keys"""
        for key in tag_keys:
            if key in audio_file:
                value = audio_file[key]
                if isinstance(value, list) and len(value) > 0:
                    return value[0]
                elif value:
                    return value
        return None
    
    def _get_year_from_date(self, audio_file):
        """Extract year from various date fields"""
        date_value = self._get_tag_value(audio_file, ['TDRC', 'DATE', '\xa9day', 'YEAR'])
        if date_value:
            date_str = str(date_value)
            # Extract first 4 digits as year
            for i in range(len(date_str) - 3):
                if date_str[i:i+4].isdigit():
                    return int(date_str[i:i+4])
        return None
    
    def _get_track_number(self, audio_file):
        """Extract track number from various fields"""
        track = self._get_tag_value(audio_file, ['TRCK', 'TRACKNUMBER', 'trkn'])
        if track:
            track_str = str(track)
            # Handle "track/total" format
            if '/' in track_str:
                return int(track_str.split('/')[0])
            else:
                try:
                    return int(track_str)
                except ValueError:
                    pass
        return None
    
    def _get_disc_number(self, audio_file):
        """Extract disc number from various fields"""
        disc = self._get_tag_value(audio_file, ['TPOS', 'DISCNUMBER', 'disk'])
        if disc:
            disc_str = str(disc)
            if '/' in disc_str:
                return int(disc_str.split('/')[0])
            else:
                try:
                    return int(disc_str)
                except ValueError:
                    pass
        return None
    
    def _get_total_tracks(self, audio_file):
        """Extract total tracks from track field"""
        track = self._get_tag_value(audio_file, ['TRCK', 'TRACKNUMBER', 'trkn'])
        if track:
            track_str = str(track)
            if '/' in track_str:
                try:
                    return int(track_str.split('/')[1])
                except (ValueError, IndexError):
                    pass
        return None
    
    def _get_total_discs(self, audio_file):
        """Extract total discs from disc field"""
        disc = self._get_tag_value(audio_file, ['TPOS', 'DISCNUMBER', 'disk'])
        if disc:
            disc_str = str(disc)
            if '/' in disc_str:
                try:
                    return int(disc_str.split('/')[1])
                except (ValueError, IndexError):
                    pass
        return None  
  
    def _calculate_quality_score(self, codec: Optional[str], bitrate: Optional[int], sample_rate: Optional[int]) -> int:
        """
        Calculate a quality score for duplicate comparison
        Higher score = better quality
        """
        score = 0
        
        # Codec scoring (format preference)
        codec_scores = {
            'FLAC': 1000,      # Lossless - highest priority
            'ALAC': 950,       # Apple Lossless
            'APE': 900,        # Monkey's Audio
            'WV': 850,         # WavPack
            'AAC': 600,        # Modern lossy
            'OGG': 550,        # Ogg Vorbis
            'MP3': 500,        # Standard lossy
            'WMA': 400,        # Windows Media
            'MP2': 300,        # Older MPEG
        }
        
        if codec:
            score += codec_scores.get(codec.upper(), 200)
        
        # Bitrate scoring
        if bitrate:
            if codec and codec.upper() in ['FLAC', 'ALAC', 'APE', 'WV']:
                # Lossless formats - bitrate doesn't matter as much
                score += min(bitrate // 100, 50)  # Cap at 50 points
            else:
                # Lossy formats - bitrate is crucial
                if bitrate >= 320:
                    score += 100
                elif bitrate >= 256:
                    score += 80
                elif bitrate >= 192:
                    score += 60
                elif bitrate >= 128:
                    score += 40
                else:
                    score += 20
        
        # Sample rate scoring
        if sample_rate:
            if sample_rate >= 96000:
                score += 30
            elif sample_rate >= 48000:
                score += 20
            elif sample_rate >= 44100:
                score += 10
            else:
                score += 5
        
        return score
    
    def _generate_audio_fingerprint(self, duration: float, bitrate: int, sample_rate: int, 
                                  title: str, artist: str, album: str) -> str:
        """
        Generate a fingerprint for duplicate detection
        Combines metadata to identify likely duplicates
        """
        # Normalize metadata for comparison
        title_norm = self._normalize_for_comparison(title or '')
        artist_norm = self._normalize_for_comparison(artist or '')
        album_norm = self._normalize_for_comparison(album or '')
        
        # Round duration to nearest second for fuzzy matching
        duration_rounded = round(duration) if duration else 0
        
        # Create fingerprint string
        fingerprint_data = f"{title_norm}|{artist_norm}|{album_norm}|{duration_rounded}"
        
        # Hash for consistent length
        return hashlib.md5(fingerprint_data.encode('utf-8')).hexdigest()
    
    def _normalize_for_comparison(self, text: str) -> str:
        """
        Normalize text for duplicate comparison
        Removes common variations that shouldn't affect matching
        """
        import re
        
        # Convert to lowercase
        text = text.lower()
        
        # Remove common punctuation and extra spaces
        text = re.sub(r'[^\w\s]', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Remove common words that cause false differences
        remove_words = ['the', 'a', 'an', 'and', 'or', 'but', 'feat', 'ft', 'featuring']
        words = text.split()
        words = [w for w in words if w not in remove_words]
        
        return ' '.join(words)