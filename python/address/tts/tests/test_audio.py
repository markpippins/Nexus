from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import pytest

from address.tts import audio


class FakeProcess:
    def __init__(self) -> None:
        self.wait_called = threading.Event()

    def wait(self, **_: Any) -> int:
        self.wait_called.set()
        return 0


def _audio_file(tmp_path: Path) -> str:
    path = tmp_path / "sample.wav"
    path.write_bytes(b"RIFF-mock-audio")
    return str(path)


def wait_for_reaper() -> None:
    # Queue.join() waits until the reaper has called wait() and task_done().
    audio._reaper_queue.join()


@pytest.fixture(autouse=True)
def drain_reaper_queue() -> Any:
    yield
    wait_for_reaper()


def test_try_playback_reaps_process(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    process = FakeProcess()
    calls: list[list[str]] = []

    def fake_popen(cmd: list[str], **_: Any) -> FakeProcess:
        calls.append(cmd)
        return process

    monkeypatch.setattr(audio.subprocess, "Popen", fake_popen)

    assert audio._try_playback(["paplay", _audio_file(tmp_path)]) is True
    wait_for_reaper()

    assert calls == [["paplay", str(tmp_path / "sample.wav")]]
    assert process.wait_called.is_set()


def test_linux_playback_falls_back_when_backend_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    process = FakeProcess()
    calls: list[list[str]] = []

    def fake_popen(cmd: list[str], **_: Any) -> FakeProcess:
        calls.append(cmd)
        if cmd[0] == "paplay":
            raise FileNotFoundError(cmd[0])
        return process

    monkeypatch.setattr(audio.subprocess, "Popen", fake_popen)

    assert audio._play_linux(_audio_file(tmp_path)) is True
    wait_for_reaper()

    assert [cmd[0] for cmd in calls] == ["paplay", "aplay"]
    assert process.wait_called.is_set()


def test_reaper_handles_repeated_playback(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    processes = [FakeProcess() for _ in range(4)]
    process_iter = iter(processes)

    monkeypatch.setattr(
        audio.subprocess,
        "Popen",
        lambda _cmd, **_kwargs: next(process_iter),
    )

    for _ in processes:
        assert audio._try_playback(["paplay", _audio_file(tmp_path)]) is True

    wait_for_reaper()
    assert all(process.wait_called.is_set() for process in processes)


def test_reaper_terminates_hung_process(monkeypatch: pytest.MonkeyPatch) -> None:
    class HungProcess:
        def __init__(self) -> None:
            self.terminate_called = False
            self.kill_called = False
            self.wait_calls = 0

        def wait(self, timeout: float | None = None) -> int:
            self.wait_calls += 1
            if self.wait_calls <= 2:
                raise audio.subprocess.TimeoutExpired(cmd="paplay", timeout=timeout)
            return 0

        def terminate(self) -> None:
            self.terminate_called = True

        def kill(self) -> None:
            self.kill_called = True

    process = HungProcess()
    monkeypatch.setattr(audio, "_REAPER_WAIT_TIMEOUT", 0.001)
    audio._track_process(process)  # type: ignore[arg-type]
    wait_for_reaper()

    assert process.terminate_called
    assert process.kill_called
    assert process.wait_calls == 3
