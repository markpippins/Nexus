"""
Tests for voyager/fs_crawler_v2 — the 2nd largest untested Python module (11 files, 0 tests).
Covers models, validator, cache (local fallback), and drift magnitude.
"""
import sys
import os
import pytest

# Add voyager/src/ to path so 'from fs_crawler_v2.xxx' imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))


# ── models — Actor & Intent (pure classes) ─────────────────────

class TestActor:
    """Actor — simple identity class with id/type."""

    def test_default_constructor(self):
        from fs_crawler_v2.models import Actor
        actor = Actor()
        assert actor.type == "service"
        assert actor.id is not None
        assert "voyager" in actor.id

    def test_custom_id(self):
        from fs_crawler_v2.models import Actor
        actor = Actor(id="test-agent", type="daemon")
        assert actor.id == "test-agent"
        assert actor.type == "daemon"

    def test_to_dict(self):
        from fs_crawler_v2.models import Actor
        actor = Actor(id="agent-1", type="service")
        d = actor.to_dict()
        assert d == {"id": "agent-1", "type": "service"}


class TestIntent:
    """Intent — action/target_type class."""

    def test_default_constructor(self):
        from fs_crawler_v2.models import Intent
        intent = Intent()
        assert intent.action == "observe"
        assert intent.target_type == "file"

    def test_custom_values(self):
        from fs_crawler_v2.models import Intent
        intent = Intent(action="scan", target_type="directory")
        assert intent.action == "scan"
        assert intent.target_type == "directory"

    def test_to_dict(self):
        from fs_crawler_v2.models import Intent
        intent = Intent(action="observe", target_type="file")
        d = intent.to_dict()
        assert d == {"action": "observe", "target_type": "file"}


# ── models — Pydantic BaseModels ────────────────────────────────

class TestFileObservation:
    """FileObservation — Pydantic BaseModel for file observations."""

    def test_constructor_minimal(self):
        from fs_crawler_v2.models import FileObservation
        obs = FileObservation(
            observation_id="obs-1", path="/tmp/test.txt",
            size=100, mtime="2026-01-01T00:00:00",
            inode=12345, device_id=2050,
        )
        assert obs.observation_id == "obs-1"
        assert obs.path == "/tmp/test.txt"
        assert obs.size == 100
        assert obs.inode == 12345
        assert obs.content_hash is None

    def test_constructor_with_hash(self):
        from fs_crawler_v2.models import FileObservation
        obs = FileObservation(
            observation_id="obs-2", path="/tmp/hashed.txt",
            size=200, mtime="2026-01-01T00:00:00",
            inode=12346, device_id=2050,
            content_hash="abc123",
        )
        assert obs.content_hash == "abc123"

    def test_model_dump(self):
        from fs_crawler_v2.models import FileObservation
        obs = FileObservation(
            observation_id="obs-3", path="/tmp/x.txt",
            size=50, mtime="2026-01-01T00:00:00",
            inode=1, device_id=1,
        )
        d = obs.model_dump()
        assert d["observation_id"] == "obs-3"
        assert d["size"] == 50


class TestPhysicalFingerprint:
    """PhysicalFingerprint — device_id, inode, size, mtime."""

    def test_to_key(self):
        from fs_crawler_v2.models import PhysicalFingerprint
        fp = PhysicalFingerprint(device_id=2050, inode=42, size=1024, mtime="t1")
        key = fp.to_key()
        assert key == (2050, 42, 1024, "t1")
        assert isinstance(key, tuple)

    def test_eq_same_values(self):
        from fs_crawler_v2.models import PhysicalFingerprint
        a = PhysicalFingerprint(device_id=1, inode=1, size=1, mtime="x")
        b = PhysicalFingerprint(device_id=1, inode=1, size=1, mtime="x")
        assert a == b

    def test_neq_different_size(self):
        from fs_crawler_v2.models import PhysicalFingerprint
        a = PhysicalFingerprint(device_id=1, inode=1, size=1, mtime="x")
        b = PhysicalFingerprint(device_id=1, inode=1, size=2, mtime="x")
        assert a != b


class TestDirectoryObservation:
    """DirectoryObservation — Pydantic BaseModel for directory observations."""

    def test_constructor(self):
        from fs_crawler_v2.models import DirectoryObservation
        obs = DirectoryObservation(
            observation_id="dir-1", path="/tmp/mydir",
            inode=99, device_id=2050,
        )
        assert obs.observation_id == "dir-1"
        assert obs.inode == 99


