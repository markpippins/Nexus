"""
PostgreSQL persistence layer for Voyager.

Writes observations, metadata spans, edge hints, and scan epoch records
to the nexus.voyager schema using asyncpg connection pooling.

All writes are idempotent via ON CONFLICT on natural keys (observation_id,
span_id, hint_id, epoch_id).
"""
import logging
import hashlib
from typing import Optional, List
from datetime import datetime, timezone
import json

logger = logging.getLogger(__name__)

DEFAULT_DSN = "postgresql://pguser:pgpass@localhost:5432/nexus"

# File extensions worth content-hashing (text-based, small headers)
HASHABLE_EXTENSIONS = {'.md', '.py', '.ts', '.tsx', '.js', '.jsx',
                        '.go', '.rs', '.java', '.json', '.yaml', '.toml',
                        '.html', '.css', '.sql', '.sh', '.txt', '.cfg'}


def hash_file(path: str, max_bytes: int = 65536) -> Optional[str]:
    """SHA-256 hex digest of the first max_bytes of a file."""
    try:
        sha = hashlib.sha256()
        with open(path, 'rb') as f:
            sha.update(f.read(max_bytes))
        return sha.hexdigest()
    except Exception as e:
        logging.getLogger(__name__).warning("hash_file(%s): %s", path, e)
        return None


