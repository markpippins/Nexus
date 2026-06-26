import os
import uuid
import logging
from datetime import datetime
import re
import asyncio
from .models import FileObservation, MetadataSpanEmitted, MetadataSpan, DirectoryObservation, ObservationEdgeHint
from .voyager_envelope_adapter import create_envelope
from .cache import DedupeCache
from .publisher import Publisher
from .topology import TopologyEngine

class Scanner:
    def __init__(self, cache: DedupeCache, publisher: Publisher, topology: TopologyEngine = None):
        self.cache = cache
        # Bind the scanner to its authorized layer
        self.publisher = publisher.scoped("fs-crawler")
        # Bind topology engine to its authorized layer
        self.topology = topology or TopologyEngine(publisher.scoped("topology"))
        self.running = False
        self.current_epoch: str = None

    async def scan(self, root_path: str):
        """Walks the filesystem once and processes entries."""
        root_path = os.path.abspath(root_path)
        self.current_epoch = str(uuid.uuid4())
        self.topology.set_epoch(self.current_epoch)
        logging.info(f"Starting single scan of {root_path} (epoch: {self.current_epoch})")
        await self._do_scan(root_path)
        self.topology.compute_signals()
        await self.topology.emit_signals()

    async def scan_continuous(self, root_path: str, interval: int = 10):
        """Continuously polls the filesystem for changes."""
        root_path = os.path.abspath(root_path)
        logging.info(f"Starting continuous scan of {root_path} (interval: {interval}s)")
        self.running = True
        while self.running:
            self.current_epoch = str(uuid.uuid4())
            self.topology.set_epoch(self.current_epoch)
            logging.debug(f"Scan cycle started (epoch: {self.current_epoch})")
            await self._do_scan(root_path)
            self.topology.compute_signals()
            await self.topology.emit_signals()
            await asyncio.sleep(interval)

    async def _do_scan(self, root_path: str):
        for root, dirs, files in os.walk(root_path):
            # Process directory
            try:
                await self.process_dir(root)
            except Exception as e:
                logging.error(f"Error processing dir {root}: {e}")

            for file in files:
                full_path = os.path.join(root, file)
                try:
                    await self.process_file(full_path)
                except Exception as e:
                    logging.error(f"Error processing {full_path}: {e}")

    async def process_dir(self, path: str):
        """Processes a directory entry."""
        try:
            stat = os.stat(path)
        except FileNotFoundError:
            return

        inode = stat.st_ino
        device_id = stat.st_dev
        
        # We don't dedupe directories the same way as files for now,
        # but we emit observations so Topology can track them.
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

    async def process_file(self, path: str):
        """Processes a single file, emitting observations and metadata if changed."""
        try:
            stat = os.stat(path)
        except FileNotFoundError:
            return

        mtime = datetime.fromtimestamp(stat.st_mtime).isoformat() + "Z"
        size = stat.st_size
        inode = stat.st_ino
        device_id = stat.st_dev

        cached = self.cache.get(path)
        if cached and cached["mtime"] == mtime and cached["size"] == size:
            # Already observed this version, skip publishing
            # but tell topology it's still part of the current structure
            await self.topology.record_active(cached["observation_id"], path)
            return

        observation_id = str(uuid.uuid4())
        observation = FileObservation(
            observation_id=observation_id,
            path=os.path.abspath(path),
            size=size,
            mtime=mtime,
            inode=inode,
            device_id=device_id
        )

        envelope = create_envelope(
            event_type="FileObservation",
            origin_layer="fs-crawler",
            epoch_id=self.current_epoch,
            payload=observation.model_dump()
        )

        await self.publisher.publish("nexus.fs.v1.observation", envelope)
        
        # Emit early Observation Edge Hints (Weak signals for Identity Engine)
        if cached and cached.get("inode") == inode:
            hint = ObservationEdgeHint(
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
                    
                    span = MetadataSpan(
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
                
                # Could add more patterns for lists, bold text, etc.
        except Exception as e:
            logging.error(f"Extraction failed for {observation.path}: {e}")
