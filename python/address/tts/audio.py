"""audio.py — Audio playback sink.

Plays synthesized audio files to the system speaker.
Supports multiple backends: pulseaudio, ALSA, macOS afplay, Windows winsound.

Architecture:
    .wav file → AudioPlayer → system speaker
"""

from __future__ import annotations

import os
import platform
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [tts.audio] {msg % args}", file=sys.stderr, flush=True)


def play(audio_path: str) -> bool:
    """Play an audio file to the system speaker.

    Returns True if playback started successfully, False otherwise.
    Playback is non-blocking (background process).
    """
    path = Path(audio_path)
    if not path.exists():
        _log("Audio file not found: %s", audio_path)
        return False

    system = platform.system()
    try:
        if system == "Linux":
            return _play_linux(str(path))
        elif system == "Darwin":
            return _play_macos(str(path))
        elif system == "Windows":
            return _play_windows(str(path))
        else:
            _log("Unsupported platform: %s", system)
            return False
    except Exception as e:
        _log("Playback error: %s", e)
        return False


def _play_linux(path: str) -> bool:
    """Try multiple Linux audio backends."""
    # Prefer paplay (PulseAudio) — most common on modern Linux
    for cmd in [
        ["paplay", path],
        ["aplay", path],
        ["pw-play", path],  # PipeWire
        ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", path],
    ]:
        if _try_playback(cmd):
            return True
    _log("No audio backend available. Install pulseaudio or alsa-utils.")
    return False


def _play_macos(path: str) -> bool:
    return _try_playback(["afplay", path])


def _play_windows(path: str) -> bool:
    import winsound
    winsound.PlaySound(path, winsound.SND_ASYNC | winsound.SND_FILENAME)
    return True


def _try_playback(cmd: list[str]) -> bool:
    """Try to start a subprocess for audio playback. Non-blocking."""
    try:
        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _log("Playing: %s", Path(cmd[-1]).name)
        return True
    except FileNotFoundError:
        return False
    except Exception:
        return False
