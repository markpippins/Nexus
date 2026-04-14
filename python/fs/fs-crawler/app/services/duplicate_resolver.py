"""
Duplicate Resolution Service
Combines duplicate detection with rules engine for intelligent deletion decisions
"""

import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
import structlog

from database import get_mongodb, get_redis
from services.duplicate_detector import DuplicateDetector
from services.rules_engine import RulesEngine
from models.rules_models import RuleExecutionResult
from config import settings

logger = structlog.get_logger()


class DuplicateResolver:
    """
    High-level service that combines duplicate detection with rules engine
    
    Workflow:
    1. Find duplicate groups
    2. For each group, apply rules to determine actions
    3. Execute actions (delete, keep, review)
    4. Track resolution decisions
    """
    
    def __init__(self):
        self.mongodb = None
        self.redis_client = None
        self.duplicate_detector = DuplicateDetector()
        self.rules_engine = RulesEngine()
    
    async def _init_clients(self):
        """Initialize database clients"""
        if not self.mongodb:
            self.mongodb = get_mongodb()
        if not self.redis_client:
            self.redis_client = get_redis()
    
    async def resolve_all_duplicates(self, 
                                   batch_size: int = 50,
                                   dry_run: bool = True,
                                   rule_set_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Resolve all duplicates using the rules engine
        
        Args:
            batch_size: Number of duplicate groups to process at once
            dry_run: If True, only analyze without making changes
            rule_set_id: Specific rule set to use (None = use all enabled rules)
            
        Returns:
            Resolution statistics and results
        """
        await self._init_clients()
        
        logger.info("Starting duplicate resolution", 
                   batch_size=batch_size, 
                   dry_run=dry_run)
        
        stats = {
            "groups_processed": 0,
            "files_analyzed": 0,
            "deletion_decisions": 0,
            "keep_decisions": 0,
            "review_decisions": 0,
            "errors": 0,
            "execution_time_seconds": 0
        }
        
        start_time = datetime.utcnow()
        
        try:
            # Get duplicate groups
            duplicate_groups = await self.duplicate_detector.find_duplicates_by_fingerprint(batch_size)
            
            for group in duplicate_groups:
                try:
                    group_result = await self.resolve_duplicate_group(
                        group, dry_run=dry_run, rule_set_id=rule_set_id
                    )
                    
                    # Update statistics
                    stats["groups_processed"] += 1
                    stats["files_analyzed"] += group_result["files_analyzed"]
                    stats["deletion_decisions"] += group_result["deletion_decisions"]
                    stats["keep_decisions"] += group_result["keep_decisions"]
                    stats["review_decisions"] += group_result["review_decisions"]
                    
                except Exception as e:
                    logger.error("Failed to resolve duplicate group", 
                               fingerprint=group.get("fingerprint"), 
                               error=str(e))
                    stats["errors"] += 1
            
            # Process content hash duplicates as well
            hash_groups = await self.duplicate_detector.find_duplicates_by_content_hash(batch_size)
            
            for group in hash_groups:
                try:
                    group_result = await self.resolve_duplicate_group(
                        group, dry_run=dry_run, rule_set_id=rule_set_id
                    )
                    
                    stats["groups_processed"] += 1
                    stats["files_analyzed"] += group_result["files_analyzed"]
                    stats["deletion_decisions"] += group_result["deletion_decisions"]
                    stats["keep_decisions"] += group_result["keep_decisions"]
                    stats["review_decisions"] += group_result["review_decisions"]
                    
                except Exception as e:
                    logger.error("Failed to resolve hash duplicate group", 
                               content_hash=group.get("content_hash"), 
                               error=str(e))
                    stats["errors"] += 1
        
        finally:
            stats["execution_time_seconds"] = (datetime.utcnow() - start_time).total_seconds()
        
        logger.info("Duplicate resolution completed", **stats)
        return stats
    
    async def resolve_duplicate_group(self, 
                                    duplicate_group: Dict[str, Any],
                                    dry_run: bool = True,
                                    rule_set_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Resolve a single duplicate group using rules engine
        
        Args:
            duplicate_group: Group of duplicate files
            dry_run: If True, only analyze without making changes
            rule_set_id: Specific rule set to use
            
        Returns:
            Resolution results for this group
        """
        files = duplicate_group.get("files", [])
        group_id = duplicate_group.get("fingerprint") or duplicate_group.get("content_hash")
        
        results = {
            "group_id": group_id,
            "files_analyzed": len(files),
            "deletion_decisions": 0,
            "keep_decisions": 0,
            "review_decisions": 0,
            "file_results": []
        }
        
        # Get full metadata for each file
        for file_info in files:
            file_id = file_info.get("file_id")
            
            try:
                # Get complete file metadata
                from bson import ObjectId
                file_metadata = await self.mongodb.file_metadata.find_one({"_id": ObjectId(file_id)})
                
                if not file_metadata:
                    logger.warning("File metadata not found", file_id=file_id)
                    continue
                
                # Convert ObjectId to string for JSON serialization
                file_metadata["_id"] = str(file_metadata["_id"])
                
                # Apply rules engine
                rule_results = await self.rules_engine.evaluate_file_against_rules(
                    file_metadata, duplicate_group
                )
                
                # Determine final action based on rule results
                final_action = self._determine_final_action(rule_results)
                
                file_result = {
                    "file_id": file_id,
                    "file_path": file_metadata.get("absolute_path"),
                    "final_action": final_action,
                    "rule_results": [r.dict() for r in rule_results],
                    "dry_run": dry_run
                }
                
                # Execute action if not dry run
                if not dry_run and final_action:
                    await self._execute_final_action(file_id, final_action, rule_results)
                
                # Update statistics
                if final_action == "delete":
                    results["deletion_decisions"] += 1
                elif final_action == "keep":
                    results["keep_decisions"] += 1
                elif final_action == "review":
                    results["review_decisions"] += 1
                
                results["file_results"].append(file_result)
                
            except Exception as e:
                logger.error("Failed to process file in duplicate group", 
                           file_id=file_id, error=str(e))
        
        # Record resolution decision
        if not dry_run:
            await self._record_resolution_decision(duplicate_group, results)
        
        return results
    
    def _determine_final_action(self, rule_results: List[RuleExecutionResult]) -> Optional[str]:
        """
        Determine final action based on rule execution results
        
        Priority order:
        1. DELETE - if any rule says delete
        2. KEEP - if any rule says keep and no delete
        3. REVIEW - if any rule says review and no delete/keep
        4. None - if no rules matched
        """
        
        actions = []
        for result in rule_results:
            if result.matched and result.action_taken:
                actions.append(result.action_taken.value)
        
        if not actions:
            return None
        
        # Priority-based decision
        if "delete" in actions:
            return "delete"
        elif "keep" in actions:
            return "keep"
        elif "mark_for_review" in actions:
            return "review"
        
        return None
    
    async def _execute_final_action(self, file_id: str, action: str, rule_results: List[RuleExecutionResult]):
        """Execute the final determined action"""
        
        from bson import ObjectId
        
        # Collect reasons from matching rules
        reasons = [r.reason for r in rule_results if r.matched and r.reason]
        combined_reason = "; ".join(reasons) if reasons else f"Rules engine decision: {action}"
        
        if action == "delete":
            await self.mongodb.file_metadata.update_one(
                {"_id": ObjectId(file_id)},
                {
                    "$set": {
                        "deletion_candidate": True,
                        "deletion_reason": combined_reason,
                        "resolved_by_rules": True,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        
        elif action == "keep":
            await self.mongodb.file_metadata.update_one(
                {"_id": ObjectId(file_id)},
                {
                    "$set": {
                        "deletion_candidate": False,
                        "keep_reason": combined_reason,
                        "resolved_by_rules": True,
                        "updated_at": datetime.utcnow()
                    },
                    "$addToSet": {"tags": "rules_keep"}
                }
            )
        
        elif action == "review":
            await self.mongodb.file_metadata.update_one(
                {"_id": ObjectId(file_id)},
                {
                    "$addToSet": {"tags": "needs_review"},
                    "$set": {
                        "review_reason": combined_reason,
                        "resolved_by_rules": True,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
    
    async def _record_resolution_decision(self, duplicate_group: Dict[str, Any], results: Dict[str, Any]):
        """Record the resolution decision for audit trail"""
        
        group_id = results["group_id"]
        
        # Find kept and deleted files
        kept_files = []
        deleted_files = []
        
        for file_result in results["file_results"]:
            if file_result["final_action"] == "keep":
                kept_files.append(file_result["file_path"])
            elif file_result["final_action"] == "delete":
                deleted_files.append(file_result["file_path"])
        
        # Record in resolution tracking
        resolution_record = {
            "duplicate_group_id": group_id,
            "total_files": results["files_analyzed"],
            "kept_files": kept_files,
            "deleted_files": deleted_files,
            "review_files": [f["file_path"] for f in results["file_results"] if f["final_action"] == "review"],
            "resolution_summary": {
                "deletions": results["deletion_decisions"],
                "keeps": results["keep_decisions"],
                "reviews": results["review_decisions"]
            },
            "resolved_at": datetime.utcnow(),
            "resolved_by": "rules_engine"
        }
        
        await self.mongodb.duplicate_resolutions.insert_one(resolution_record)
    
    async def get_resolution_statistics(self) -> Dict[str, Any]:
        """Get statistics about resolution decisions"""
        await self._init_clients()
        
        # Count resolutions by type
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_groups_resolved": {"$sum": 1},
                    "total_files_processed": {"$sum": "$total_files"},
                    "total_deletions": {"$sum": "$resolution_summary.deletions"},
                    "total_keeps": {"$sum": "$resolution_summary.keeps"},
                    "total_reviews": {"$sum": "$resolution_summary.reviews"}
                }
            }
        ]
        
        stats_cursor = self.mongodb.duplicate_resolutions.aggregate(pipeline)
        stats = await stats_cursor.to_list(1)
        
        if stats:
            return stats[0]
        else:
            return {
                "total_groups_resolved": 0,
                "total_files_processed": 0,
                "total_deletions": 0,
                "total_keeps": 0,
                "total_reviews": 0
            }
    
    async def preview_resolution(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Preview what would happen with current rules (dry run)
        
        Returns sample resolution results without making changes
        """
        await self._init_clients()
        
        # Get a small sample of duplicate groups
        duplicate_groups = await self.duplicate_detector.find_duplicates_by_fingerprint(limit)
        
        preview_results = []
        
        for group in duplicate_groups[:limit]:
            try:
                result = await self.resolve_duplicate_group(group, dry_run=True)
                preview_results.append(result)
            except Exception as e:
                logger.error("Preview resolution failed", error=str(e))
        
        return preview_results