"""
Rule Builder Utility
Provides a fluent interface for building complex deletion rules
"""

from typing import List, Union, Any
from models.rules_models import (
    DeletionRule, RuleGroup, RuleCondition, RuleAction,
    ComparisonOperator, LogicalOperator, ActionType, ConditionTarget
)


class RuleBuilder:
    """
    Fluent interface for building deletion rules
    
    Example usage:
    rule = (RuleBuilder("Delete low quality MP3s")
            .when_codec_equals("MP3")
            .and_bitrate_less_than(128)
            .and_has_duplicates()
            .then_delete("Low quality MP3 with better version available")
            .build())
    """
    
    def __init__(self, name: str, description: str = ""):
        self.rule_data = {
            "name": name,
            "description": description,
            "enabled": True,
            "priority": 100,
            "condition_group": RuleGroup(),
            "action": None,
            "library_paths": [],
            "file_categories": []
        }
        self._current_group = self.rule_data["condition_group"]
    
    # Condition builders
    def when_codec_equals(self, codec: str) -> 'RuleBuilder':
        """Add condition: codec equals value"""
        return self._add_condition(ConditionTarget.CODEC, ComparisonOperator.EQUALS, codec)
    
    def when_bitrate_less_than(self, bitrate: int) -> 'RuleBuilder':
        """Add condition: bitrate less than value"""
        return self._add_condition(ConditionTarget.BITRATE, ComparisonOperator.LESS_THAN, bitrate)
    
    def when_bitrate_greater_than(self, bitrate: int) -> 'RuleBuilder':
        """Add condition: bitrate greater than value"""
        return self._add_condition(ConditionTarget.BITRATE, ComparisonOperator.GREATER_THAN, bitrate)
    
    def when_quality_score_less_than(self, score: int) -> 'RuleBuilder':
        """Add condition: quality score less than value"""
        return self._add_condition(ConditionTarget.QUALITY_SCORE, ComparisonOperator.LESS_THAN, score)
    
    def when_path_type_equals(self, path_type: str) -> 'RuleBuilder':
        """Add condition: path type equals value"""
        return self._add_condition(ConditionTarget.PATH_TYPE, ComparisonOperator.EQUALS, path_type)
    
    def when_path_contains(self, text: str) -> 'RuleBuilder':
        """Add condition: file path contains text"""
        return self._add_condition(ConditionTarget.FILE_PATH, ComparisonOperator.CONTAINS, text)
    
    def when_file_size_less_than(self, size_bytes: int) -> 'RuleBuilder':
        """Add condition: file size less than value"""
        return self._add_condition(ConditionTarget.FILE_SIZE, ComparisonOperator.LESS_THAN, size_bytes)
    
    def when_has_duplicates(self) -> 'RuleBuilder':
        """Add condition: file has duplicates (count > 1)"""
        return self._add_condition(ConditionTarget.DUPLICATE_COUNT, ComparisonOperator.GREATER_THAN, 1)
    
    def when_not_best_quality(self) -> 'RuleBuilder':
        """Add condition: file is not the best quality in its group"""
        return self._add_condition(ConditionTarget.IS_BEST_QUALITY, ComparisonOperator.EQUALS, False)
    
    def when_quality_rank_greater_than(self, rank: int) -> 'RuleBuilder':
        """Add condition: quality rank greater than value (1 = best)"""
        return self._add_condition(ConditionTarget.QUALITY_RANK, ComparisonOperator.GREATER_THAN, rank)
    
    def when_artist_equals(self, artist: str) -> 'RuleBuilder':
        """Add condition: artist equals value"""
        return self._add_condition(ConditionTarget.ARTIST, ComparisonOperator.EQUALS, artist)
    
    def when_genre_in(self, genres: List[str]) -> 'RuleBuilder':
        """Add condition: genre is in list"""
        return self._add_condition(ConditionTarget.GENRE, ComparisonOperator.IN_LIST, genres)
    
    def when_year_less_than(self, year: int) -> 'RuleBuilder':
        """Add condition: year less than value"""
        return self._add_condition(ConditionTarget.YEAR, ComparisonOperator.LESS_THAN, year)
    
    def when_duration_less_than(self, seconds: float) -> 'RuleBuilder':
        """Add condition: duration less than value in seconds"""
        return self._add_condition(ConditionTarget.DURATION, ComparisonOperator.LESS_THAN, seconds)
    
    def when_extension_in(self, extensions: List[str]) -> 'RuleBuilder':
        """Add condition: file extension is in list"""
        return self._add_condition(ConditionTarget.FILE_EXTENSION, ComparisonOperator.IN_LIST, extensions)
    
    # Logical operators
    def and_codec_equals(self, codec: str) -> 'RuleBuilder':
        """Add AND condition: codec equals value"""
        return self.when_codec_equals(codec)
    
    def and_bitrate_less_than(self, bitrate: int) -> 'RuleBuilder':
        """Add AND condition: bitrate less than value"""
        return self.when_bitrate_less_than(bitrate)
    
    def and_path_type_equals(self, path_type: str) -> 'RuleBuilder':
        """Add AND condition: path type equals value"""
        return self.when_path_type_equals(path_type)
    
    def and_has_duplicates(self) -> 'RuleBuilder':
        """Add AND condition: has duplicates"""
        return self.when_has_duplicates()
    
    def and_not_best_quality(self) -> 'RuleBuilder':
        """Add AND condition: not best quality"""
        return self.when_not_best_quality()
    
    def or_group(self) -> 'RuleBuilder':
        """Start an OR group of conditions"""
        new_group = RuleGroup(operator=LogicalOperator.OR)
        self._current_group.groups.append(new_group)
        self._current_group = new_group
        return self
    
    def and_group(self) -> 'RuleBuilder':
        """Start an AND group of conditions"""
        new_group = RuleGroup(operator=LogicalOperator.AND)
        self._current_group.groups.append(new_group)
        self._current_group = new_group
        return self
    
    def end_group(self) -> 'RuleBuilder':
        """End current group and return to parent"""
        # For simplicity, just return to root group
        self._current_group = self.rule_data["condition_group"]
        return self
    
    # Actions
    def then_delete(self, reason: str = "Rule matched") -> 'RuleBuilder':
        """Set action to delete with reason"""
        self.rule_data["action"] = RuleAction(
            action=ActionType.DELETE,
            reason_template=reason
        )
        return self
    
    def then_keep(self, reason: str = "Rule matched - keep file") -> 'RuleBuilder':
        """Set action to keep with reason"""
        self.rule_data["action"] = RuleAction(
            action=ActionType.KEEP,
            reason_template=reason
        )
        return self
    
    def then_mark_for_review(self, reason: str = "Rule matched - needs review") -> 'RuleBuilder':
        """Set action to mark for review"""
        self.rule_data["action"] = RuleAction(
            action=ActionType.MARK_FOR_REVIEW,
            reason_template=reason
        )
        return self
    
    def then_add_tag(self, tag: str, reason: str = "Rule matched") -> 'RuleBuilder':
        """Set action to add tag"""
        self.rule_data["action"] = RuleAction(
            action=ActionType.ADD_TAG,
            parameters={"tag": tag},
            reason_template=reason
        )
        return self
    
    # Scope and configuration
    def for_audio_files(self) -> 'RuleBuilder':
        """Limit rule to audio files"""
        if "audio" not in self.rule_data["file_categories"]:
            self.rule_data["file_categories"].append("audio")
        return self
    
    def for_video_files(self) -> 'RuleBuilder':
        """Limit rule to video files"""
        if "video" not in self.rule_data["file_categories"]:
            self.rule_data["file_categories"].append("video")
        return self
    
    def for_library_path(self, path: str) -> 'RuleBuilder':
        """Limit rule to specific library path"""
        if path not in self.rule_data["library_paths"]:
            self.rule_data["library_paths"].append(path)
        return self
    
    def with_priority(self, priority: int) -> 'RuleBuilder':
        """Set rule priority (higher = runs first)"""
        self.rule_data["priority"] = priority
        return self
    
    def disabled(self) -> 'RuleBuilder':
        """Mark rule as disabled"""
        self.rule_data["enabled"] = False
        return self
    
    # Build final rule
    def build(self) -> DeletionRule:
        """Build the final DeletionRule object"""
        if not self.rule_data["action"]:
            raise ValueError("Rule must have an action (then_delete, then_keep, etc.)")
        
        return DeletionRule(**self.rule_data)
    
    # Helper methods
    def _add_condition(self, target: ConditionTarget, operator: ComparisonOperator, value: Any) -> 'RuleBuilder':
        """Add a condition to the current group"""
        condition = RuleCondition(target=target, operator=operator, value=value)
        self._current_group.conditions.append(condition)
        return self