class PersistenceLayer:
    """Async PostgreSQL connection pool targeting the voyager schema."""

    def __init__(self, dsn: str = None):
        self.dsn = dsn or DEFAULT_DSN
        self.pool = None
        self._asyncpg_module = None

    @property
    def asyncpg(self):
        """Lazy import — avoid ImportError when persistence is not configured."""
        if self._asyncpg_module is None:
            import asyncpg
            self._asyncpg_module = asyncpg
        return self._asyncpg_module

    async def connect(self):
        """Create and test the connection pool."""
        try:
            self.pool = await self.asyncpg.create_pool(
                self.dsn,
                min_size=2,
                max_size=10,
                server_settings={'search_path': 'voyager, public'},
            )
            async with self.pool.acquire() as conn:
                await conn.execute("SELECT 1")
            logger.info("Connected to PostgreSQL (voyager schema on nexus)")
        except Exception as e:
            logger.error("Failed to connect to PostgreSQL: %s", e)
            self.pool = None

    async def close(self):
        if self.pool:
            await self.pool.close()
            self.pool = None

    # ═══════════════════════════════════════════════════════════════════
    # SCAN EPOCH
    # ═══════════════════════════════════════════════════════════════════

    async def create_epoch(self, epoch_id: str, root_path: str) -> None:
        if not self.pool:
            return
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO scan_epoch (epoch_id, root_path, started_at, status)
                       VALUES ($1, $2, now(), 'running')
                       ON CONFLICT (epoch_id) DO UPDATE SET
                         started_at = now(), status = 'running', files_scanned = 0,
                         new_files = 0, cached_files = 0, errors_count = 0""",
                    epoch_id, root_path,
                )
        except Exception as e:
            logger.error("create_epoch(%s): %s", epoch_id, e)

    async def complete_epoch(self, epoch_id: str, files_scanned: int,
                             new_files: int, cached_files: int,
                             errors_count: int = 0) -> None:
        if not self.pool:
            return
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """UPDATE scan_epoch
                       SET completed_at = now(), status = 'completed',
                           files_scanned = $2, new_files = $3,
                           cached_files = $4, errors_count = $5
                       WHERE epoch_id = $1""",
                    epoch_id, files_scanned, new_files,
                    cached_files, errors_count,
                )
        except Exception as e:
            logger.error("complete_epoch(%s): %s", epoch_id, e)

    async def fail_epoch(self, epoch_id: str, error: str = "") -> None:
        if not self.pool:
            return
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """UPDATE scan_epoch
                       SET completed_at = now(), status = 'failed'
                       WHERE epoch_id = $1""",
                    epoch_id,
                )
        except Exception as e:
            logger.error("fail_epoch(%s): %s", epoch_id, e)

    # ═══════════════════════════════════════════════════════════════════
    # FILE OBSERVATION
    # ═══════════════════════════════════════════════════════════════════

    async def insert_file_observation(
        self, observation_id: str, epoch_id: str, path: str,
        size: int, mtime, inode: int, device_id: int,
        content_hash: str = None,
    ) -> None:
        if not self.pool:
            return
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO file_observation
                         (observation_id, epoch_id, path, size, mtime,
                          inode, device_id, content_hash)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                       ON CONFLICT (observation_id) DO UPDATE SET
                         size = EXCLUDED.size, mtime = EXCLUDED.mtime,
                         epoch_id = EXCLUDED.epoch_id""",
                    observation_id, epoch_id, path, size, mtime,
                    inode, device_id, content_hash,
                )
        except Exception as e:
            logger.error("insert_file_observation(%s): %s", observation_id, e)

    # ═══════════════════════════════════════════════════════════════════
    # DIRECTORY OBSERVATION
    # ═══════════════════════════════════════════════════════════════════

    async def insert_directory_observation(
        self, observation_id: str, epoch_id: str,
        path: str, inode: int, device_id: int,
    ) -> None:
        if not self.pool:
            return
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO directory_observation
                         (observation_id, epoch_id, path, inode, device_id)
                       VALUES ($1, $2, $3, $4, $5)
                       ON CONFLICT (observation_id) DO UPDATE SET
                         path = EXCLUDED.path, epoch_id = EXCLUDED.epoch_id""",
                    observation_id, epoch_id, path, inode, device_id,
                )
        except Exception as e:
            logger.error("insert_directory_observation(%s): %s", observation_id, e)

    # ═══════════════════════════════════════════════════════════════════
    # METADATA SPAN
    # ═══════════════════════════════════════════════════════════════════

    async def insert_metadata_span(
        self, span_id: str, epoch_id: str, observation_id: str,
        text: str, start_pos: int, end_pos: int,
        span_type: str, confidence: float,
        markdown_role: str = None, discourse_role: str = None,
        event_candidate: bool = False, features: dict = None,
        provenance: dict = None,
    ) -> None:
        if not self.pool:
            return
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO metadata_span
                         (span_id, epoch_id, observation_id, text, start_pos,
                          end_pos, span_type, confidence, markdown_role,
                          discourse_role, event_candidate, features, provenance)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                       ON CONFLICT (span_id) DO UPDATE SET
                         text = EXCLUDED.text, confidence = EXCLUDED.confidence""",
                    span_id, epoch_id, observation_id,
                    text, start_pos, end_pos,
                    span_type, confidence,
                    markdown_role, discourse_role, event_candidate,
                    json.dumps(features or {}), json.dumps(provenance or {}),
                )
        except Exception as e:
            logger.error("insert_metadata_span(%s): %s", span_id, e)

    # ═══════════════════════════════════════════════════════════════════
    # OBSERVATION EDGE HINT
    # ═══════════════════════════════════════════════════════════════════

    async def insert_edge_hint(
        self, hint_id: str, epoch_id: str,
        from_obs_id: str, to_obs_id: str,
        evidence_type: str, evidence_confidence: float,
    ) -> None:
        if not self.pool:
            return
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO observation_edge_hint
                         (hint_id, epoch_id, observation_ids, evidence)
                       VALUES ($1, $2, ARRAY[$3, $4]::uuid[],
                               jsonb_build_object('type', $5, 'confidence', $6))
                       ON CONFLICT (hint_id) DO NOTHING""",
                    hint_id, epoch_id,
                    from_obs_id, to_obs_id,
                    evidence_type, evidence_confidence,
                )
        except Exception as e:
            logger.error("insert_edge_hint(%s): %s", hint_id, e)


