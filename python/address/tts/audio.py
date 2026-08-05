"""audio.py — Audio playback sink.

Plays synthesized audio files to the system speaker.
Supports multiple backends: pulseaudio, ALSA, macOS afplay, Windows winsound.

Architecture:
    .wav file → AudioPlayer → system speaker
"""

from __future__ import annotations

import atexit
import platform
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any


_REAPER_WORKERS = 4
_REAPER_WAIT_TIMEOUT = 60.0
_REAPER_SHUTDOWN_TIMEOUT = 5.0
_REAPER_STOP = object()
_reaper_queue: queue.Queue[object] = queue.Queue()
_reaper_threads: list[threading.Thread] = []
_reaper_lock = threading.Lock()
_reaper_stopping = False


def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [tts.audio] {msg % args}", file=sys.stderr, flush=True)


def _wait_for_process(process: Any) -> None:
    """Reap a child, escalating if an audio backend hangs."""
    try:
        process.wait(timeout=_REAPER_WAIT_TIMEOUT)
        return
    except subprocess.TimeoutExpired:
        _log("Audio process exceeded %.0fs; terminating", _REAPER_WAIT_TIMEOUT)
    except Exception as exc:
        _log("Audio process wait error: %s", exc)
        return

    try:
        process.terminate()
    except Exception as exc:
        _log("Audio process terminate error: %s", exc)

    try:
        process.wait(timeout=5.0)
        return
    except subprocess.TimeoutExpired:
        _log("Audio process did not terminate; killing")
    except Exception as exc:
        _log("Audio process reap error: %s", exc)
        return

    try:
        process.kill()
    except Exception as exc:
        _log("Audio process kill error: %s", exc)

    try:
        # After kill(), wait without another timeout so the child is definitely
        # reaped rather than leaving a zombie behind on a timeout edge.
        process.wait()
    except Exception as exc:
        _log("Audio process final reap error: %s", exc)


def _reap_processes() -> None:
    """Wait for queued playback processes so children cannot become zombies."""
    while True:
        item = _reaper_queue.get()
        try:
            if item is _REAPER_STOP:
                return
            _wait_for_process(item)
        finally:
            _reaper_queue.task_done()


def _ensure_reaper() -> None:
    """Start bounded daemon reaper workers lazily on the first playback."""
    with _reaper_lock:
        if _reaper_threads:
            return
        for index in range(_REAPER_WORKERS):
            thread = threading.Thread(
                target=_reap_processes,
                name=f"tts-audio-reaper-{index + 1}",
                daemon=True,
            )
            _reaper_threads.append(thread)
            thread.start()


def _track_process(process: subprocess.Popen[bytes]) -> None:
    """Retain a playback handle until the reaper has waited for it.

    A fixed pool of reaper workers bounds concurrent process waits. The normal
    path remains asynchronous, and the process handle stays in the queue until
    one worker has reaped it.
    """
    global _reaper_stopping
    _ensure_reaper()
    with _reaper_lock:
        reap_synchronously = _reaper_stopping
        if not reap_synchronously:
            _reaper_queue.put(process)

    if reap_synchronously:
        # This only occurs during interpreter shutdown. Keep the lock-free
        # while waiting so concurrent teardown cannot deadlock on _reaper_lock.
        _wait_for_process(process)


def _shutdown_reaper() -> None:
    """Bounded drain and stop for the reaper during orderly shutdown."""
    global _reaper_stopping
    with _reaper_lock:
        if not _reaper_threads or _reaper_stopping:
            return
        _reaper_stopping = True
        threads = list(_reaper_threads)

    deadline = time.monotonic() + _REAPER_SHUTDOWN_TIMEOUT
    while _reaper_queue.unfinished_tasks and time.monotonic() < deadline:
        time.sleep(0.01)

    if _reaper_queue.unfinished_tasks:
        _log("Audio reaper shutdown timed out with queued work remaining")
        return

    for _ in threads:
        _reaper_queue.put(_REAPER_STOP)
    for thread in threads:
        thread.join(timeout=1)


atexit.register(_shutdown_reaper)


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
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _track_process(process)
        _log("Playing: %s", Path(cmd[-1]).name)
        return True
    except FileNotFoundError:
        return False
    except Exception:
        return False