# Convenience functions for common rule patterns
def delete_low_quality_mp3s(bitrate_threshold: int = 128) -> DeletionRule:
    """Create rule to delete low quality MP3s when better versions exist"""
    return (RuleBuilder("Delete Low Quality MP3s", 
                       f"Delete MP3 files with bitrate below {bitrate_threshold}kbps when duplicates exist")
            .when_codec_equals("MP3")
            .and_bitrate_less_than(bitrate_threshold)
            .and_has_duplicates()
            .and_not_best_quality()
            .then_delete(f"Low quality MP3 ({bitrate_threshold}kbps threshold) with better version available")
            .for_audio_files()
            .with_priority(90)
            .build())


def prefer_albums_over_misc() -> DeletionRule:
    """Create rule to prefer album versions over misc directory versions"""
    return (RuleBuilder("Prefer Albums Over Misc",
                       "Delete files in misc directories when album versions exist")
            .when_path_type_equals("misc")
            .and_has_duplicates()
            .and_not_best_quality()
            .then_delete("Misc directory copy when organized album version exists")
            .for_audio_files()
            .with_priority(80)
            .build())


def delete_very_small_files(size_threshold: int = 1024 * 1024) -> DeletionRule:
    """Create rule to delete very small files (likely incomplete/corrupt)"""
    return (RuleBuilder("Delete Very Small Files",
                       f"Delete files smaller than {size_threshold} bytes when duplicates exist")
            .when_file_size_less_than(size_threshold)
            .and_has_duplicates()
            .then_delete(f"Very small file ({size_threshold} bytes) with larger version available")
            .with_priority(95)
            .build())


def prefer_lossless_over_lossy() -> DeletionRule:
    """Create rule to prefer lossless formats over lossy"""
    return (RuleBuilder("Prefer Lossless Over Lossy",
                       "Delete lossy audio files when lossless versions exist")
            .when_codec_equals("MP3")
            .and_has_duplicates()
            .and_quality_rank_greater_than(1)
            .then_delete("Lossy format when lossless version available")
            .for_audio_files()
            .with_priority(100)
            .build())


def review_compilation_duplicates() -> DeletionRule:
    """Create rule to mark compilation duplicates for manual review"""
    return (RuleBuilder("Review Compilation Duplicates",
                       "Mark compilation files for review when album versions exist")
            .when_path_type_equals("compilation")
            .and_has_duplicates()
            .and_not_best_quality()
            .then_mark_for_review("Compilation duplicate - manual review recommended")
            .for_audio_files()
            .with_priority(70)
            .build())