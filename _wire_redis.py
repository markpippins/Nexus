#!/usr/bin/env python3
"""
Wire Redis caching into block segmentation route handlers in routes.ts.
Edits by line numbers to avoid non-ASCII character matching issues.
"""
PATH = '/home/codex/dev/nexus/typescript/nebula-srv/src/routes.ts'

with open(PATH, 'r') as f:
    lines = f.readlines()

# The BLOCK SEGMENTATION section starts at line 2796 (1-indexed)
# Let's find the exact line by searching for the header
section_start = None
for i, line in enumerate(lines):
    if 'BLOCK SEGMENTATION' in line and 'interactive block-level' in line:
        section_start = i
        break

if section_start is None:
    print("ERROR: Block segmentation section not found")
    # Fall back to the comment marker
    for i, line in enumerate(lines):
        if 'BLOCK SEGMENTATION' in line:
            section_start = i
            break

print(f"Section starts at line {section_start + 1}")

# Find end of block segmentation section (KNOWLEDGE GRAPH or return router)
section_end = None
for i in range(section_start + 1, len(lines)):
    if 'KNOWLEDGE GRAPH' in lines[i]:
        section_end = i
        break

print(f"Section ends at line {section_end + 1 if section_end else 'EOF'}")

# Read the section to understand its structure
section = lines[section_start:section_end]

# Find each route handler and its line range
# We identify handlers by their router.get/router.post/router.patch/router.delete lines

def find_handlers(section_lines, offset):
    """Find route handler blocks by tracking braces."""
    handlers = []
    i = 0
    while i < len(section_lines):
        line = section_lines[i]
        # Match router.get/post/patch/delete
        if any(f"router.{method}('" in line for method in ['get', 'post', 'patch', 'delete']):
            start_line = offset + i
            # Find the matching closing brace
            brace_depth = 0
            j = i
            started = False
            while j < len(section_lines):
                for ch in section_lines[j]:
                    if ch == '{':
                        started = True
                        brace_depth += 1
                    elif ch == '}':
                        brace_depth -= 1
                        if started and brace_depth == 0:
                            end_line = offset + j
                            handler_text = ''.join(section_lines[i:j+1])
                            handlers.append({
                                'start': start_line,
                                'end': end_line,
                                'text': handler_text,
                                'method': line.strip().split("router.")[1].split("(")[0],
                                'path': line.split("'")[1] if "'" in line else "unknown",
                            })
                            i = j
                            break
                if brace_depth == 0 and started:
                    break
                j += 1
        i += 1
    return handlers

handlers = find_handlers(section, section_start)

print(f"Found {len(handlers)} handlers:")
for h in handlers:
    print(f"  [{h['method']}] {h['path']}  (lines {h['start']+1}-{h['end']+1})")

# ── Define Redis caching insertions ─────────────────────────────

redis_imports = [
    "import * as bsRedis from './services/block-segmentation-redis.service';\n",
]

def make_session_cache_insertion():
    """Lines to add after the listSnapshots result but before res.json."""
    return [
        "\n",
        "      // Warm session cache on read\n",
        "      try {\n",
        "        await bsRedis.cacheSession(id as string, {\n",
        "          conversationId: id as string,\n",
        "          activeSnapshotId: result.snapshots[0]?.id || null,\n",
        "          mode: 'view',\n",
        "          userId: 'unknown',\n",
        "        });\n",
        "      } catch (_) { /* Redis unavailable — non-fatal */ }\n",
    ]

def make_blocks_cache_insertion():
    """Lines to add after the listBlocks result but before res.json."""
    return [
        "\n",
        "      // Cache blocks for next read (non-diff queries only)\n",
        "      if (!diffFrom) {\n",
        "        try { await bsRedis.cacheBlocks(id as string, result.blocks); }\n",
        "        catch (_) { /* non-fatal */ }\n",
        "      }\n",
    ]

def make_snapshot_post_cache_insertion():
    """Lines to add after createSnapshot result but before res.json."""
    return [
        "\n",
        "      // Cache new blocks and invalidate stale projection\n",
        "      if (blocks) {\n",
        "        try {\n",
        "          await bsRedis.cacheBlocks(result.snapshot.id, result.blocks || []);\n",
        "          await bsRedis.invalidateProjection(result.snapshot.id);\n",
        "        } catch (_) { /* non-fatal */ }\n",
        "      }\n",
    ]

def make_segment_post_cache_insertion():
    """Lines to add after createSegment but before res.json."""
    return [
        "\n",
        "      // Invalidate caches after segment creation\n",
        "      try {\n",
        "        await bsRedis.invalidateCandidates(req.body.snapshotId);\n",
        "        await bsRedis.invalidateProjection(req.body.snapshotId);\n",
        "        await bsRedis.invalidateGraph(req.body.snapshotId);\n",
        "      } catch (_) { /* non-fatal */ }\n",
    ]

