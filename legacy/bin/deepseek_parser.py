#!/usr/bin/env python3
"""
DeepSeek Conversation Parser

Parses DeepSeek JSON exports (conversations.json) into NormalizedTranscript
objects suitable for the harvest pipeline.

Usage:
    python3 deepseek_parser.py <export_dir> [--output json|markdown] [--verbose]

The export_dir should contain:
    - conversations.json (list of conversation objects with mapping trees)
    - user.json (optional, user metadata)

Output is JSON (default) or markdown to stdout.
"""

import json
import sys
import os
import argparse
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple


def traverse_all_paths(mapping: Dict[str, Any]) -> List[List[Dict[str, Any]]]:
    """
    Traverse the mapping tree following ALL paths from root.
    Returns list of paths, each path being a list of message nodes.
    The first path is the longest (main conversation), subsequent paths are branches.
    """
    root = mapping.get("root", {})
    if not root:
        return []

    def get_path_length(node_id: str) -> int:
        node = mapping.get(node_id, {})
        children = node.get("children", [])
        if not children:
            return 1
        return 1 + max(get_path_length(child) for child in children)

    def find_all_paths(node_id: str) -> List[List[Dict[str, Any]]]:
        node = mapping.get(node_id, {})
        children = node.get("children", [])
        
        if not children:
            return [[node]]
        
        # Sort children by path length (longest first)
        sorted_children = sorted(children, key=get_path_length, reverse=True)
        
        all_paths = []
        for child in sorted_children:
            child_paths = find_all_paths(child)
            for path in child_paths:
                all_paths.append([node] + path)
        
        return all_paths

    all_paths = find_all_paths("root")
    
    # Sort by length (longest first) — main path is first
    all_paths.sort(key=len, reverse=True)
    
    return all_paths


