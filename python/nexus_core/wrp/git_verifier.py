"""Read-only Git verification for grant-bound execution claims.

The adapter verifies facts and returns immutable evidence.  It does not create
or update branches, commits, worktrees, receipts, propositions, or work
requests.  PEB/SOL owns admission and disposition decisions.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Protocol, Sequence


ADAPTER_VERSION = "git-verifier/1.0"
EVIDENCE_KIND = "git_ref_commit"
_EVIDENCE_DOMAIN = "sol-evidence:git:v1"
_MAX_OUTPUT = 64 * 1024
_VALID_COMMIT = re.compile(r"^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$")
_INVALID_REF_CHARS = re.compile(r"[\x00\x20\t\r\n~^:?*\[\\]")


class GitRunner(Protocol):
    """The only process boundary used by :class:`GitVerificationAdapter`."""

    def run(
        self, args: Sequence[str], cwd: Path, timeout_s: float
    ) -> subprocess.CompletedProcess[str]: ...


class SubprocessGitRunner:
    """Invoke Git with an argument list and no shell."""

    def run(
        self, args: Sequence[str], cwd: Path, timeout_s: float
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout_s,
        )


@dataclass(frozen=True)
class GitVerificationRequest:
    """Claim plus PEB/grant-bound verification context.

    ``repository_root``, ``base_ref``, and ``declared_paths`` must come from
    the grant, not from untrusted model prose.  The adapter preserves the
    external identifiers but does not assert that they are authoritative.
    """

    grant_id: str
    lease_id: str
    attempt_id: str
    repository_root: Path
    base_ref: str
    claimed_ref: str
    claimed_commit: str
    declared_paths: tuple[str, ...]
    claimant_id: str
    policy_hash: str


@dataclass(frozen=True)
class GitVerificationEvidence:
    """Immutable, content-addressed result of one Git verification attempt."""

    evidence_id: str
    evidence_kind: str
    verifier_id: str
    grant_id: str
    lease_id: str
    attempt_id: str
    policy_version_hash: str
    verifier_independence: bool
    repository_identity: str
    repository_root: str
    claimed_ref: str
    resolved_commit: str | None
    base_commit: str | None
    ref_exists: bool
    commit_reachable: bool
    changed_paths: tuple[str, ...]
    undeclared_paths: tuple[str, ...]
    scope_matches: bool
    observed_at: datetime
    adapter_version: str
    evidence_hash: str
    outcome: str  # verified | rejected | unavailable
    reason: str | None

    def to_peb_admission_envelope(
        self, resolution_claim_id: str, resolution_evidence_id: str
    ) -> dict[str, object]:
        """Serialize this result for the Supervisor → PEB admission contract.

        The IDs identify rows already persisted in resolution.  This method
        only builds the correlation envelope; it does not insert either row
        or claim that a rejected/unavailable result is admissible.
        """
        if not resolution_claim_id or not resolution_evidence_id:
            raise ValueError("resolution claim and evidence IDs are required")
        context = {
            "policy_version_hash": self.policy_version_hash,
            "lease_id": self.lease_id,
            "grant_id": self.grant_id,
            "attempt_id": self.attempt_id,
        }
        return {
            "execution_claim": {
                "resolution_claim_id": resolution_claim_id,
                **context,
            },
            "execution_evidence": {
                "resolution_evidence_id": resolution_evidence_id,
                "source_system": "git-verifier",
                "evidence_kind": self.evidence_kind,
                "source_hash": self.evidence_hash,
                "outcome": self.outcome,
                "verifier_id": self.verifier_id,
                "verifier_independence": self.verifier_independence,
                "observed_at": self.observed_at.isoformat(),
            },
            "execution_context": context,
        }


class GitVerificationAdapter:
    """Verify a Git claim using read-only commands against a bound root."""

    _READ_ONLY_COMMANDS = frozenset({"rev-parse", "merge-base", "diff"})

    def __init__(
        self,
        runner: GitRunner | None = None,
        *,
        verifier_id: str = ADAPTER_VERSION,
        timeout_s: float = 5.0,
        clock=None,
    ) -> None:
        if timeout_s <= 0:
            raise ValueError("timeout_s must be positive")
        self._runner = runner or SubprocessGitRunner()
        self._verifier_id = verifier_id
        self._timeout_s = timeout_s
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def verify(self, request: GitVerificationRequest) -> GitVerificationEvidence:
        """Return evidence without changing the repository or claim state."""

        observed_at = self._clock()
        root_text = str(request.repository_root)

        invalid = self._validate_request(request)
        if invalid:
            return self._result(
                request,
                observed_at=observed_at,
                repository_identity="",
                repository_root=root_text,
                claimed_ref=request.claimed_ref,
                outcome="rejected",
                reason=invalid,
            )

        if self._verifier_id == request.claimant_id:
            return self._result(
                request,
                observed_at=observed_at,
                repository_identity="",
                repository_root=root_text,
                claimed_ref=request.claimed_ref,
                outcome="rejected",
                reason="SELF_VERIFICATION_NOT_ALLOWED",
            )

        try:
            root = request.repository_root.resolve(strict=True)
        except (OSError, RuntimeError):
            return self._result(
                request,
                observed_at=observed_at,
                repository_identity="",
                repository_root=root_text,
                claimed_ref=request.claimed_ref,
                outcome="unavailable",
                reason="REPOSITORY_UNAVAILABLE",
            )

        try:
            top_level = self._read_one(["rev-parse", "--show-toplevel"], root)
            if top_level is None:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity="",
                    repository_root=str(root),
                    claimed_ref=request.claimed_ref,
                    outcome="unavailable",
                    reason="REPOSITORY_UNAVAILABLE",
                )
            if _resolve_path(top_level) != root:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity="",
                    repository_root=str(root),
                    claimed_ref=request.claimed_ref,
                    outcome="rejected",
                    reason="INVALID_VERIFICATION_SCOPE",
                )

            git_common_dir = self._read_one(["rev-parse", "--git-common-dir"], root)
            object_format = self._read_one(["rev-parse", "--show-object-format"], root)
            if git_common_dir is None or object_format is None:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity="",
                    repository_root=str(root),
                    claimed_ref=request.claimed_ref,
                    outcome="unavailable",
                    reason="REPOSITORY_METADATA_UNAVAILABLE",
                )
            repository_identity = self._repository_identity(
                root, git_common_dir, object_format
            )

            base_ref = _normalize_base_ref(request.base_ref)
            claimed_ref = _normalize_claimed_ref(request.claimed_ref)
            base_commit = self._resolve_commit(root, base_ref)
            if base_commit is None:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    base_commit=None,
                    outcome="unavailable",
                    reason="BASE_REF_UNAVAILABLE",
                )

            resolved_commit = self._resolve_commit(root, claimed_ref)
            if resolved_commit is None:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    base_commit=base_commit,
                    ref_exists=False,
                    outcome="rejected",
                    reason="CLAIMED_REF_NOT_FOUND",
                )

            if resolved_commit.lower() != request.claimed_commit.lower():
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    resolved_commit=resolved_commit,
                    base_commit=base_commit,
                    ref_exists=True,
                    outcome="rejected",
                    reason="CLAIMED_COMMIT_MISMATCH",
                )

            ancestry = self._run(
                ["merge-base", "--is-ancestor", base_commit, resolved_commit], root
            )
            if ancestry is None:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    resolved_commit=resolved_commit,
                    base_commit=base_commit,
                    ref_exists=True,
                    outcome="unavailable",
                    reason="ANCESTRY_VERIFICATION_UNAVAILABLE",
                )
            if ancestry.returncode == 1:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    resolved_commit=resolved_commit,
                    base_commit=base_commit,
                    ref_exists=True,
                    commit_reachable=False,
                    outcome="rejected",
                    reason="COMMIT_NOT_REACHABLE_FROM_BASE",
                )
            if ancestry.returncode != 0:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    resolved_commit=resolved_commit,
                    base_commit=base_commit,
                    ref_exists=True,
                    outcome="unavailable",
                    reason="ANCESTRY_VERIFICATION_FAILED",
                )

            diff = self._run(
                [
                    "diff",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--name-status",
                    "--find-renames",
                    f"{base_commit}...{resolved_commit}",
                ],
                root,
            )
            if diff is None:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    resolved_commit=resolved_commit,
                    base_commit=base_commit,
                    ref_exists=True,
                    commit_reachable=True,
                    outcome="unavailable",
                    reason="CHANGED_PATHS_UNAVAILABLE",
                )
            if diff.returncode != 0:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    resolved_commit=resolved_commit,
                    base_commit=base_commit,
                    ref_exists=True,
                    commit_reachable=True,
                    outcome="unavailable",
                    reason="CHANGED_PATHS_UNAVAILABLE",
                )

            changed_paths = _parse_changed_paths(diff.stdout[:_MAX_OUTPUT])
            if any(not _is_safe_relative_path(path) for path in changed_paths):
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    resolved_commit=resolved_commit,
                    base_commit=base_commit,
                    ref_exists=True,
                    commit_reachable=True,
                    changed_paths=changed_paths,
                    outcome="rejected",
                    reason="INVALID_VERIFICATION_SCOPE",
                )

            declared_paths = tuple(
                sorted({_normalize_relative_path(path) for path in request.declared_paths})
            )
            undeclared = tuple(
                sorted(
                    path
                    for path in changed_paths
                    if not any(_path_in_scope(path, declared) for declared in declared_paths)
                )
            )
            scope_matches = not undeclared
            if not scope_matches:
                return self._result(
                    request,
                    observed_at=observed_at,
                    repository_identity=repository_identity,
                    repository_root=str(root),
                    claimed_ref=claimed_ref,
                    resolved_commit=resolved_commit,
                    base_commit=base_commit,
                    ref_exists=True,
                    commit_reachable=True,
                    changed_paths=changed_paths,
                    undeclared_paths=undeclared,
                    scope_matches=False,
                    outcome="rejected",
                    reason="UNDECLARED_ARTIFACT_CHANGE",
                )

            return self._result(
                request,
                observed_at=observed_at,
                repository_identity=repository_identity,
                repository_root=str(root),
                claimed_ref=claimed_ref,
                resolved_commit=resolved_commit,
                base_commit=base_commit,
                ref_exists=True,
                commit_reachable=True,
                changed_paths=changed_paths,
                undeclared_paths=(),
                scope_matches=True,
                outcome="verified",
                reason=None,
            )
        except _Unavailable as exc:
            return self._result(
                request,
                observed_at=observed_at,
                repository_identity="",
                repository_root=str(request.repository_root),
                claimed_ref=request.claimed_ref,
                outcome="unavailable",
                reason=exc.reason,
            )

    def _run(
        self, args: Sequence[str], root: Path
    ) -> subprocess.CompletedProcess[str] | None:
        command = next((arg for arg in args if not arg.startswith("-")), "")
        if command not in self._READ_ONLY_COMMANDS:
            raise AssertionError(f"non-read-only Git command: {command}")
        try:
            return self._runner.run(args, root, self._timeout_s)
        except subprocess.TimeoutExpired as exc:
            raise _Unavailable("VERIFIER_TIMEOUT") from exc
        except PermissionError as exc:
            raise _Unavailable("VERIFIER_PERMISSION_DENIED") from exc
        except OSError as exc:
            raise _Unavailable("VERIFIER_EXECUTION_FAILED") from exc

    def _read_one(self, args: Sequence[str], root: Path) -> str | None:
        result = self._run(args, root)
        if result is None or result.returncode != 0:
            return None
        value = result.stdout.strip()
        return value or None

    def _resolve_commit(self, root: Path, ref: str) -> str | None:
        result = self._run(["rev-parse", "--verify", f"{ref}^{{commit}}"], root)
        if result is None:
            raise _Unavailable("VERIFIER_EXECUTION_FAILED")
        if result.returncode != 0:
            diagnostics = (result.stdout + "\n" + result.stderr).lower()
            if _is_missing_revision(diagnostics):
                # A missing ref/object is a known false claim. The caller
                # distinguishes a missing baseline from a missing claimed ref.
                return None
            raise _Unavailable("VERIFIER_REPOSITORY_ERROR")
        commit = result.stdout.strip()
        if not _VALID_COMMIT.fullmatch(commit):
            raise _Unavailable("VERIFIER_INVALID_OBJECT_ID")
        return commit

    @staticmethod
    def _repository_identity(root: Path, git_common_dir: str, object_format: str) -> str:
        common = Path(git_common_dir)
        if not common.is_absolute():
            common = root / common
        material = {
            "root": str(root),
            "git_common_dir": str(common.resolve()),
            "object_format": object_format.strip(),
        }
        return hashlib.sha256(_canonical_json(material)).hexdigest()

    def _result(
        self,
        request: GitVerificationRequest,
        *,
        observed_at: datetime,
        repository_identity: str,
        repository_root: str,
        claimed_ref: str,
        resolved_commit: str | None = None,
        base_commit: str | None = None,
        ref_exists: bool = False,
        commit_reachable: bool = False,
        changed_paths: tuple[str, ...] = (),
        undeclared_paths: tuple[str, ...] = (),
        scope_matches: bool = False,
        outcome: str,
        reason: str | None,
    ) -> GitVerificationEvidence:
        facts = {
            "evidence_kind": EVIDENCE_KIND,
            "verifier_id": self._verifier_id,
            "grant_id": request.grant_id,
            "lease_id": request.lease_id,
            "attempt_id": request.attempt_id,
            "repository_identity": repository_identity,
            "repository_root": repository_root,
            "claimed_ref": claimed_ref,
            "resolved_commit": resolved_commit,
            "base_commit": base_commit,
            "ref_exists": ref_exists,
            "commit_reachable": commit_reachable,
            "changed_paths": list(changed_paths),
            "undeclared_paths": list(undeclared_paths),
            "scope_matches": scope_matches,
            "adapter_version": ADAPTER_VERSION,
            "policy_hash": request.policy_hash,
            "verifier_independence": self._verifier_id != request.claimant_id,
            "claimant_id": request.claimant_id,
            "declared_paths": sorted(request.declared_paths),
            "outcome": outcome,
            "reason": reason,
        }
        evidence_hash = hashlib.sha256(
            _EVIDENCE_DOMAIN.encode() + b"\n" + _canonical_json(facts)
        ).hexdigest()
        return GitVerificationEvidence(
            evidence_id=f"git-evidence-v1:{evidence_hash}",
            evidence_kind=EVIDENCE_KIND,
            verifier_id=self._verifier_id,
            grant_id=request.grant_id,
            lease_id=request.lease_id,
            attempt_id=request.attempt_id,
            policy_version_hash=request.policy_hash,
            verifier_independence=self._verifier_id != request.claimant_id,
            repository_identity=repository_identity,
            repository_root=repository_root,
            claimed_ref=claimed_ref,
            resolved_commit=resolved_commit,
            base_commit=base_commit,
            ref_exists=ref_exists,
            commit_reachable=commit_reachable,
            changed_paths=changed_paths,
            undeclared_paths=undeclared_paths,
            scope_matches=scope_matches,
            observed_at=observed_at,
            adapter_version=ADAPTER_VERSION,
            evidence_hash=evidence_hash,
            outcome=outcome,
            reason=reason,
        )

    @staticmethod
    def _validate_request(request: GitVerificationRequest) -> str | None:
        identifiers = {
            "grant_id": request.grant_id,
            "lease_id": request.lease_id,
            "attempt_id": request.attempt_id,
            "claimant_id": request.claimant_id,
            "policy_hash": request.policy_hash,
        }
        if any(not isinstance(value, str) or not value.strip() for value in identifiers.values()):
            return "INVALID_VERIFICATION_SCOPE"
        if not isinstance(request.repository_root, Path) or not request.repository_root.is_absolute():
            return "INVALID_VERIFICATION_SCOPE"
        try:
            _normalize_base_ref(request.base_ref)
            _normalize_claimed_ref(request.claimed_ref)
            if not _VALID_COMMIT.fullmatch(request.claimed_commit):
                return "INVALID_CLAIMED_COMMIT"
            for path in request.declared_paths:
                _normalize_relative_path(path)
        except ValueError:
            return "INVALID_VERIFICATION_SCOPE"
        return None


class _Unavailable(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def _resolve_path(value: str) -> Path:
    return Path(value).resolve(strict=True)


def _normalize_base_ref(value: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError("empty base ref")
    ref = value if value.startswith("refs/") else f"refs/heads/{value}"
    _validate_ref(ref)
    return ref


def _normalize_claimed_ref(value: str) -> str:
    if not isinstance(value, str) or not value.startswith("refs/heads/"):
        raise ValueError("claimed ref must be a full branch ref")
    _validate_ref(value)
    return value


def _validate_ref(ref: str) -> None:
    if (
        not ref
        or _INVALID_REF_CHARS.search(ref)
        or ".." in ref
        or "@{" in ref
        or "//" in ref
        or ref.endswith("/")
        or ref.endswith(".")
        or ref.endswith(".lock")
        or ref.startswith("/")
    ):
        raise ValueError("invalid Git ref")


def _normalize_relative_path(value: str) -> str:
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        raise ValueError("invalid relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise ValueError("path escapes repository")
    return path.as_posix()


def _is_safe_relative_path(value: str) -> bool:
    try:
        _normalize_relative_path(value)
        return True
    except ValueError:
        return False


def _path_in_scope(path: str, declared: str) -> bool:
    return path == declared or path.startswith(declared.rstrip("/") + "/")


def _is_missing_revision(diagnostics: str) -> bool:
    return any(
        marker in diagnostics
        for marker in (
            "needed a single revision",
            "unknown revision",
            "ambiguous argument",
            "bad revision",
            "not a valid object name",
        )
    )


def _parse_changed_paths(output: str) -> tuple[str, ...]:
    paths: set[str] = set()
    for line in output.splitlines():
        if not line:
            continue
        fields = line.split("\t")
        # Name-status has one path for ordinary changes and two for renames or
        # copies. Preserve both endpoints so a rename cannot hide an old path.
        for path in fields[1:]:
            if path:
                paths.add(path)
    return tuple(sorted(paths))


__all__ = [
    "GitRunner",
    "SubprocessGitRunner",
    "GitVerificationAdapter",
    "GitVerificationEvidence",
    "GitVerificationRequest",
]