class TestTopologySignal:
    """TopologySignal — Pydantic model with auto-generated signal_id."""

    def test_defaults(self):
        from fs_crawler_v2.models import TopologySignal
        sig = TopologySignal(
            observation_ids=["obs-1", "obs-2"],
            structure={"type": "tree", "scope": "global"},
            geometry={"path": "/tmp"},
        )
        assert sig.signal_id is not None
        assert len(sig.signal_id) > 0
        assert sig.observation_ids == ["obs-1", "obs-2"]
        assert sig.constraints == {"purely_structural": True}


class TestMetadataSpan:
    """MetadataSpan — Pydantic model for markdown/discourse spans."""

    def test_constructor(self):
        from fs_crawler_v2.models import MetadataSpan
        span = MetadataSpan(
            text="## Heading", start=0, end=10,
            span_type="STRUCTURAL", confidence=0.95,
        )
        assert span.text == "## Heading"
        assert span.span_type == "STRUCTURAL"
        assert span.confidence == 0.95
        assert span.features == {}
        assert span.provenance == {}

    def test_event_candidate_flag(self):
        from fs_crawler_v2.models import MetadataSpan
        span = MetadataSpan(
            text="event", start=0, end=5,
            span_type="EVENT_CANDIDATE", confidence=0.8,
            event_candidate=True,
        )
        assert span.event_candidate is True


class TestIdentityCandidate:
    """IdentityCandidate — Pydantic model for identity resolution candidates."""

    def test_constructor(self):
        from fs_crawler_v2.models import IdentityCandidate
        cand = IdentityCandidate(
            observation_ids=["obs-1"],
            evidence={"structural": True},
            confidence=0.75,
        )
        assert cand.candidate_id is not None
        assert cand.confidence == 0.75


class TestEntity:
    """Entity — Pydantic model for resolved entities."""

    def test_constructor(self):
        from fs_crawler_v2.models import Entity
        entity = Entity(
            canonical_observations=["obs-1", "obs-2"],
            lineage={"root_observation": "obs-1", "transformation_chain": []},
            stability_score=0.5,
        )
        assert entity.entity_id is not None
        assert entity.canonical_observations == ["obs-1", "obs-2"]
        assert entity.stability_score == 0.5


class TestEntityDrift:
    """EntityDrift — Pydantic model for entity changes."""

    def test_constructor(self):
        from fs_crawler_v2.models import EntityDrift
        drift = EntityDrift(
            entity_id="ent-1", observation_id="obs-99",
            delta={"size": {"old": 100, "new": 120}},
            magnitude="MINOR", confidence=0.9,
        )
        assert drift.entity_id == "ent-1"
        assert drift.magnitude == "MINOR"
        assert drift.delta["size"]["old"] == 100


# ── validator — ContractValidator ───────────────────────────────

class TestContractValidator:
    """ContractValidator — SCCM write scopes and blindness constraints."""

    @pytest.fixture
    def validator(self):
        from fs_crawler_v2.validator import ContractValidator
        return ContractValidator()

    def _make_envelope(self, origin_layer, event_type, payload=None):
        """Create a minimal CanonicalEnvelope for testing."""
        from nats_envelope.envelope import CanonicalEnvelope
        return CanonicalEnvelope(
            event_type=event_type,
            origin_component=origin_layer,
            correlation_id="test-correlation-id",
            subject=f"nexus.{origin_layer}.v1.{event_type}",
            payload=payload or {},
        )

    # Green path
    def test_fs_crawler_file_observation(self, validator):
        env = self._make_envelope("fs-crawler", "FileObservation")
        assert validator.validate_emission(env) is True

    def test_fs_crawler_directory_observation(self, validator):
        env = self._make_envelope("fs-crawler", "DirectoryObservation")
        assert validator.validate_emission(env) is True

    def test_topology_signal(self, validator):
        env = self._make_envelope("topology", "TopologySignal")
        assert validator.validate_emission(env) is True

    def test_identity_candidate(self, validator):
        env = self._make_envelope("identity", "IdentityCandidate")
        assert validator.validate_emission(env) is True

    # Red path — unauthorized
    def test_unknown_layer_rejected(self, validator):
        env = self._make_envelope("unknown-layer", "FileObservation")
        with pytest.raises(ValueError, match="Unknown origin layer"):
            validator.validate_emission(env)

    def test_unauthorized_event_type(self, validator):
        env = self._make_envelope("fs-crawler", "IdentityCandidate")
        with pytest.raises(ValueError, match="not authorized"):
            validator.validate_emission(env)

    def test_publisher_mismatch(self, validator):
        env = self._make_envelope("fs-crawler", "FileObservation")
        with pytest.raises(ValueError, match="Publisher tied to"):
            validator.validate_emission(env, publisher_layer="identity")

    # Blindness constraints
    def test_identity_blindness_violation(self, validator):
        env = self._make_envelope("identity", "Entity",
            payload={"text": "sensitive content", "span": "leaked"})
        with pytest.raises(ValueError, match="blindness"):
            validator.validate_emission(env)

    def test_losm_blindness_violation(self, validator):
        env = self._make_envelope("losm", "RequirementCandidate",
            payload={"inode": 12345, "device_id": 2050})
        with pytest.raises(ValueError, match="blindness"):
            validator.validate_emission(env)

    def test_identity_no_blindness_violation_clean_payload(self, validator):
        env = self._make_envelope("identity", "Entity",
            payload={"entity_id": "e1", "stability": 0.9})
        assert validator.validate_emission(env) is True