def traverse_longest_path(mapping: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Traverse the mapping tree following the longest path from root.
    Returns list of message nodes in order.
    """
    all_paths = traverse_all_paths(mapping)
    return all_paths[0] if all_paths else []


def extract_fragments(nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extract REQUEST and RESPONSE fragments from nodes.
    Returns list of turn dicts with role, content, timestamp.
    """
    turns = []
    for node in nodes:
        msg = node.get("message")
        if not msg:
            continue
        fragments = msg.get("fragments", [])
        timestamp = msg.get("inserted_at")
        model = msg.get("model", "deepseek-chat")
        
        for frag in fragments:
            frag_type = frag.get("type", "")
            content = frag.get("content", "")
            
            if frag_type == "REQUEST" and isinstance(content, str) and content.strip():
                turns.append({
                    "role": "user",
                    "content": content.strip(),
                    "timestamp": timestamp,
                    "model": model,
                })
            elif frag_type == "RESPONSE" and isinstance(content, str) and content.strip():
                turns.append({
                    "role": "assistant",
                    "content": content.strip(),
                    "timestamp": timestamp,
                    "model": model,
                })
            # SEARCH and FILE fragments are skipped for now
    
    return turns


def parse_conversation(conv: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse a single DeepSeek conversation into a normalized transcript.
    Captures all branches (user edits create branches in the tree).
    """
    conv_id = conv.get("id", "")
    title = conv.get("title", "Untitled")
    inserted_at = conv.get("inserted_at")
    updated_at = conv.get("updated_at")
    mapping = conv.get("mapping", {})
    
    # Traverse ALL paths (main + branches)
    all_paths = traverse_all_paths(mapping)
    
    if not all_paths:
        return None
    
    # First path is the main conversation (longest)
    main_nodes = all_paths[0]
    turns = extract_fragments(main_nodes)
    
    # Remaining paths are branches (user edits)
    branches = []
    for i, branch_nodes in enumerate(all_paths[1:], 1):
        branch_turns = extract_fragments(branch_nodes)
        if branch_turns:
            # Find the branch point — where this path diverges from main
            branch_ids = [n.get("id") for n in branch_nodes]
            main_ids = [n.get("id") for n in main_nodes]
            divergence_point = None
            for j, (bid, mid) in enumerate(zip(branch_ids, main_ids)):
                if bid != mid:
                    divergence_point = j
                    break
            
            branches.append({
                "branch_id": i,
                "turns": branch_turns,
                "divergence_at_index": divergence_point,
                "turn_count": len(branch_turns),
            })
    
    # Parse dates
    created_at = None
    valid_from = None
    if inserted_at:
        try:
            created_at = datetime.fromisoformat(inserted_at).isoformat()
        except (ValueError, TypeError):
            created_at = inserted_at
    if updated_at:
        try:
            valid_from = datetime.fromisoformat(updated_at).isoformat()
        except (ValueError, TypeError):
            valid_from = updated_at
    
    # Get model from first turn
    model = turns[0].get("model", "deepseek-chat") if turns else "deepseek-chat"
    
    return {
        "source_format": "deepseek",
        "conversation_id": conv_id,
        "title": title,
        "created_at": created_at,
        "updated_at": valid_from,
        "as_of_dt": created_at,
        "valid_from": valid_from,
        "model": model,
        "turns": turns,
        "branches": branches,
        "file_metadata": {},
    }


def to_markdown(transcript: Dict[str, Any]) -> str:
    """
    Render a normalized transcript as markdown.
    """
    lines = []
    lines.append("---")
    lines.append("title: \"%s\"" % transcript["title"])
    lines.append("id: %s" % transcript["conversation_id"])
    lines.append("source: deepseek")
    lines.append("created_at: %s" % (transcript["created_at"] or ""))
    lines.append("updated_at: %s" % (transcript["updated_at"] or ""))
    lines.append("model: %s" % transcript["model"])
    lines.append("---")
    lines.append("")
    lines.append("# %s" % transcript["title"])
    lines.append("")
    
    for turn in transcript["turns"]:
        role = turn["role"].capitalize()
        lines.append("## %s" % role)
        lines.append("")
        lines.append(turn["content"])
        lines.append("")
    
    return "\n".join(lines)


def parse_export(export_dir: str) -> List[Dict[str, Any]]:
    """
    Parse all conversations from an export directory.
    """
    conversations_file = os.path.join(export_dir, "conversations.json")
    if not os.path.exists(conversations_file):
        print("Error: conversations.json not found in %s" % export_dir, file=sys.stderr)
        return []
    
    with open(conversations_file, "r") as f:
        conversations = json.load(f)
    
    if not isinstance(conversations, list):
        print("Error: conversations.json is not a list", file=sys.stderr)
        return []
    
    results = []
    for conv in conversations:
        try:
            transcript = parse_conversation(conv)
            results.append(transcript)
        except Exception as e:
            print("Warning: failed to parse conversation '%s': %s" % (
                conv.get("title", "?"), e
            ), file=sys.stderr)
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Parse DeepSeek JSON exports")
    parser.add_argument("export_dir", help="Path to DeepSeek export directory")
    parser.add_argument("--output", choices=["json", "markdown"], default="json",
                       help="Output format (default: json)")
    parser.add_argument("--verbose", action="store_true",
                       help="Print progress to stderr")
    args = parser.parse_args()
    
    if not os.path.isdir(args.export_dir):
        print("Error: %s is not a directory" % args.export_dir, file=sys.stderr)
        sys.exit(1)
    
    transcripts = parse_export(args.export_dir)
    
    if args.verbose:
        print("Parsed %d conversations from %s" % (len(transcripts), args.export_dir),
              file=sys.stderr)
        for t in transcripts:
            print("  - %s (%d turns)" % (t["title"], len(t["turns"])), file=sys.stderr)
    
    if args.output == "json":
        print(json.dumps(transcripts, indent=2))
    else:
        for t in transcripts:
            print(to_markdown(t))


if __name__ == "__main__":
    main()
