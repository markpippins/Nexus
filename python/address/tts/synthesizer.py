"""synthesizer.py — Piper TTS engine wrapper.

Handles voice model loading, text-to-speech synthesis, and audio file
output. Uses Piper's Python API with a subprocess fallback.

Voice models are downloaded on first use to ~/.local/share/piper-tts/.
Audio output is written to the project's audio cache directory.

Architecture:
    text → PiperVoice.synthesize() → .wav file → audio cache dir
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import threading
import wave
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


# ── Configuration ───────────────────────────────────────────────────

# Default voice model (en_US, female, medium quality, 60MB)
# Piper provides many voices: https://github.com/rhasspy/piper#voices
DEFAULT_VOICE = "en_US-lessac-medium"
DEFAULT_MODEL_DIR = Path.home() / ".local" / "share" / "piper-tts"

# Where synthesized audio files are stored
# Relative to the project root (nexus/)
AUDIO_CACHE_DIR = Path(__file__).resolve().parents[3] / ".tts-audio"

# Sampling rate for Piper output (informational; actual rate comes
# from the loaded voice config)
SAMPLE_RATE = 22050

# ── In-process voice cache ─────────────────────────────────────────
# PiperVoice is expensive to load (~20-30s cold). Cache one instance per
# voice name so repeated synthesis is fast. Each entry is (voice, lock);
# the lock serializes synthesis because espeak-ng phonemization inside
# PiperVoice.synthesize() is not thread-safe.
_VOICE_CACHE: dict[str, tuple[Any, threading.Lock]] = {}
_VOICE_CACHE_GUARD = threading.Lock()


@dataclass
class SynthesisResult:
    """Result of a TTS synthesis operation."""

    audio_path: str
    text: str
    engine: str = "piper"
    voice: str = DEFAULT_VOICE
    duration_ms: int = 0
    synthesized_at: str = ""


def _ensure_voice_model(voice: str = DEFAULT_VOICE) -> tuple[str, str]:
    """Ensure the voice model is downloaded. Returns (model_path, config_path).

    Piper voices are .onnx files + .json configs. On first use, we
    download them from the Piper voice repository.
    """
    model_dir = DEFAULT_MODEL_DIR / voice
    model_path = model_dir / f"{voice}.onnx"
    config_path = model_dir / f"{voice}.onnx.json"

    if model_path.exists() and config_path.exists():
        return str(model_path), str(config_path)

    # Download the voice model
    model_dir.mkdir(parents=True, exist_ok=True)
    _log(f"Downloading voice model: {voice}...")

    base_url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main"
    model_url = f"{base_url}/en/en_US/{voice}/high/{voice}.onnx"
    config_url = f"{base_url}/en/en_US/{voice}/high/{voice}.onnx.json"

    try:
        import urllib.request
        urllib.request.urlretrieve(model_url, str(model_path))
        urllib.request.urlretrieve(config_url, str(config_path))
        _log(f"Voice model downloaded: {voice}")
    except Exception as e:
        # If download fails, try to use any available model
        _log(f"Download failed ({e}), looking for any available model...")
        for candidate in DEFAULT_MODEL_DIR.glob("**/*.onnx"):
            voice_dir = candidate.parent
            cfg = voice_dir / f"{candidate.stem}.onnx.json"
            if cfg.exists():
                _log(f"Using available model: {candidate.stem}")
                return str(candidate), str(cfg)
        raise RuntimeError(
            f"Could not download or find any Piper voice model. "
            f"Download manually from https://huggingface.co/rhasspy/piper-voices"
        ) from e

    return str(model_path), str(config_path)


def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [tts.synth] {msg % args}", file=sys.stderr, flush=True)


def synthesize(text: str, *, voice: str = DEFAULT_VOICE) -> SynthesisResult:
    """Synthesize text to speech and return the audio file path.

    Uses Piper's in-process Python API (primary — fast, voice cached in
    memory) with the piper CLI subprocess as a fallback.

    Args:
        text: The text to synthesize.
        voice: Voice model name (default: en_US-lessac-medium).

    Returns:
        SynthesisResult with audio file path and metadata.
    """
    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Sanitize text for filename
    text_hash = hashlib.sha256(text.encode()).hexdigest()[:12]
    output_path = AUDIO_CACHE_DIR / f"tts_{text_hash}.wav"

    # Skip synthesis if file already exists AND has actual audio data
    if output_path.exists() and output_path.stat().st_size > 100:
        _log("Cache hit: %s (%d bytes)", output_path.name, output_path.stat().st_size)
        return SynthesisResult(
            audio_path=str(output_path),
            text=text,
            engine="piper",
            voice=voice,
            duration_ms=0,
            synthesized_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )

    # Remove any stale zero-byte file from a failed synthesis
    if output_path.exists():
        output_path.unlink()

    start_time = time.time()

    # ── Use Piper Python API (primary — in-process, cached voice) ──
    try:
        _synthesize_python(text, str(output_path), voice)
    except Exception as e:
        _log(f"Python API failed ({e}), trying piper CLI subprocess...")
        _synthesize_subprocess(text, str(output_path), voice)

    # ── Validation guard ──
    # Never return (or later play) silent/empty audio. The Python API
    # fallback has been observed writing header-only 44-byte wavs
    # (2026-08-09), so a real-audio check is mandatory before returning.
    if not output_path.exists() or output_path.stat().st_size < 1000:
        size = output_path.stat().st_size if output_path.exists() else 0
        raise RuntimeError(
            f"Synthesis produced no audio ({size} bytes) — both piper "
            f"paths failed. Check the piper install/voice model."
        )

    duration_ms = int((time.time() - start_time) * 1000)

    return SynthesisResult(
        audio_path=str(output_path),
        text=text,
        engine="piper",
        voice=voice,
        duration_ms=duration_ms,
        synthesized_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )


def _get_voice(voice: str) -> tuple[Any, threading.Lock]:
    """Return a cached (PiperVoice, lock) for the given voice name.

    Loads the model once per voice and reuses it across calls. The lock
    serializes synthesis on the shared instance (espeak-ng phonemization
    is not thread-safe).
    """
    with _VOICE_CACHE_GUARD:
        entry = _VOICE_CACHE.get(voice)
        if entry is None:
            from piper import PiperVoice

            model_path, config_path = _ensure_voice_model(voice)
            entry = (
                PiperVoice.load(model_path, config_path=config_path),
                threading.Lock(),
            )
            _VOICE_CACHE[voice] = entry
        return entry


def _synthesize_python(text: str, output_path: str, voice: str) -> None:
    """Use Piper's Python API for synthesis.

    piper >= 1.3 changed PiperVoice.synthesize() to return an
    Iterable[AudioChunk] — it no longer accepts a wave file object.
    (Passing one silently discards the audio, producing header-only
    44-byte wavs.) We consume the chunk iterable and write each chunk's
    int16 bytes, mirroring piper's own CLI. The voice is cached in
    process so repeated calls skip the ~20-30s model load.
    """
    voice_obj, voice_lock = _get_voice(voice)
    sample_rate = voice_obj.config.sample_rate
    _log(f"Voice loaded: {voice} @ {sample_rate}Hz")

    # 200ms of silence between sentences (matches piper CLI default)
    silence_int16_bytes = bytes(int(sample_rate * 0.2 * 2))

    with voice_lock:
        with wave.open(output_path, "wb") as wav_file:
            wav_params_set = False
            for i, chunk in enumerate(voice_obj.synthesize(text)):
                if not wav_params_set:
                    wav_file.setframerate(chunk.sample_rate)
                    wav_file.setsampwidth(chunk.sample_width)
                    wav_file.setnchannels(chunk.sample_channels)
                    wav_params_set = True
                if i > 0:
                    wav_file.writeframes(silence_int16_bytes)
                wav_file.writeframes(chunk.audio_int16_bytes)

    _log(f"Synthesized {len(text)} chars → {output_path}")


def _synthesize_subprocess(text: str, output_path: str, voice: str) -> None:
    """Use Piper's CLI via subprocess (python -m piper).

    The piper-tts pip package doesn't always install a 'piper' binary
    on PATH. We invoke it via sys.executable -m piper which works
    in virtualenvs and any pip install.
    """
    model_path, config_path = _ensure_voice_model(voice)

    cmd = [
        sys.executable, "-m", "piper",
        "--model", model_path,
        "--config", config_path,
        "--output_file", output_path,
    ]

    result = subprocess.run(
        cmd,
        input=text,
        capture_output=True,
        text=True,
        # 30s was too tight: cold model load (~25s) + long-text synthesis
        # exceeded it, causing a false timeout and a ~30s stall before the
        # fallback. 120s gives the CLI ample headroom (observed: ~27s cold
        # short, ~13s warm long).
        timeout=120,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Piper CLI failed (exit {result.returncode}): {result.stderr}"
        )

    _log(f"Synthesized {len(text)} chars → {output_path}")
