"""Tests for the MEEP CLI entrypoint."""

import sys
import subprocess
from pathlib import Path

MEEP_DIR = Path(__file__).resolve().parent.parent
# Run from grandparent so `python -m meep.cli` can find the meep package
MEEP_PARENT = MEEP_DIR.parent


def test_cli_help() -> None:
    """meep --help prints usage and exits with code 0."""
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli", "--help"],
        capture_output=True, text=True,         cwd=MEEP_PARENT,
    )
    assert result.returncode == 0
    assert "MEEP" in result.stdout


def test_cli_version() -> None:
    """meep --version prints version and exits with code 0."""
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli", "--version"],
        capture_output=True, text=True,         cwd=MEEP_PARENT,
    )
    assert result.returncode == 0
    assert "v0.1.0" in result.stdout


def test_cli_accepts_prompt_arg() -> None:
    """meep 'hello world' accepts prompt text and produces CER JSON."""
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli", "hello", "world"],
        capture_output=True, text=True, cwd=MEEP_PARENT,
    )
    assert result.returncode == 0
    assert result.stdout.strip().startswith("["), "Output should be JSON array"


def test_cli_reads_stdin() -> None:
    """echo 'test' | meep reads prompt from stdin and produces CER JSON."""
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli"],
        input="test prompt from stdin",
        capture_output=True, text=True, cwd=MEEP_PARENT,
    )
    assert result.returncode == 0
    assert result.stdout.strip().startswith("["), "Output should be JSON array"


def test_cli_empty_prompt_returns_error() -> None:
    """No prompt and no stdin → error exit."""
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli"],
        capture_output=True, text=True,         cwd=MEEP_PARENT,
    )
    assert result.returncode == 1
    assert "No prompt provided" in result.stderr


def test_cli_supports_output_flag() -> None:
    """--output flag writes CER log to file."""
    tmp = "/tmp/meep-test-cli-output-flag.json"
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli", "test", "--output", tmp],
        capture_output=True, text=True, cwd=MEEP_PARENT,
    )
    assert result.returncode == 0
    assert "CER log written to" in result.stderr
    assert Path(tmp).stat().st_size > 0
