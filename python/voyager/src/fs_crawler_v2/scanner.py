import os
import uuid
import logging
from datetime import datetime, timezone
import re
import asyncio
from .models import FileObservation, MetadataSpanEmitted, MetadataSpan, DirectoryObservation, ObservationEdgeHint
from .voyager_envelope_adapter import create_envelope
from .cache import DedupeCache
from .publisher import Publisher
from .topology import TopologyEngine
from .persistence import PersistenceLayer, hash_file

# ── Default ignore lists ───────────────────────────────────────────────
# Overridable via VOYAGER_IGNORE_DIRS / VOYAGER_IGNORE_EXTENSIONS env vars
# or --ignore-dirs / --ignore-extensions CLI flags.

DEFAULT_IGNORE_DIRS: set[str] = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "target", ".mypy_cache", ".pytest_cache", ".tox",
    ".idea", ".vscode", ".DS_Store", "build", "egg-info", "eggs",
    ".angular",
}

DEFAULT_IGNORE_EXTENSIONS: set[str] = {
    ".pyc", ".pyo", ".o", ".so", ".class", ".dll", ".dylib",
    ".exe", ".bin", ".zip", ".tar", ".gz", ".xz", ".bz2",
    ".7z", ".rar", ".png", ".jpg", ".jpeg", ".gif", ".bmp",
    ".ico", ".svg", ".mp3", ".mp4", ".avi", ".mov", ".webm",
    ".ttf", ".woff", ".woff2", ".eot", ".map", ".lock",
}


def _parse_env_set(env_val: str | None, defaults: set[str]) -> set[str]:
    """Parse a comma-separated env var into a set, or return defaults."""
    if not env_val:
        return defaults
    return {s.strip() for s in env_val.split(",") if s.strip()}