# ── cache — DedupeCache (local fallback) ────────────────────────

class TestDedupeCache:
    """DedupeCache — local in-memory cache fallback."""

    def test_no_redis_uses_local(self):
        from fs_crawler_v2.cache import DedupeCache
        cache = DedupeCache(redis_url=None)
        assert cache.redis is None
        assert cache.local_cache == {}

    def test_get_miss_returns_none(self):
        from fs_crawler_v2.cache import DedupeCache
        cache = DedupeCache()
        assert cache.get("/nonexistent") is None

    def test_set_and_get(self):
        from fs_crawler_v2.cache import DedupeCache
        cache = DedupeCache()
        cache.set("/tmp/test.txt", "2026-01-01T00:00:00", 1024, "obs-1", 42)
        result = cache.get("/tmp/test.txt")
        assert result is not None
        assert result["size"] == 1024
        assert result["observation_id"] == "obs-1"
        assert result["inode"] == 42

    def test_overwrite_updates(self):
        from fs_crawler_v2.cache import DedupeCache
        cache = DedupeCache()
        cache.set("/tmp/x.txt", "old", 100, "obs-old", 1)
        cache.set("/tmp/x.txt", "new", 200, "obs-new", 1)
        assert cache.get("/tmp/x.txt")["size"] == 200


# ── drift magnitude — _calculate_drift_magnitude ────────────────

class TestDriftMagnitude:
    """IdentityEngine._calculate_drift_magnitude — size-based classification."""

    def _calc(self, old_size, new_size, old_mtime="t1", new_mtime="t2"):
        from fs_crawler_v2.models import PhysicalFingerprint
        from fs_crawler_v2.identity import IdentityEngine
        engine = IdentityEngine.__new__(IdentityEngine)  # bypass __init__
        old_fp = PhysicalFingerprint(device_id=1, inode=1, size=old_size, mtime=old_mtime)
        new_fp = PhysicalFingerprint(device_id=1, inode=1, size=new_size, mtime=new_mtime)
        return engine._calculate_drift_magnitude(old_fp, new_fp)

    def test_only_mtime_changed(self):
        assert self._calc(100, 100) == "TRACE"

    def test_small_change(self):
        assert self._calc(100, 103) == "MINOR"

    def test_moderate_change(self):
        assert self._calc(100, 115) == "MAJOR"

    def test_large_change(self):
        assert self._calc(100, 200) == "MASSIVE"

    def test_zero_to_something(self):
        assert self._calc(0, 100) == "MASSIVE"

    def test_zero_to_zero(self):
        assert self._calc(0, 0) == "TRACE"

    def test_boundary_4_percent(self):
        assert self._calc(100, 104) == "MINOR"

    def test_boundary_5_percent(self):
        assert self._calc(100, 105) == "MAJOR"

    def test_boundary_24_percent(self):
        assert self._calc(100, 124) == "MAJOR"

    def test_boundary_25_percent(self):
        assert self._calc(100, 125) == "MASSIVE"