def make_segment_patch_cache_insertion():
    """Lines to add after updateSegment success check but before res.json."""
    return [
        "\n",
        "      // Invalidate projection cache since segment changed\n",
        "      try {\n",
        "        await bsRedis.invalidateProjection(segment.snapshot_id);\n",
        "      } catch (_) { /* non-fatal */ }\n",
    ]

def make_segment_delete_cache_insertion():
    """Lines to add after supersedeSegment but before res.json."""
    return [
        "\n",
        "      // Invalidate caches after segment deletion\n",
        "      try {\n",
        "        const { rows } = await pool.query(\n",
        "          'SELECT snapshot_id FROM nebula.segments_history WHERE id = $1 AND recorded_until_dt = \\'9999-12-31 23:59:59+00\\'',\n",
        "          [req.params.id]\n",
        "        );\n",
        "        if (rows.length > 0) {\n",
        "          await bsRedis.invalidateProjection(rows[0].snapshot_id);\n",
        "          await bsRedis.invalidateGraph(rows[0].snapshot_id);\n",
        "        }\n",
        "      } catch (_) { /* non-fatal */ }\n",
    ]

def make_override_post_cache_insertion():
    """Lines to add after createProjectionOverride but before res.json."""
    return [
        "\n",
        "      // Invalidate projection cache for this snapshot\n",
        "      try {\n",
        "        await bsRedis.invalidateProjection(req.body.snapshotId, req.body.projectionTarget || 'BP');\n",
        "      } catch (_) { /* non-fatal */ }\n",
    ]

def make_override_delete_cache_insertion():
    """Lines to add after removeProjectionOverride but before res.json."""
    return [
        "\n",
        "      // Invalidate projection cache\n",
        "      try {\n",
        "        const { rows } = await pool.query(\n",
        "          'SELECT snapshot_id, projection_target FROM nebula.projection_overrides_history WHERE id = $1 AND recorded_until_dt = \\'9999-12-31 23:59:59+00\\'',\n",
        "          [req.params.id]\n",
        "        );\n",
        "        if (rows.length > 0) {\n",
        "          await bsRedis.invalidateProjection(rows[0].snapshot_id, rows[0].projection_target);\n",
        "        }\n",
        "      } catch (_) { /* non-fatal */ }\n",
    ]

def make_projection_get_cache_insertion():
    """Lines to add at the start of the projection handler (cache-first read)."""
    return [
        "\n",
        "      // Try Redis cache first\n",
        "      try {\n",
        "        const cached = await bsRedis.getCachedProjection(id as string, target);\n",
        "        if (cached) {\n",
        "          res.json(cached);\n",
        "          return;\n",
        "        }\n",
        "      } catch (_) { /* cache miss — fall through to PG */ }\n",
    ]

def make_projection_get_post_insertion():
    """Lines to add after getProjection result but before res.json."""
    return [
        "\n",
        "      // Cache projection for next read\n",
        "      try { await bsRedis.cacheProjection(id as string, target, result); }\n",
        "      catch (_) { /* non-fatal */ }\n",
    ]

def make_references_get_insertion():
    """Lines to add after listReferences result but before res.json."""
    return [
        "\n",
        "      // Cache graph adjacency from references\n",
        "      try { await bsRedis.cacheGraphFromReferences(id as string, result.references); }\n",
        "      catch (_) { /* non-fatal */ }\n",
    ]

# ── Map handlers to their Redis insertions ─────────────────────

# We identify handlers by their HTTP method and path
handler_updates = {}

# Index handlers by a predictable key
for h in handlers:
    # Create a unique key
    path_short = h['path'].replace('/', '_').replace(':', '')
    key = f"{h['method']}_{path_short}"
    handler_updates[key] = h

# Print available handlers
print("\nHandler mapping:")
for key, h in sorted(handler_updates.items()):
    print(f"  {key}: lines {h['start']+1}-{h['end']+1}")

# ── Apply insertions ──────────────────────────────────────────

insertions = []

# 1. GET /conversations/:id/snapshots — session cache after listSnapshots
for key, h in handler_updates.items():
    if key.startswith('get_conversations_') and 'snapshots' in key:
        # Find the last res.json line in this handler
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.json(result)' in lines[i]:
                insertions.append((i, make_session_cache_insertion()))
                print(f"  Session cache: insert at line {i+1}")
                break
        break