class Scanner:
    def __init__(self, cache: DedupeCache, publisher: Publisher,
                 topology: TopologyEngine = None,
                 persistence: PersistenceLayer = None,
                 ignore_dirs: set[str] | None = None,
                 ignore_extensions: set[str] | None = None):
        self.cache = cache
        # Bind the scanner to its authorized layer
        self.publisher = publisher.scoped("fs-crawler")
        # Bind topology engine to its authorized layer
        self.topology = topology or TopologyEngine(publisher.scoped("topology"))
        # Optional PostgreSQL persistence layer
        self.pg = persistence
        self.running = False
        self.current_epoch: str = None
        self._epoch_file_count = 0
        self._epoch_new_count = 0
        self._epoch_cache_count = 0
        self._epoch_error_count = 0
        self._epoch_skipped_count = 0
        self._epoch_dir_skip_count = 0
        # Stage 3.5 activity tracking: a dir is "processed" when its subtree
        # signature mismatched (i.e. it was re-visited). An epoch is IDLE when
        # no dir was processed and no errors occurred — idle epochs cost zero
        # PG writes and zero topology NATS publishes.
        self._epoch_dir_processed = 0
        self._epoch_dirs_seen: set = set()

        # Ignore lists — CLI > env var > defaults
        env_dirs = os.getenv("VOYAGER_IGNORE_DIRS")
        env_exts = os.getenv("VOYAGER_IGNORE_EXTENSIONS")
        self.ignore_dirs = ignore_dirs if ignore_dirs is not None else _parse_env_set(env_dirs, DEFAULT_IGNORE_DIRS)
        self.ignore_extensions = ignore_extensions if ignore_extensions is not None else _parse_env_set(env_exts, DEFAULT_IGNORE_EXTENSIONS)

        logging.debug(f"Ignore dirs: {sorted(self.ignore_dirs)}")
        logging.debug(f"Ignore extensions: {sorted(self.ignore_extensions)}")

    async def scan(self, root_path: str):
        """Walks the filesystem once and processes entries.

        Stage 3.5 idle gating: when the epoch observes no activity (no dirs
        re-visited, no files processed, no errors), the scan_epoch row and
        topology signal emission are skipped entirely — a quiescent tree
        costs zero PG writes and zero NATS publishes. Changed epochs retain
        full behavior. The epoch row is created after the scan so idle epochs
        can skip it; observation inserts only reference epoch_id (no FK), so
        the ordering is safe.
        """
        root_path = os.path.abspath(root_path)
        self.current_epoch = str(uuid.uuid4())
        self.topology.set_epoch(self.current_epoch)
        self._reset_epoch_counters()

        logging.info(f"Starting single scan of {root_path} (epoch: {self.current_epoch})")
        # Capture real scan start so the deferred epoch row's started_at stays
        # truthful (create_epoch runs post-scan, only on changed epochs).
        scan_started_at = datetime.now(timezone.utc)
        await self._do_scan(root_path)

        changed = self._epoch_changed()
        if changed:
            # Stage 3: unchanged subtrees were skipped (no observations) — carry
            # their last-known members forward so topology doesn't flag them vanished.
            self.topology.restage_skipped_subtrees()
            self.topology.compute_signals()
            await self.topology.emit_signals()

            # Persist epoch start + completion (deferred post-scan: idle
            # epochs never touch PG, so this row exists only for activity).
            if self.pg:
                await self.pg.create_epoch(self.current_epoch, root_path,
                                           started_at=scan_started_at)
                await self.pg.complete_epoch(
                    self.current_epoch,
                    files_scanned=self._epoch_file_count,
                    new_files=self._epoch_new_count,
                    cached_files=self._epoch_cache_count,
                    errors_count=self._epoch_error_count,
                )

        # Stage 3.5: keep directory_history bounded — drop entries for dirs
        # that no longer exist. Must run AFTER compute_signals() so a just-
        # reported deletion (parent evolution signal) isn't silently lost.
        self.topology.prune_history(self._epoch_dirs_seen)

        logging.info(
            f"Epoch {self.current_epoch[:8]}: "
            f"{self._epoch_file_count} files ({self._epoch_new_count} new, "
            f"{self._epoch_cache_count} cached, {self._epoch_skipped_count} skipped, "
            f"{self._epoch_dir_skip_count} dirs skipped, "
            f"{self._epoch_error_count} errors)"
            + ("" if changed else " — idle: PG + topology gated")
        )

    async def scan_continuous(self, root_path: str, interval: int = 10,
                              cooldown_threshold: int = 50,
                              cooldown_factor: float = 2.0,
                              cooldown_max: int = 600):
        """Continuously polls the filesystem for changes.

        Cooldown semantics: after an epoch that observed > cooldown_threshold
        new files, back off proportionally before the next scan:
            delay = min(max(interval, cooldown_factor * new_count), cooldown_max)
        Idle epochs sleep exactly `interval` (see also systemd caps in
        ~/.config/systemd/user/voyager.service).

        Stage 3.5 idle gating: quiescent epochs (no dirs re-visited, no files
        processed, no errors) skip the scan_epoch row AND topology signal
        emission — zero PG writes, zero NATS publishes while the tree is
        unchanged. Changed epochs keep full behavior.
        """
        root_path = os.path.abspath(root_path)
        logging.info(f"Starting continuous scan of {root_path} (interval: {interval}s, cooldown: >{cooldown_threshold} new -> max({interval}, {cooldown_factor}x) capped {cooldown_max}s)")
        self.running = True
        while self.running:
            self.current_epoch = str(uuid.uuid4())
            self.topology.set_epoch(self.current_epoch)
            self._reset_epoch_counters()

            # Capture real scan start so the deferred epoch row's started_at
            # stays truthful (create_epoch runs post-scan, only on changed
            # epochs).
            scan_started_at = datetime.now(timezone.utc)
            logging.debug(f"Scan cycle started (epoch: {self.current_epoch})")
            await self._do_scan(root_path)

            changed = self._epoch_changed()
            if changed:
                # Stage 3: unchanged subtrees were skipped (no observations) —
                # carry their last-known members forward so topology doesn't
                # flag them vanished.
                self.topology.restage_skipped_subtrees()
                self.topology.compute_signals()
                await self.topology.emit_signals()

                # Persist epoch start + completion (deferred post-scan: idle
                # epochs never touch PG, so this row exists only for activity).
                if self.pg:
                    await self.pg.create_epoch(self.current_epoch, root_path,
                                               started_at=scan_started_at)
                    await self.pg.complete_epoch(
                        self.current_epoch,
                        files_scanned=self._epoch_file_count,
                        new_files=self._epoch_new_count,
                        cached_files=self._epoch_cache_count,
                        errors_count=self._epoch_error_count,
                    )

            # Stage 3.5: keep directory_history bounded — drop entries for
            # dirs that no longer exist. Must run AFTER compute_signals() so
            # a just-reported deletion isn't silently lost from history.
            self.topology.prune_history(self._epoch_dirs_seen)

            logging.info(
                f"Epoch {self.current_epoch[:8]}: "
                f"{self._epoch_file_count} files ({self._epoch_new_count} new, "
                f"{self._epoch_cache_count} cached, {self._epoch_skipped_count} skipped, "
                f"{self._epoch_dir_skip_count} dirs skipped, "
                f"{self._epoch_error_count} errors)"
                + ("" if changed else " — idle: PG + topology gated")
            )

            # Adaptive cooldown: busy epochs back off so a big change flood
            # doesn't hammer the FS/Redis/PG repeatedly. Idle epochs stay lean.
            if self._epoch_new_count > cooldown_threshold:
                delay = int(min(max(interval, cooldown_factor * self._epoch_new_count), cooldown_max))
                logging.info(f"Epoch busy ({self._epoch_new_count} new > {cooldown_threshold}) — cooldown {delay}s before next scan")
            else:
                delay = interval
            await asyncio.sleep(delay)

    def _reset_epoch_counters(self):
        self._epoch_file_count = 0
        self._epoch_new_count = 0
        self._epoch_cache_count = 0
        self._epoch_error_count = 0
        self._epoch_skipped_count = 0
        self._epoch_dir_skip_count = 0
        self._epoch_dir_processed = 0
        self._epoch_dirs_seen = set()

    def _epoch_changed(self) -> bool:
        """True when this epoch observed any activity worth recording.

        Any dir re-visited (subtree signature mismatch) or any processing
        error makes the epoch "changed". New/cached file counts are subsumed:
        files are only ever processed inside re-visited dirs.
        """
        return self._epoch_dir_processed > 0 or self._epoch_error_count > 0

    async def _do_scan(self, root_path: str):
        # ── Pass 1: walk once, collecting per-directory data ─────────────────
        # Pre-order walk (parents before children). No per-file work or Redis
        # probes happen here — just the cheap local stat/scandir per dir.
        dirs_info = []  # (root, parent, own_sig, files)
        for root, dirs, files in os.walk(root_path):
            # Prune ignored directories in-place so os.walk never descends into them
            dirs[:] = [d for d in dirs if d not in self.ignore_dirs]
            self._epoch_dirs_seen.add(root)
            dirs_info.append((root, os.path.dirname(root), self._dir_signature(root), files))

        # ── Post-order pass: fold subtree aggregates, decide skip/process ────
        # Reversed pre-order guarantees children precede their parent, so each
        # dir's full signature incorporates its ENTIRE subtree. A change
        # anywhere — add/edit/delete of a file at any depth — propagates up and
        # mismatches every ancestor, so only changed paths are re-visited;
        # unchanged branches still collapse to one dir probe each.
        children: dict[str, list[str]] = {}
        for root, parent, _sig, _files in dirs_info:
            children.setdefault(parent, []).append(root)

        computed: dict[str, dict] = {}
        skipped: set[str] = set()
        for root, _parent, own_sig, _files in reversed(dirs_info):
            if own_sig is None:
                continue  # stat failed — treat as changed; don't cache
            full_sig = own_sig.copy()
            subtree_files = own_sig["direct_file_count"]
            subtree_mtime = own_sig["direct_mtime_sum"]
            subtree_mtime_max = own_sig["direct_mtime_max"]
            subtree_size = own_sig["direct_size_sum"]
            subtree_size_max = own_sig["direct_size_max"]
            for child in children.get(root, []):
                child_sig = computed.get(child)
                if child_sig is not None:
                    subtree_files += child_sig["subtree_file_count"]
                    subtree_mtime += child_sig["subtree_mtime_sum"]
                    if child_sig["subtree_mtime_max"] > subtree_mtime_max:
                        subtree_mtime_max = child_sig["subtree_mtime_max"]
                    subtree_size += child_sig["subtree_size_sum"]
                    if child_sig["subtree_size_max"] > subtree_size_max:
                        subtree_size_max = child_sig["subtree_size_max"]
            full_sig["subtree_file_count"] = subtree_files
            full_sig["subtree_mtime_sum"] = subtree_mtime
            full_sig["subtree_mtime_max"] = subtree_mtime_max
            full_sig["subtree_size_sum"] = subtree_size
            full_sig["subtree_size_max"] = subtree_size_max
            computed[root] = full_sig

            if full_sig == self.cache.get_dir(root):
                skipped.add(root)
            else:
                # Record the signature from THIS walk. If processing below
                # detects further changes, the recorded signature is already
                # stale and the next epoch re-detects them (safe direction).
                self.cache.set_dir(root, full_sig)

        # ── Pass 2: process only dirs on changed paths ──────────────────────
        for root, _parent, _sig, files in dirs_info:
            if root in skipped:
                self._epoch_dir_skip_count += 1
                continue

            self._epoch_dir_processed += 1
            # Process directory
            try:
                await self.process_dir(root)
            except Exception as e:
                logging.error(f"Error processing dir {root}: {e}")

            for file in files:
                # Skip files with ignored extensions
                ext = os.path.splitext(file)[1].lower()
                if ext in self.ignore_extensions:
                    self._epoch_skipped_count += 1
                    continue

                full_path = os.path.join(root, file)
                try:
                    await self.process_file(full_path)
                except Exception as e:
                    logging.error(f"Error processing {full_path}: {e}")

    def _dir_signature(self, path: str) -> dict | None:
        """Cheap per-directory signature — own stat + DIRECT children only.

        Combined post-order with children's subtree aggregates in _do_scan,
        this becomes a full-subtree signature: any add/edit/delete at any depth
        changes the folded file-count/mtime/size sums or the subtree max-file
        mtime/size, which propagate up and mismatch every ancestor, so only
        changed paths are re-visited. The max-file-mtime and max-file-size
        components close the sum-collision class (e.g. two files' mtimes or
        sizes changing while their sums stay constant). A quiescent tree
        collapses to O(dirs) Redis probes (fs:dirc) per epoch instead of
        O(files) (fs:cache) — while staying change-correct.
        """
        try:
            st = os.stat(path)
        except OSError:
            return None
        # Aggregate keys default to 0 so an OSError mid-scandir (e.g. an
        # unreadable dir) still yields a complete, stable signature instead of
        # a partial dict that would KeyError the post-order fold in _do_scan.
        sig = {
            "mtime_ns": st.st_mtime_ns,
            "nlink": st.st_nlink,
            "size": st.st_size,
            "entry_count": 0,
            "subdir_count": 0,
            "direct_file_count": 0,
            "direct_mtime_sum": 0,
            "direct_mtime_max": 0,
            "direct_size_sum": 0,
            "direct_size_max": 0,
        }
        try:
            entry_count = 0
            subdir_count = 0
            direct_file_count = 0
            direct_mtime_sum = 0
            direct_mtime_max = 0
            direct_size_sum = 0
            direct_size_max = 0
            with os.scandir(path) as it:
                for e in it:
                    entry_count += 1
                    try:
                        if e.is_dir(follow_symlinks=False):
                            subdir_count += 1
                        elif e.is_file(follow_symlinks=False):
                            direct_file_count += 1
                            fst = e.stat()
                            direct_mtime_sum += fst.st_mtime_ns
                            if fst.st_mtime_ns > direct_mtime_max:
                                direct_mtime_max = fst.st_mtime_ns
                            direct_size_sum += fst.st_size
                            if fst.st_size > direct_size_max:
                                direct_size_max = fst.st_size
                    except OSError:
                        continue
            sig.update(
                entry_count=entry_count,
                subdir_count=subdir_count,
                direct_file_count=direct_file_count,
                direct_mtime_sum=direct_mtime_sum,
                direct_mtime_max=direct_mtime_max,
                direct_size_sum=direct_size_sum,
                direct_size_max=direct_size_max,
            )
        except OSError:
            pass
        return sig

    async def process_dir(self, path: str):
        """Processes a directory entry."""
        try:
            stat = os.stat(path)
        except FileNotFoundError:
            return

        inode = stat.st_ino
        device_id = stat.st_dev

        observation_id = str(uuid.uuid4())
        observation = DirectoryObservation(
            observation_id=observation_id,
            path=os.path.abspath(path),
            inode=inode,
            device_id=device_id
        )

        envelope = create_envelope(
            event_type="DirectoryObservation",
            origin_layer="fs-crawler",
            epoch_id=self.current_epoch,
            payload=observation.model_dump()
        )
        await self.publisher.publish("nexus.fs.v1.observation", envelope)
        await self.topology.record_directory(observation)

        # Persist to Postgres
        if self.pg:
            await self.pg.insert_directory_observation(
                observation_id, self.current_epoch,
                os.path.abspath(path), inode, device_id,
            )

    async def process_file(self, path: str):
        """Processes a single file, emitting observations and metadata if changed."""
        try:
            stat = os.stat(path)
        except FileNotFoundError:
            self._epoch_error_count += 1
            return

        self._epoch_file_count += 1

        mtime_dt = datetime.fromtimestamp(stat.st_mtime)
        mtime = mtime_dt.isoformat() + "Z"
        size = stat.st_size
        inode = stat.st_ino
        device_id = stat.st_dev

        cached = self.cache.get(path)
        if cached and cached["mtime"] == mtime and cached["size"] == size:
            self._epoch_cache_count += 1
            # Already observed this version, skip publishing
            # but tell topology it's still part of the current structure
            await self.topology.record_active(cached["observation_id"], path)
            return

        self._epoch_new_count += 1
        observation_id = str(uuid.uuid4())

        # Compute content hash only when persistence is enabled AND it's a text-based file
        content_hash = None
        if self.pg:
            ext = os.path.splitext(path)[1].lower()
            from .persistence import HASHABLE_EXTENSIONS
            if ext in HASHABLE_EXTENSIONS:
                content_hash = hash_file(path)

        observation = FileObservation(
            observation_id=observation_id,
            path=os.path.abspath(path),
            size=size,
            mtime=mtime,
            inode=inode,
            device_id=device_id,
            content_hash=content_hash,
        )

        envelope = create_envelope(
            event_type="FileObservation",
            origin_layer="fs-crawler",
            epoch_id=self.current_epoch,
            payload=observation.model_dump()
        )

        await self.publisher.publish("nexus.fs.v1.observation", envelope)

        # Persist to Postgres
        if self.pg:
            await self.pg.insert_file_observation(
                observation_id, self.current_epoch,
                os.path.abspath(path), size, mtime_dt,
                inode, device_id, content_hash,
            )

        # Emit early Observation Edge Hints (Weak signals for Identity Engine)
        if cached and cached.get("inode") == inode:
            hint_id = str(uuid.uuid4())
            hint = ObservationEdgeHint(
                hint_id=hint_id,
                observation_ids=[cached["observation_id"], observation_id],
                evidence={"type": "inode_match", "confidence": 0.9}
            )
            hint_envelope = create_envelope(
                event_type="ObservationEdgeHint",
                origin_layer="fs-crawler",
                epoch_id=self.current_epoch,
                payload=hint.model_dump()
            )
            await self.publisher.publish("nexus.fs.v1.hint", hint_envelope)

            # Persist edge hint
            if self.pg:
                await self.pg.insert_edge_hint(
                    hint_id, self.current_epoch,
                    cached["observation_id"], observation_id,
                    "inode_match", 0.9,
                )

        self.cache.set(path, mtime, size, observation_id, inode)

        # Record for topology
        await self.topology.record_observation(observation)

        # Trigger extraction for specific types (e.g., .md)
        if path.lower().endswith(".md"):
             await self.extract_metadata(observation)

    async def extract_metadata(self, observation: FileObservation):
        """
        Improved extractor for Markdown files.
        Uses regex to identify multiple structural spans (headers).
        """
        try:
            with open(observation.path, 'r', encoding='utf-8') as f:
                content = f.read(65536) # Read first 64KB for better coverage

                # Regex for markdown headers: # Header
                header_pattern = re.compile(r'^(#{1,6})\s+(.+)$', re.MULTILINE)

                for match in header_pattern.finditer(content):
                    level = len(match.group(1))
                    text = match.group(2).strip()
                    start_pos, end_pos = match.span()

                    span_id = str(uuid.uuid4())
                    span = MetadataSpan(
                        id=span_id,
                        text=text,
                        start=start_pos,
                        end=end_pos,
                        span_type="STRUCTURAL",
                        confidence=1.0,
                        markdown_role=f"h{level}",
                        features={"level": level}
                    )

                    emit = MetadataSpanEmitted(
                        observation_id=observation.observation_id,
                        span=span
                    )

                    envelope = create_envelope(
                        event_type="MetadataSpanEmitted",
                        origin_layer="fs-crawler",
                        epoch_id=self.current_epoch,
                        source_event_ids=[observation.observation_id],
                        payload=emit.model_dump()
                    )
                    await self.publisher.publish("nexus.fs.v1.span", envelope)

                    # Persist span to Postgres
                    if self.pg:
                        await self.pg.insert_metadata_span(
                            span_id, self.current_epoch,
                            observation.observation_id,
                            text, start_pos, end_pos,
                            "STRUCTURAL", 1.0,
                            markdown_role=f"h{level}",
                            features={"level": level},
                        )

                # Could add more patterns for lists, bold text, etc.
        except Exception as e:
            logging.error(f"Extraction failed for {observation.path}: {e}")
