"""
Pydantic models for the rules engine
Defines the structure for deletion rules and conditions
"""

from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field


class ComparisonOperator(str, Enum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    GREATER_EQUAL = "greater_equal"
    LESS_EQUAL = "less_equal"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    IN_LIST = "in_list"
    NOT_IN_LIST = "not_in_list"
    REGEX_MATCH = "regex_match"


class LogicalOperator(str, Enum):
    AND = "and"
    OR = "or"
    NOT = "not"


class ActionType(str, Enum):
    DELETE = "delete"
    KEEP = "keep"
    MARK_FOR_REVIEW = "mark_for_review"
    SET_PRIORITY = "set_priority"
    ADD_TAG = "add_tag"


class ConditionTarget(str, Enum):
    # File properties
    FILE_PATH = "file_path"
    FILE_NAME = "file_name"
    FILE_SIZE = "file_size"
    FILE_EXTENSION = "file_extension"
    
    # Audio metadata
    BITRATE = "bitrate"
    SAMPLE_RATE = "sample_rate"
    CODEC = "codec"
    DURATION = "duration"
    TITLE = "title"
    ARTIST = "artist"
    ALBUM = "album"
    GENRE = "genre"
    YEAR = "year"
    
    # Quality metrics
    QUALITY_SCORE = "quality_score"
    PATH_TYPE = "path_type"
    
    # Library context
    LIBRARY_PATH = "library_path"
    LIBRARY_NAME = "library_name"
    
    # Duplicate context
    DUPLICATE_COUNT = "duplicate_count"
    IS_BEST_QUALITY = "is_best_quality"
    QUALITY_RANK = "quality_rank"  # 1 = best, 2 = second best, etc.


class RuleCondition(BaseModel):
    """Individual condition within a rule"""
    target: ConditionTarget
    operator: ComparisonOperator
    value: Union[str, int, float, List[str]]
    case_sensitive: bool = False


class RuleGroup(BaseModel):
    """Group of conditions with logical operator"""
    operator: LogicalOperator = LogicalOperator.AND
    conditions: List[RuleCondition] = Field(default_factory=list)
    groups: List['RuleGroup'] = Field(default_factory=list)  # Nested groups


class RuleAction(BaseModel):
    """Action to take when rule matches"""
    action: ActionType
    parameters: Dict[str, Any] = Field(default_factory=dict)
    reason_template: str = "Rule action: {action}"


class DeletionRule(BaseModel):
    """Complete deletion rule definition"""
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    enabled: bool = True
    priority: int = 100  # Higher priority rules run first
    
    # Rule logic
    condition_group: RuleGroup
    action: RuleAction
    
    # Scope and limits
    library_paths: List[str] = Field(default_factory=list)  # Empty = all paths
    file_categories: List[str] = Field(default_factory=list)  # Empty = all categories
    max_deletions_per_run: Optional[int] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = "system"
    
    # Statistics
    times_triggered: int = 0
    files_affected: int = 0
    last_triggered: Optional[datetime] = None


class RuleExecutionContext(BaseModel):
    """Context information for rule execution"""
    file_metadata: Dict[str, Any]
    duplicate_group: Optional[Dict[str, Any]] = None
    library_config: Optional[Dict[str, Any]] = None
    execution_stats: Dict[str, int] = Field(default_factory=dict)


class RuleExecutionResult(BaseModel):
    """Result of executing a rule against a file"""
    rule_id: str
    rule_name: str
    matched: bool
    action_taken: Optional[ActionType] = None
    reason: str = ""
    confidence: float = 1.0  # 0.0 to 1.0
    execution_time_ms: float = 0.0


class RuleSet(BaseModel):
    """Collection of rules with execution order"""
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    rules: List[DeletionRule] = Field(default_factory=list)
    enabled: bool = True
    
    # Execution settings
    stop_on_first_match: bool = False  # Stop after first matching rule
    max_execution_time_seconds: int = 300  # 5 minutes default
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# Update forward references
RuleGroup.model_rebuild()