# 2. GET /snapshots/:id/blocks — block cache after listBlocks
for key, h in sorted(handler_updates.items()):
    if key.startswith('get_snapshots_') and 'blocks' in key and 'projection' not in key and 'references' not in key:
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.json(result)' in lines[i]:
                insertions.append((i, make_blocks_cache_insertion()))
                print(f"  Block cache: insert at line {i+1}")
                break
        break

# 3. POST /snapshots — snapshot cache after createSnapshot
for key, h in sorted(handler_updates.items()):
    if key.startswith('post_snapshots'):
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.status(201).json(result)' in lines[i]:
                insertions.append((i, make_snapshot_post_cache_insertion()))
                print(f"  Snapshot post cache: insert at line {i+1}")
                break
        break

# 4. POST /segments — segment cache after createSegment
for key, h in sorted(handler_updates.items()):
    if key.startswith('post_segments'):
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.status(201).json(segment)' in lines[i]:
                insertions.append((i, make_segment_post_cache_insertion()))
                print(f"  Segment post cache: insert at line {i+1}")
                break
            # Also check for simple res.json
            if 'res.json(segment)' in lines[i]:
                insertions.append((i, make_segment_post_cache_insertion()))
                print(f"  Segment post cache: insert at line {i+1}")
                break
        break

# 5. PATCH /segments/:id — segment patch cache after updateSegment
for key, h in sorted(handler_updates.items()):
    if key.startswith('patch_segments_'):
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.json(segment)' in lines[i]:
                insertions.append((i, make_segment_patch_cache_insertion()))
                print(f"  Segment patch cache: insert at line {i+1}")
                break
        break

# 6. DELETE /segments/:id — segment delete cache after supersedeSegment
for key, h in sorted(handler_updates.items()):
    if key.startswith('delete_segments_'):
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.json(result)' in lines[i]:
                insertions.append((i, make_segment_delete_cache_insertion()))
                print(f"  Segment delete cache: insert at line {i+1}")
                break
        break

# 7. POST /projection-overrides — override post cache
for key, h in sorted(handler_updates.items()):
    if key.startswith('post_projection_') and 'overrides' in key:
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.status(201).json(override)' in lines[i] or 'res.json(override)' in lines[i]:
                insertions.append((i, make_override_post_cache_insertion()))
                print(f"  Override post cache: insert at line {i+1}")
                break
        break

# 8. DELETE /projection-overrides/:id — override delete cache
for key, h in sorted(handler_updates.items()):
    if key.startswith('delete_projection_') and 'overrides' in key:
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.json(result)' in lines[i]:
                insertions.append((i, make_override_delete_cache_insertion()))
                print(f"  Override delete cache: insert at line {i+1}")
                break
        break

# 9. GET /snapshots/:id/projection — projection cache before + after getProjection
for key, h in sorted(handler_updates.items()):
    if key.startswith('get_snapshots_') and 'projection' in key:
        # Insert cache-first check after try { line
        for i in range(h['start'], h['end']):
            stripped = lines[i].strip()
            if stripped == 'try {':
                # Check we're inside the handler, not the outer try
                next_line = lines[i+1].strip() if i+1 < len(lines) else ''
                if next_line.startswith('const { id }') or next_line.startswith('const target '):
                    # Insert cache check after the next few lines
                    insertions.append((i, make_projection_get_cache_insertion()))
                    print(f"  Projection cache-first: insert at line {i+1}")
                    break
        # Insert cache-write after getProjection result
        for i in range(h['end'], h['start'] - 1, -1):
            line = lines[i].strip()
            if line.startswith('const result = await bs.getProjection') or line.startswith('const result = await bs.getProjection'):
                # Find the res.json after this
                for j in range(i, h['end'] + 1):
                    if 'res.json(result)' in lines[j]:
                        insertions.append((j, make_projection_get_post_insertion()))
                        print(f"  Projection cache-write: insert at line {j+1}")
                        break
                break
        break

# 10. GET /snapshots/:id/references — references cache after listReferences
for key, h in sorted(handler_updates.items()):
    if key.startswith('get_snapshots_') and 'references' in key:
        for i in range(h['end'], h['start'] - 1, -1):
            if 'res.json(result)' in lines[i]:
                insertions.append((i, make_references_get_insertion()))
                print(f"  References cache: insert at line {i+1}")
                break
        break

# Sort insertions in reverse order (so line numbers don't shift)
insertions.sort(key=lambda x: x[0], reverse=True)

# Apply all insertions
for line_idx, new_lines in insertions:
    # Insert after the target line (before its newline)
    lines[line_idx] = lines[line_idx].rstrip('\n') + ''.join(new_lines)

# Write back
with open(PATH, 'w') as f:
    f.writelines(lines)

print(f"\nApplied {len(insertions)} Redis cache insertions")
print("Done")
