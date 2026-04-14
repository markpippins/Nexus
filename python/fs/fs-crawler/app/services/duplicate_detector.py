"""
Duplicate detection and quality assessment service
Identifies duplicate files and determines which ones to keep/delete
"""

import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
import structlog

from database import get_mongodb, get_redis
from models.mongodb_models import FileMetadata
from services.metadata_processor import MetadataProcessor
from config import settings

logger = structlog.get_logger()


class DuplicateDetector:
    """
    Duplicate detection and resolution service
    
    Handles:
    - Finding potential duplicates using audio fingerprints
    - Quality assessment and scoring
    - Path-based preference rules
    - Marking files for deletion
    """
    
    def __init__(self):
        self.mongodb = None
        self.redis_client = None
        self.metadata_processor = MetadataProcessor()
    
    async def _init_clients(self):
        """Initialize database clients"""
        if not self.mongodb:
            self.mongodb = get_mongodb()
        if not self.redis_client:
            self.redis_client = get_redis()
    
    async def find_duplicates_by_fingerprint(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Find duplicate groups using audio fingerprints
        
        Returns:
            List of duplicate groups with file information
        """
        await self._init_clients()
        
        # Aggregate pipeline to find files with same fingerprint
        pipeline = [
            {
                "$match": {
                    "file_category": "audio",
                    "audio_fingerprint": {"$exists": True, "$ne": None}
                }
            },
            {
                "$group": {
                    "_id": "$audio_fingerprint",
                    "files": {
                        "$push": {
                            "file_id": "$_id",
                            "path": "$absolute_path",
                            "quality_score": "$quality_score",
                            "path_type": "$path_type",
                            "file_size": "$file_size",
                            "bitrate": "$metadata.bitrate",
                            "codec": "$metadata.codec"
                        }
                    },
                    "count": {"$sum": 1}
                }
            },
            {
                "$match": {"count": {"$gt": 1}}  # Only groups with duplicates
            },
            {
                "$limit": limit
            }
        ]
        
        duplicate_groups = []
        async for group in self.mongodb.file_metadata.aggregate(pipeline):
            duplicate_groups.append({
                "fingerprint": group["_id"],
                "file_count": group["count"],
                "files": group["files"]
            })
        
        logger.info("Found duplicate groups", count=len(duplicate_groups))
        return duplicate_groups
    
    async def find_duplicates_by_content_hash(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Find exact duplicates using content hash
        More reliable but catches fewer duplicates than fingerprint matching
        """
        await self._init_clients()
        
        pipeline = [
            {
                "$match": {
                    "content_hash": {"$exists": True, "$ne": ""}
                }
            },
            {
                "$group": {
                    "_id": "$content_hash",
                    "files": {
                        "$push": {
                            "file_id": "$_id",
                            "path": "$absolute_path",
                            "quality_score": "$quality_score",
                            "path_type": "$path_type",
                            "file_size": "$file_size"
                        }
                    },
                    "count": {"$sum": 1}
                }
            },
            {
                "$match": {"count": {"$gt": 1}}
            },
            {
                "$limit": limit
            }
        ]
        
        duplicate_groups = []
        async for group in self.mongodb.file_metadata.aggregate(pipeline):
            duplicate_groups.append({
                "content_hash": group["_id"],
                "file_count": group["count"],
                "files": group["files"]
            })
        
        return duplicate_groups
    
    async def resolve_duplicate_group(self, duplicate_group: Dict[str, Any], 
                                    auto_mark_for_deletion: bool = False) -> Dict[str, Any]:
        """
        Resolve a duplicate group by determining which file to keep
        
        Args:
            duplicate_group: Group of duplicate files
            auto_mark_for_deletion: Whether to automatically mark inferior files for deletion
            
        Returns:
            Resolution result with keep/delete decisions
        """
        files = duplicate_group["files"]
        
        # Sort files by quality score (descending) and path priority
        sorted_files = sorted(files, key=lambda f: (
            f.get("quality_score", 0),
            self.metadata_processor.get_path_type_priority(f.get("path_type", "misc")),
            -f.get("file_size", 0)  # Larger file as tiebreaker
        ), reverse=True)
        
        best_file = sorted_files[0]
        inferior_files = sorted_files[1:]
        
        resolution = {
            "best_file": best_file,
            "inferior_files": inferior_files,
            "deletion_candidates": [],
            "reasons": []
        }
        
        # Determine deletion candidates based on rules
        for file_info in inferior_files:
            should_delete, reason = await self._should_delete_file(best_file, file_info)
            
            if should_delete:
                resolution["deletion_candidates"].append(file_info)
                resolution["reasons"].append(reason)
                
                if auto_mark_for_deletion:
                    await self._mark_file_for_deletion(file_info["file_id"], reason)
        
        # Update best file status
        if auto_mark_for_deletion:
            await self._mark_as_best_quality(best_file["file_id"], duplicate_group.get("fingerprint"))
        
        return resolution
    
    async def _should_delete_file(self, best_file: Dict[str, Any], 
                                candidate_file: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Determine if a file should be deleted based on quality and path rules
        
        Returns:
            (should_delete, reason)
        """
        best_quality = best_file.get("quality_score", 0)
        candidate_quality = candidate_file.get("quality_score", 0)
        
        best_path_type = best_file.get("path_type", "misc")
        candidate_path_type = candidate_file.get("path_type", "misc")
        
        # Quality difference threshold
        quality_diff = best_quality - candidate_quality
        
        # Strong quality difference - always delete
        if quality_diff >= 200:  # e.g., FLAC vs MP3 128kbps
            return True, f"Much lower quality (score diff: {quality_diff})"
        
        # Moderate quality difference with path considerations
        if quality_diff >= 100:  # e.g., MP3 320 vs MP3 128
            # Delete if candidate is in misc/compilation and best is in album
            if candidate_path_type in ["misc", "compilation"] and best_path_type == "album":
                return True, f"Lower quality in less organized path (quality diff: {quality_diff})"
        
        # Path-based rules when quality is similar
        if quality_diff < 50:  # Similar quality
            path_priority_diff = (
                self.metadata_processor.get_path_type_priority(best_path_type) - 
                self.metadata_processor.get_path_type_priority(candidate_path_type)
            )
            
            if path_priority_diff >= 30:  # Significant path preference
                return True, f"Same quality but in less preferred path ({candidate_path_type} vs {best_path_type})"
        
        # Check for specific deletion rules from library configuration
        # TODO: Implement configurable deletion rules per library path
        
        return False, "No deletion criteria met"
    
    async def _mark_file_for_deletion(self, file_id: str, reason: str):
        """Mark a file as a deletion candidate"""
        from bson import ObjectId
        
        await self.mongodb.file_metadata.update_one(
            {"_id": ObjectId(file_id)},
            {
                "$set": {
                    "deletion_candidate": True,
                    "deletion_reason": reason,
                    "updated_at": datetime.utcnow()
                }
            }
        )
    
    async def _mark_as_best_quality(self, file_id: str, duplicate_group_id: str):
        """Mark a file as the best quality in its duplicate group"""
        from bson import ObjectId
        
        await self.mongodb.file_metadata.update_one(
            {"_id": ObjectId(file_id)},
            {
                "$set": {
                    "is_best_quality": True,
                    "duplicate_group_id": duplicate_group_id,
                    "updated_at": datetime.utcnow()
                }
            }
        )
    
    async def process_all_duplicates(self, batch_size: int = 100, 
                                   auto_mark: bool = False) -> Dict[str, int]:
        """
        Process all duplicates in batches
        
        Returns:
            Statistics about processing results
        """
        await self._init_clients()
        
        stats = {
            "groups_processed": 0,
            "files_marked_for_deletion": 0,
            "best_quality_marked": 0
        }
        
        # Process fingerprint-based duplicates
        logger.info("Processing fingerprint-based duplicates")
        fingerprint_groups = await self.find_duplicates_by_fingerprint(batch_size)
        
        for group in fingerprint_groups:
            resolution = await self.resolve_duplicate_group(group, auto_mark)
            stats["groups_processed"] += 1
            stats["files_marked_for_deletion"] += len(resolution["deletion_candidates"])
            if auto_mark:
                stats["best_quality_marked"] += 1
        
        # Process content hash duplicates (exact matches)
        logger.info("Processing content hash duplicates")
        hash_groups = await self.find_duplicates_by_content_hash(batch_size)
        
        for group in hash_groups:
            resolution = await self.resolve_duplicate_group(group, auto_mark)
            stats["groups_processed"] += 1
            stats["files_marked_for_deletion"] += len(resolution["deletion_candidates"])
            if auto_mark:
                stats["best_quality_marked"] += 1
        
        logger.info("Duplicate processing completed", **stats)
        return stats
    
    async def get_deletion_candidates(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get files marked for deletion"""
        await self._init_clients()
        
        cursor = self.mongodb.file_metadata.find(
            {"deletion_candidate": True},
            {
                "absolute_path": 1,
                "file_size": 1,
                "deletion_reason": 1,
                "metadata.bitrate": 1,
                "metadata.codec": 1,
                "path_type": 1
            }
        ).limit(limit)
        
        candidates = []
        async for doc in cursor:
            candidates.append(doc)
        
        return candidates
    
    async def get_duplicate_statistics(self) -> Dict[str, Any]:
        """Get statistics about duplicates in the system"""
        await self._init_clients()
        
        # Count total duplicates by fingerprint
        fingerprint_pipeline = [
            {"$match": {"audio_fingerprint": {"$exists": True, "$ne": None}}},
            {"$group": {"_id": "$audio_fingerprint", "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}}},
            {"$group": {"_id": None, "groups": {"$sum": 1}, "total_files": {"$sum": "$count"}}}
        ]
        
        fingerprint_stats = await self.mongodb.file_metadata.aggregate(fingerprint_pipeline).to_list(1)
        
        # Count deletion candidates
        deletion_count = await self.mongodb.file_metadata.count_documents({"deletion_candidate": True})
        
        # Count best quality files
        best_quality_count = await self.mongodb.file_metadata.count_documents({"is_best_quality": True})
        
        return {
            "duplicate_groups": fingerprint_stats[0]["groups"] if fingerprint_stats else 0,
            "duplicate_files": fingerprint_stats[0]["total_files"] if fingerprint_stats else 0,
            "deletion_candidates": deletion_count,
            "best_quality_files": best_quality_count
        }