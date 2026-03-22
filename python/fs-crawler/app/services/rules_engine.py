"""
Rules Engine for configurable duplicate deletion logic
Implements the sophisticated "reasons" system for deletion decisions
"""

import re
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
import structlog

from database import get_mongodb, get_redis
from models.rules_models import (
    DeletionRule, RuleSet, RuleCondition, RuleGroup, RuleExecutionContext,
    RuleExecutionResult, ComparisonOperator, LogicalOperator, ActionType,
    ConditionTarget
)
from config import settings

logger = structlog.get_logger()


class RulesEngine:
    """
    Configurable rules engine for deletion decisions
    
    Supports complex logic like:
    - "Delete MP3 files in /misc/ if FLAC version exists in /albums/"
    - "Keep highest bitrate version, but prefer album over compilation"
    - "Delete files smaller than 1MB unless they're the only copy"
    """
    
    def __init__(self):
        self.mongodb = None
        self.redis_client = None
        self.rule_cache = {}
        self.cache_ttl = 300  # 5 minutes
    
    async def _init_clients(self):
        """Initialize database clients"""
        if not self.mongodb:
            self.mongodb = get_mongodb()
        if not self.redis_client:
            self.redis_client = get_redis()
    
    async def create_rule(self, rule: DeletionRule) -> str:
        """Create a new deletion rule"""
        await self._init_clients()
        
        # Generate ID if not provided
        if not rule.id:
            rule.id = f"rule_{int(datetime.utcnow().timestamp())}"
        
        # Store in MongoDB
        rule_dict = rule.dict(by_alias=True)
        await self.mongodb.deletion_rules.insert_one(rule_dict)
        
        # Clear cache
        await self._clear_rule_cache()
        
        logger.info("Created deletion rule", rule_id=rule.id, name=rule.name)
        return rule.id
    
    async def update_rule(self, rule_id: str, updates: Dict[str, Any]) -> bool:
        """Update an existing rule"""
        await self._init_clients()
        
        updates["updated_at"] = datetime.utcnow()
        
        result = await self.mongodb.deletion_rules.update_one(
            {"id": rule_id},
            {"$set": updates}
        )
        
        if result.modified_count > 0:
            await self._clear_rule_cache()
            logger.info("Updated deletion rule", rule_id=rule_id)
            return True
        
        return False
    
    async def delete_rule(self, rule_id: str) -> bool:
        """Delete a rule"""
        await self._init_clients()
        
        result = await self.mongodb.deletion_rules.delete_one({"id": rule_id})
        
        if result.deleted_count > 0:
            await self._clear_rule_cache()
            logger.info("Deleted deletion rule", rule_id=rule_id)
            return True
        
        return False
    
    async def get_rules(self, enabled_only: bool = True) -> List[DeletionRule]:
        """Get all rules, optionally filtered by enabled status"""
        await self._init_clients()
        
        cache_key = f"rules:enabled_{enabled_only}"
        
        # Check cache first
        if cache_key in self.rule_cache:
            cache_time, rules = self.rule_cache[cache_key]
            if (datetime.utcnow() - cache_time).seconds < self.cache_ttl:
                return rules
        
        # Query database
        query = {"enabled": True} if enabled_only else {}
        cursor = self.mongodb.deletion_rules.find(query).sort("priority", -1)
        
        rules = []
        async for rule_doc in cursor:
            try:
                rule = DeletionRule(**rule_doc)
                rules.append(rule)
            except Exception as e:
                logger.warning("Failed to parse rule", rule_id=rule_doc.get("id"), error=str(e))
        
        # Cache results
        self.rule_cache[cache_key] = (datetime.utcnow(), rules)
        
        return rules
    
    async def evaluate_file_against_rules(self, file_metadata: Dict[str, Any], 
                                        duplicate_context: Optional[Dict[str, Any]] = None) -> List[RuleExecutionResult]:
        """
        Evaluate a file against all rules
        
        Args:
            file_metadata: File metadata from MongoDB
            duplicate_context: Information about duplicate group if applicable
            
        Returns:
            List of rule execution results
        """
        await self._init_clients()
        
        rules = await self.get_rules(enabled_only=True)
        results = []
        
        # Create execution context
        context = RuleExecutionContext(
            file_metadata=file_metadata,
            duplicate_group=duplicate_context
        )
        
        for rule in rules:
            start_time = datetime.utcnow()
            
            try:
                # Check if rule applies to this file's scope
                if not self._rule_applies_to_file(rule, file_metadata):
                    continue
                
                # Evaluate rule conditions
                matched = await self._evaluate_rule_conditions(rule.condition_group, context)
                
                result = RuleExecutionResult(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    matched=matched,
                    execution_time_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
                )
                
                if matched:
                    # Execute action
                    action_result = await self._execute_rule_action(rule, context)
                    result.action_taken = action_result.get("action")
                    result.reason = action_result.get("reason", "")
                    result.confidence = action_result.get("confidence", 1.0)
                    
                    # Update rule statistics
                    await self._update_rule_stats(rule.id)
                
                results.append(result)
                
            except Exception as e:
                logger.error("Rule evaluation failed", rule_id=rule.id, error=str(e))
                results.append(RuleExecutionResult(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    matched=False,
                    reason=f"Evaluation error: {str(e)}"
                ))
        
        return results
    
    def _rule_applies_to_file(self, rule: DeletionRule, file_metadata: Dict[str, Any]) -> bool:
        """Check if rule scope applies to this file"""
        
        # Check library paths
        if rule.library_paths:
            file_path = file_metadata.get("absolute_path", "")
            if not any(file_path.startswith(lib_path) for lib_path in rule.library_paths):
                return False
        
        # Check file categories
        if rule.file_categories:
            file_category = file_metadata.get("file_category", "")
            if file_category not in rule.file_categories:
                return False
        
        return True
    
    async def _evaluate_rule_conditions(self, group: RuleGroup, context: RuleExecutionContext) -> bool:
        """Recursively evaluate rule condition groups"""
        
        # Evaluate individual conditions
        condition_results = []
        for condition in group.conditions:
            result = await self._evaluate_condition(condition, context)
            condition_results.append(result)
        
        # Evaluate nested groups
        group_results = []
        for nested_group in group.groups:
            result = await self._evaluate_rule_conditions(nested_group, context)
            group_results.append(result)
        
        # Combine all results
        all_results = condition_results + group_results
        
        if not all_results:
            return True  # Empty group is considered true
        
        # Apply logical operator
        if group.operator == LogicalOperator.AND:
            return all(all_results)
        elif group.operator == LogicalOperator.OR:
            return any(all_results)
        elif group.operator == LogicalOperator.NOT:
            return not all(all_results)
        
        return False
    
    async def _evaluate_condition(self, condition: RuleCondition, context: RuleExecutionContext) -> bool:
        """Evaluate a single condition"""
        
        # Get the actual value from context
        actual_value = self._get_condition_value(condition.target, context)
        expected_value = condition.value
        
        if actual_value is None:
            return False
        
        # Handle case sensitivity for string comparisons
        if isinstance(actual_value, str) and isinstance(expected_value, str):
            if not condition.case_sensitive:
                actual_value = actual_value.lower()
                expected_value = expected_value.lower()
        
        # Apply comparison operator
        try:
            if condition.operator == ComparisonOperator.EQUALS:
                return actual_value == expected_value
            elif condition.operator == ComparisonOperator.NOT_EQUALS:
                return actual_value != expected_value
            elif condition.operator == ComparisonOperator.GREATER_THAN:
                return actual_value > expected_value
            elif condition.operator == ComparisonOperator.LESS_THAN:
                return actual_value < expected_value
            elif condition.operator == ComparisonOperator.GREATER_EQUAL:
                return actual_value >= expected_value
            elif condition.operator == ComparisonOperator.LESS_EQUAL:
                return actual_value <= expected_value
            elif condition.operator == ComparisonOperator.CONTAINS:
                return str(expected_value) in str(actual_value)
            elif condition.operator == ComparisonOperator.NOT_CONTAINS:
                return str(expected_value) not in str(actual_value)
            elif condition.operator == ComparisonOperator.STARTS_WITH:
                return str(actual_value).startswith(str(expected_value))
            elif condition.operator == ComparisonOperator.ENDS_WITH:
                return str(actual_value).endswith(str(expected_value))
            elif condition.operator == ComparisonOperator.IN_LIST:
                return actual_value in expected_value
            elif condition.operator == ComparisonOperator.NOT_IN_LIST:
                return actual_value not in expected_value
            elif condition.operator == ComparisonOperator.REGEX_MATCH:
                return bool(re.search(str(expected_value), str(actual_value)))
            
        except Exception as e:
            logger.warning("Condition evaluation error", 
                         target=condition.target, 
                         operator=condition.operator, 
                         error=str(e))
            return False
        
        return False
    
    def _get_condition_value(self, target: ConditionTarget, context: RuleExecutionContext) -> Any:
        """Extract the target value from execution context"""
        
        file_metadata = context.file_metadata
        metadata_dict = file_metadata.get("metadata", {})
        
        # File properties
        if target == ConditionTarget.FILE_PATH:
            return file_metadata.get("absolute_path")
        elif target == ConditionTarget.FILE_NAME:
            return file_metadata.get("filename")
        elif target == ConditionTarget.FILE_SIZE:
            return file_metadata.get("file_size")
        elif target == ConditionTarget.FILE_EXTENSION:
            return file_metadata.get("file_extension")
        
        # Audio metadata
        elif target == ConditionTarget.BITRATE:
            return metadata_dict.get("bitrate")
        elif target == ConditionTarget.SAMPLE_RATE:
            return metadata_dict.get("sample_rate")
        elif target == ConditionTarget.CODEC:
            return metadata_dict.get("codec")
        elif target == ConditionTarget.DURATION:
            return metadata_dict.get("duration")
        elif target == ConditionTarget.TITLE:
            return metadata_dict.get("title")
        elif target == ConditionTarget.ARTIST:
            return metadata_dict.get("artist")
        elif target == ConditionTarget.ALBUM:
            return metadata_dict.get("album")
        elif target == ConditionTarget.GENRE:
            return metadata_dict.get("genre")
        elif target == ConditionTarget.YEAR:
            return metadata_dict.get("year")
        
        # Quality metrics
        elif target == ConditionTarget.QUALITY_SCORE:
            return file_metadata.get("quality_score")
        elif target == ConditionTarget.PATH_TYPE:
            return file_metadata.get("path_type")
        
        # Duplicate context
        elif target == ConditionTarget.DUPLICATE_COUNT:
            if context.duplicate_group:
                return context.duplicate_group.get("file_count", 1)
            return 1
        elif target == ConditionTarget.IS_BEST_QUALITY:
            return file_metadata.get("is_best_quality", False)
        elif target == ConditionTarget.QUALITY_RANK:
            if context.duplicate_group:
                # Calculate rank based on quality score
                files = context.duplicate_group.get("files", [])
                sorted_files = sorted(files, key=lambda f: f.get("quality_score", 0), reverse=True)
                for i, f in enumerate(sorted_files):
                    if f.get("file_id") == str(file_metadata.get("_id")):
                        return i + 1
            return 1
        
        return None
    
    async def _execute_rule_action(self, rule: DeletionRule, context: RuleExecutionContext) -> Dict[str, Any]:
        """Execute the action specified by a rule"""
        
        action = rule.action
        file_id = context.file_metadata.get("_id")
        
        result = {
            "action": action.action,
            "reason": action.reason_template.format(action=action.action, rule_name=rule.name),
            "confidence": 1.0
        }
        
        try:
            if action.action == ActionType.DELETE:
                # Mark file for deletion
                await self.mongodb.file_metadata.update_one(
                    {"_id": file_id},
                    {
                        "$set": {
                            "deletion_candidate": True,
                            "deletion_reason": result["reason"],
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                
            elif action.action == ActionType.MARK_FOR_REVIEW:
                # Add review tag
                await self.mongodb.file_metadata.update_one(
                    {"_id": file_id},
                    {
                        "$addToSet": {"tags": "needs_review"},
                        "$set": {"updated_at": datetime.utcnow()}
                    }
                )
                
            elif action.action == ActionType.SET_PRIORITY:
                # Set priority score
                priority = action.parameters.get("priority", 50)
                await self.mongodb.file_metadata.update_one(
                    {"_id": file_id},
                    {
                        "$set": {
                            "deletion_priority": priority,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                
            elif action.action == ActionType.ADD_TAG:
                # Add custom tag
                tag = action.parameters.get("tag", "rule_matched")
                await self.mongodb.file_metadata.update_one(
                    {"_id": file_id},
                    {
                        "$addToSet": {"tags": tag},
                        "$set": {"updated_at": datetime.utcnow()}
                    }
                )
        
        except Exception as e:
            logger.error("Rule action execution failed", 
                        rule_id=rule.id, 
                        action=action.action, 
                        error=str(e))
            result["reason"] = f"Action failed: {str(e)}"
            result["confidence"] = 0.0
        
        return result
    
    async def _update_rule_stats(self, rule_id: str):
        """Update rule execution statistics"""
        await self.mongodb.deletion_rules.update_one(
            {"id": rule_id},
            {
                "$inc": {"times_triggered": 1, "files_affected": 1},
                "$set": {"last_triggered": datetime.utcnow()}
            }
        )
    
    async def _clear_rule_cache(self):
        """Clear the rule cache"""
        self.rule_cache.clear()
    
    async def create_default_rules(self) -> List[str]:
        """Create a set of sensible default rules"""
        
        default_rules = [
            # Rule 1: Delete low quality MP3s when FLAC exists
            DeletionRule(
                id="default_flac_over_mp3",
                name="Prefer FLAC over MP3",
                description="Delete MP3 files when FLAC version exists with same fingerprint",
                priority=100,
                condition_group=RuleGroup(
                    operator=LogicalOperator.AND,
                    conditions=[
                        RuleCondition(target=ConditionTarget.CODEC, operator=ComparisonOperator.EQUALS, value="MP3"),
                        RuleCondition(target=ConditionTarget.DUPLICATE_COUNT, operator=ComparisonOperator.GREATER_THAN, value=1),
                        RuleCondition(target=ConditionTarget.QUALITY_RANK, operator=ComparisonOperator.GREATER_THAN, value=1)
                    ]
                ),
                action=RuleAction(
                    action=ActionType.DELETE,
                    reason_template="Lower quality MP3 when FLAC available"
                ),
                file_categories=["audio"]
            ),
            
            # Rule 2: Delete misc copies when album version exists
            DeletionRule(
                id="default_album_over_misc",
                name="Prefer Album over Misc",
                description="Delete files in misc directories when album version exists",
                priority=90,
                condition_group=RuleGroup(
                    operator=LogicalOperator.AND,
                    conditions=[
                        RuleCondition(target=ConditionTarget.PATH_TYPE, operator=ComparisonOperator.EQUALS, value="misc"),
                        RuleCondition(target=ConditionTarget.DUPLICATE_COUNT, operator=ComparisonOperator.GREATER_THAN, value=1),
                        RuleCondition(target=ConditionTarget.QUALITY_RANK, operator=ComparisonOperator.GREATER_THAN, value=1)
                    ]
                ),
                action=RuleAction(
                    action=ActionType.DELETE,
                    reason_template="Misc copy when organized album version exists"
                ),
                file_categories=["audio"]
            ),
            
            # Rule 3: Delete very low bitrate files
            DeletionRule(
                id="default_low_bitrate",
                name="Delete Very Low Bitrate",
                description="Delete audio files with bitrate below 96kbps unless they're the only copy",
                priority=80,
                condition_group=RuleGroup(
                    operator=LogicalOperator.AND,
                    conditions=[
                        RuleCondition(target=ConditionTarget.BITRATE, operator=ComparisonOperator.LESS_THAN, value=96),
                        RuleCondition(target=ConditionTarget.DUPLICATE_COUNT, operator=ComparisonOperator.GREATER_THAN, value=1)
                    ]
                ),
                action=RuleAction(
                    action=ActionType.DELETE,
                    reason_template="Very low bitrate ({bitrate}kbps) with better quality available"
                ),
                file_categories=["audio"]
            ),
            
            # Rule 4: Mark compilation duplicates for review
            DeletionRule(
                id="default_compilation_review",
                name="Review Compilation Duplicates",
                description="Mark compilation files for review when album version exists",
                priority=70,
                condition_group=RuleGroup(
                    operator=LogicalOperator.AND,
                    conditions=[
                        RuleCondition(target=ConditionTarget.PATH_TYPE, operator=ComparisonOperator.EQUALS, value="compilation"),
                        RuleCondition(target=ConditionTarget.DUPLICATE_COUNT, operator=ComparisonOperator.GREATER_THAN, value=1),
                        RuleCondition(target=ConditionTarget.QUALITY_RANK, operator=ComparisonOperator.GREATER_THAN, value=1)
                    ]
                ),
                action=RuleAction(
                    action=ActionType.MARK_FOR_REVIEW,
                    reason_template="Compilation duplicate - manual review recommended"
                ),
                file_categories=["audio"]
            )
        ]
        
        created_ids = []
        for rule in default_rules:
            try:
                rule_id = await self.create_rule(rule)
                created_ids.append(rule_id)
            except Exception as e:
                logger.error("Failed to create default rule", rule_name=rule.name, error=str(e))
        
        logger.info("Created default rules", count=len(created_ids))
        return created_ids