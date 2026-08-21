#!/usr/bin/env python3
"""
MongoDB docklang store — normalized transcript storage.

Stores parsed transcript documents in the nexus.docklang collection.
Each document is a self-contained conversation with turns, metadata,
and provenance.

Usage:
  # Store a single normalized transcript (JSON from stdin):
  echo '<json>' | python3 docklang_store.py --store

  # Store all transcripts from a parser output (JSON array):
  python3 deepseek_parser.py /path/to/export | python3 docklang_store.py --store

  # Query recent docklang documents:
  python3 docklang_store.py --query --limit 5

  # Search by title:
  python3 docklang_store.py --search "resolution schema"

  # Get stats:
  python3 docklang_store.py --stats
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

try:
    from pymongo import MongoClient
    from pymongo.errors import DuplicateKeyError
except ImportError:
    print("ERROR: pymongo not installed. Run: pip install --break-system-packages pymongo", file=sys.stderr)
    sys.exit(1)


def get_client():
    """Connect to MongoDB with nexus credentials."""
    user = os.environ.get("mongoUser", "mongoUser")
    password = os.environ.get("mongoUser", "somePassword")  # placeholder — override via env
    # Use actual credentials from env or fallback
    mongo_uri = os.environ.get("MONGO_URI", f"mongodb://{user}:{os.environ.get('mongoPass', 'somePassword')}@localhost:27017")
    return MongoClient(mongo_uri)


def get_collection(client):
    """Get the docklang collection."""
    return client.nexus.docklang


def ensure_indexes(collection):
    """Create indexes for efficient querying."""
    collection.create_index("conversation_id", unique=True, background=True)
    collection.create_index("source_format", background=True)
    collection.create_index("created_at", background=True)
    collection.create_index("as_of_dt", background=True)
    collection.create_index("title", background=True)
    # Text search on title and turns content
    collection.create_index([("title", "text")], background=True)


def store_transcript(collection, transcript):
    """
    Store a single normalized transcript in docklang.

    The transcript dict must have:
      - conversation_id (str, UUID)
      - title (str)
      - source_format (str, e.g. 'deepseek', 'chatgpt', 'gemini')
      - turns (list of {role, content, timestamp, ...})
      - branches (list of branch dicts, optional)
      - created_at, updated_at, as_of_dt, valid_from (ISO strings)

    Returns: (inserted | updated | unchanged | skipped, conversation_id)
    """
    conv_id = transcript.get("conversation_id")
    if not conv_id:
        return "skipped", None

    turns = transcript.get("turns", [])
    branches = transcript.get("branches", [])

    # Compute content hash for change detection
    content_str = json.dumps({"turns": turns, "branches": branches}, sort_keys=True)
    content_hash = hashlib.md5(content_str.encode()).hexdigest()

    # Check if document exists and is unchanged
    existing = collection.find_one(
        {"conversation_id": conv_id},
        {"content_hash": 1}
    )
    if existing and existing.get("content_hash") == content_hash:
        return "unchanged", conv_id

    # Build the docklang document
    doc = {
        "conversation_id": conv_id,
        "title": transcript.get("title", ""),
        "source_format": transcript.get("source_format", "unknown"),
        "model": transcript.get("model"),
        "created_at": transcript.get("created_at"),
        "updated_at": transcript.get("updated_at"),
        "as_of_dt": transcript.get("as_of_dt"),
        "valid_from": transcript.get("valid_from"),
        "turn_count": len(turns),
        "turns": turns,
        "branches": branches,
        "branch_count": len(branches),
        "file_metadata": transcript.get("file_metadata", {}),
        "content_hash": content_hash,
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }

    # Upsert — if conversation_id exists, update it
    result = collection.update_one(
        {"conversation_id": conv_id},
        {"$set": doc},
        upsert=True,
    )

    if result.upserted_id:
        return "inserted", conv_id
    elif result.modified_count > 0:
        return "updated", conv_id
    else:
        return "unchanged", conv_id


def store_many(collection, transcripts):
    """
    Store multiple normalized transcripts. Returns summary.
    """
    inserted = 0
    updated = 0
    skipped = 0
    unchanged = 0

    for t in transcripts:
        action, conv_id = store_transcript(collection, t)
        if action == "inserted":
            inserted += 1
        elif action == "updated":
            updated += 1
        elif action == "unchanged":
            unchanged += 1
        else:
            skipped += 1

    return {
        "inserted": inserted,
        "updated": updated,
        "unchanged": unchanged,
        "skipped": skipped,
        "total": len(transcripts),
    }


def query_recent(collection, limit=5):
    """Query most recent docklang documents."""
    cursor = collection.find(
        {},
        {"conversation_id": 1, "title": 1, "source_format": 1, "turn_count": 1, "created_at": 1, "ingested_at": 1}
    ).sort("created_at", -1).limit(limit)

    results = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    return results


def search(collection, query, limit=10):
    """Search docklang documents by title."""
    cursor = collection.find(
        {"title": {"$regex": query, "$options": "i"}},
        {"conversation_id": 1, "title": 1, "source_format": 1, "turn_count": 1, "created_at": 1}
    ).sort("created_at", -1).limit(limit)

    return [doc for doc in cursor]


def get_stats(collection):
    """Get collection statistics."""
    total = collection.count_documents({})
    by_format = {}
    for doc in collection.aggregate([
        {"$group": {"_id": "$source_format", "count": {"$sum": 1}, "total_turns": {"$sum": "$turn_count"}}}
    ]):
        by_format[doc["_id"] or "unknown"] = {
            "conversations": doc["count"],
            "total_turns": doc["total_turns"],
        }

    return {
        "total_conversations": total,
        "by_format": by_format,
        "collection": "nexus.docklang",
    }


def main():
    parser = argparse.ArgumentParser(description="MongoDB docklang store")
    parser.add_argument("--store", action="store_true", help="Store transcript(s) from stdin (JSON)")
    parser.add_argument("--query", action="store_true", help="Query recent documents")
    parser.add_argument("--search", type=str, help="Search by title")
    parser.add_argument("--stats", action="store_true", help="Show collection stats")
    parser.add_argument("--limit", type=int, default=5, help="Limit results")
    parser.add_argument("--ensure-indexes", action="store_true", help="Create indexes")
    parser.add_argument("--mongo-uri", help="MongoDB URI (overrides MONGO_URI env)")
    args = parser.parse_args()

    if args.mongo_uri:
        os.environ["MONGO_URI"] = args.mongo_uri

    client = get_client()
    collection = get_collection(client)

    if args.ensure_indexes:
        ensure_indexes(collection)
        print("Indexes created on nexus.docklang")
        return

    if args.store:
        ensure_indexes(collection)
        data = json.load(sys.stdin)
        if isinstance(data, list):
            result = store_many(collection, data)
        elif isinstance(data, dict):
            action, conv_id = store_transcript(collection, data)
            result = {"inserted": 1 if action == "inserted" else 0, "updated": 1 if action == "updated" else 0, "unchanged": 1 if action == "unchanged" else 0, "skipped": 1 if action == "skipped" else 0, "total": 1}
        else:
            print("ERROR: Expected JSON object or array", file=sys.stderr)
            sys.exit(1)
        print(json.dumps(result, indent=2))
        return

    if args.stats:
        stats = get_stats(collection)
        print(json.dumps(stats, indent=2))
        return

    if args.search:
        results = search(collection, args.search, args.limit)
        for r in results:
            r["_id"] = str(r["_id"])
        print(json.dumps(results, indent=2))
        return

    if args.query:
        results = query_recent(collection, args.limit)
        for r in results:
            r["_id"] = str(r["_id"])
        print(json.dumps(results, indent=2))
        return

    parser.print_help()


if __name__ == "__main__":
    main()
