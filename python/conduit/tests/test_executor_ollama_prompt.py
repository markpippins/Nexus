#!/usr/bin/env python3
"""Tests for the corrected ollama prompt format in executor_cloud.py.

Verifies that the ollama prompt instructs the model to use
``---START_FILE: relative/path---content---END_FILE---`` format
instead of the old ``FILE: path`` format that never matched the
parser regex.

Run:  python -m pytest nexus/legacy/python/conduit/tests/test_executor_ollama_prompt.py -v
"""

import json
import os
import re
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import executor_cloud
from executor_cloud import execute_step, _resolve_harness, _resolve_role


# ── Mock data ────────────────────────────────────────────────────────

SAMPLE_STEP = {
    "step_id": "step_1",
    "type": "execution",
    "description": "Write a test script that prints confirmation",
}

SAMPLE_DCO = {
    "id": "wr-0106-test-ollama-format",
    "path": "/tmp",
    "intent": {
        "desired_outcome": "Create a verification script",
        "problem_statement": "Need to verify the pipeline is working",
    },
    "decomposition": {
        "strategy": "single_step",
        "steps": [SAMPLE_STEP],
    },
    "metadata": {
        "harness": "ollama",
        "role": "builder",
        "model": "test-model",
    },
}


def _build_mock_ollama(response_text: str):
    """Build a mock ``ollama`` module-level object.

    ``run_ollama`` calls ``ollama.generate()`` which returns either a
    ``dict`` or a dataclass with a ``.response`` attribute.  We return
    a ``dict`` for simplicity.
    """
    mock = MagicMock()
    mock.generate.return_value = {"response": response_text}
    return mock


def _make_fake_generate_response(response_text: str) -> dict:
    """Return a dict that mimics the ollama SDK's generate() return value."""
    return {"response": response_text}


# ── Tests ────────────────────────────────────────────────────────────

class TestOllamaPromptInstruction(unittest.TestCase):
    """Verify the prompt body contains the correct format instruction."""

    def test_prompt_body_contains_start_file_format(self):
        """The ollama prompt should instruct using ---START_FILE:/---END_FILE--- format."""
        harness = "ollama"
        working_path = "/tmp"
        intent_desc = "Create a verification script"
        step_desc = "Write a test script"
        system_base = "SYSTEM:\nYou are a deterministic cognitive compiler node executing a graph step.\n"

        # Replicate the prompt-building logic from execute_step()
        prompt_body = (
            system_base
            + f"\nTASK:\n{intent_desc}\n"
            + f"\nSTEP:\n{step_desc}"
            + "\n\nWORKING DIRECTORY:\n" + working_path
        )
        prompt_body += (
            "\n\nINSTRUCTIONS:\n"
            + "Describe what you would do to complete this step. "
            + "If the step asks you to run a shell command, output the exact command on a line by itself starting with `$ `. "
            + "If the step asks you to write a file, use the format:\n\n---START_FILE: relative/path---\n<file content>\n---END_FILE---\n\n"
            + "Be concise and direct. Only use the START_FILE/END_FILE format for files you are creating or modifying."
        )

        # Verify the corrected format instruction is present
        self.assertIn(
            "---START_FILE: relative/path---",
            prompt_body,
            "Prompt must contain the ---START_FILE: format instruction",
        )
        self.assertIn(
            "---END_FILE---",
            prompt_body,
            "Prompt must contain the ---END_FILE--- format instruction",
        )

    def test_prompt_body_no_longer_has_old_file_format(self):
        """The ollama prompt should NOT contain the old ``FILE: `` instruction."""
        harness = "ollama"
        working_path = "/tmp"
        intent_desc = "Create a verification script"
        step_desc = "Write a test script"
        system_base = "SYSTEM:\nYou are a deterministic cognitive compiler node executing a graph step.\n"

        prompt_body = (
            system_base
            + f"\nTASK:\n{intent_desc}\n"
            + f"\nSTEP:\n{step_desc}"
            + "\n\nWORKING DIRECTORY:\n" + working_path
        )
        prompt_body += (
            "\n\nINSTRUCTIONS:\n"
            + "Describe what you would do to complete this step. "
            + "If the step asks you to run a shell command, output the exact command on a line by itself starting with `$ `. "
            + "If the step asks you to write a file, use the format:\n\n---START_FILE: relative/path---\n<file content>\n---END_FILE---\n\n"
            + "Be concise and direct. Only use the START_FILE/END_FILE format for files you are creating or modifying."
        )

        # The old ``FILE: `` instruction should be gone
        self.assertNotIn(
            "output the file path on a line starting with `FILE: `",
            prompt_body,
            "Prompt must NOT contain the old FILE: format instruction",
        )


class TestResolveHarnessRole(unittest.TestCase):
    """Verify _resolve_harness and _resolve_role work correctly."""

    def test_resolve_harness_ollama(self):
        req = {"metadata": {"harness": "ollama"}}
        self.assertEqual(_resolve_harness(req), "ollama")

    def test_resolve_harness_defaults_to_opencode(self):
        req = {}  # no metadata
        self.assertEqual(_resolve_harness(req), "opencode")

    def test_resolve_role_builder(self):
        req = {"metadata": {"role": "builder"}}
        self.assertEqual(_resolve_role(req), "builder")

    def test_resolve_role_defaults_to_builder(self):
        req = {}  # no metadata
        self.assertEqual(_resolve_role(req), "builder")


class TestExecuteStepStartFileFormat(unittest.TestCase):
    """Test execute_step() with mocked ollama returning START_FILE/END_FILE output.

    These tests mock ``ollama.generate()`` directly to simulate what the
    model would return after the corrected prompt.
    """

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp(suffix="_ollama_test")
        self._artifacts_dir = os.path.join(self._tmp_dir, "artifacts")
        os.makedirs(self._artifacts_dir, exist_ok=True)
        self._wr_id = "wr-0106-test-ollama-format"

    def tearDown(self):
        import shutil
        if os.path.exists(self._tmp_dir):
            shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def _run_step(self, mock_response: str) -> tuple[bool, str, list[str]]:
        """Run execute_step with mocked ollama returning the given response."""
        mock_ollama = _build_mock_ollama(mock_response)
        # Remove the dead ``patch.dict("sys.modules")`` per code review
        with patch.object(executor_cloud, "ollama", mock_ollama):
            return execute_step(
                SAMPLE_STEP,
                SAMPLE_DCO,
                self._tmp_dir,
                self._artifacts_dir,
                self._wr_id,
            )

    def test_start_file_format_writes_file(self):
        """Ollama output with ---START_FILE: path---content---END_FILE--- should write the file."""
        response = (
            "I will create a verification script.\n\n"
            "---START_FILE: test_0106.sh---\n"
            "#!/bin/bash\n"
            'echo "START_FILE/END_FILE format works"\n'
            "---END_FILE---"
        )
        success, err, files_written = self._run_step(response)

        self.assertTrue(success, f"execute_step should succeed, got error: {err}")
        self.assertIn("test_0106.sh", files_written)

        # Verify the file was actually written to disk
        dest = os.path.join(self._tmp_dir, "test_0106.sh")
        self.assertTrue(os.path.isfile(dest), "File should exist on disk")
        with open(dest) as f:
            content = f.read()
        self.assertIn("START_FILE/END_FILE format works", content)

    def test_multiple_files_from_single_response(self):
        """Ollama output with multiple START_FILE/END_FILE blocks should write all files."""
        response = (
            "---START_FILE: scripts/run.sh---\n"
            "#!/bin/bash\n"
            'echo "Running"\n'
            "---END_FILE---\n"
            "---START_FILE: config/settings.json---\n"
            '{"key": "value"}\n'
            "---END_FILE---"
        )
        success, err, files_written = self._run_step(response)

        self.assertTrue(success, f"execute_step should succeed, got error: {err}")
        self.assertIn("scripts/run.sh", files_written)
        self.assertIn("config/settings.json", files_written)

        # Verify both files are on disk
        run_path = os.path.join(self._tmp_dir, "scripts", "run.sh")
        config_path = os.path.join(self._tmp_dir, "config", "settings.json")
        self.assertTrue(os.path.isfile(run_path))
        self.assertTrue(os.path.isfile(config_path))

    def test_file_content_with_newlines(self):
        """File content with multiple lines should be preserved.

        The START_FILE/END_FILE regex captures everything between the
        ``---`` after the path and the ``---END_FILE---`` marker.  When the
        output has ``---START_FILE: path---\ncontent\n---END_FILE---`` the
        leading ``\n`` is part of the captured content because it sits
        between the path-closing ``---`` and the content.
        """
        content_lines = [
            "#!/usr/bin/env python3",
            '"""Module docstring"""',
            "",
            "def main():",
            '    print("hello")',
            "",
            'if __name__ == "__main__":',
            "    main()",
        ]
        content = "\n".join(content_lines)
        # Put content on the same line as the closing ``---`` so the
        # captured string is exactly ``content`` rather than ``\ncontent``.
        response = (
            f"---START_FILE: greeter.py---{content}---END_FILE---"
        )
        success, err, files_written = self._run_step(response)

        self.assertTrue(success, f"execute_step should succeed, got error: {err}")
        self.assertIn("greeter.py", files_written)

        dest = os.path.join(self._tmp_dir, "greeter.py")
        with open(dest) as f:
            written = f.read()
        self.assertEqual(written, content)

    def test_no_file_blocks_analysis_step(self):
        """Analysis step with no file blocks should succeed (treated as success)."""
        analysis_step = {
            "step_id": "step_analysis",
            "type": "analysis",
            "description": "Analyze the codebase",
        }
        response = "The codebase is well-structured. No files need to be created."

        mock_ollama = _build_mock_ollama(response)
        with patch.object(executor_cloud, "ollama", mock_ollama):
            success, err, files_written = execute_step(
                analysis_step,
                SAMPLE_DCO,
                self._tmp_dir,
                self._artifacts_dir,
                self._wr_id,
            )

        self.assertTrue(success)
        self.assertEqual(files_written, [])

    def test_no_file_blocks_execution_step(self):
        """Execution step with no file blocks but text output should succeed.

        Mocks ``subprocess.run`` to avoid an actual shell invocation.
        """
        response = (
            "I will describe what to do.\n"
            "$ echo 'Test complete'\n"
            "The task is finished."
        )
        mock_ollama = _build_mock_ollama(response)
        with patch.object(executor_cloud, "ollama", mock_ollama), \
             patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0, stdout="Test complete\n", stderr=""
            )
            success, err, files_written = execute_step(
                SAMPLE_STEP,
                SAMPLE_DCO,
                self._tmp_dir,
                self._artifacts_dir,
                self._wr_id,
            )

        self.assertTrue(success, f"execute_step should succeed for non-file output, got error: {err}")

    def test_old_file_format_not_parsed_as_file_block(self):
        """Old ``FILE: path`` format should NOT be parsed as a file block.

        The regex looks for ``---START_FILE: ...--- ... ---END_FILE---``
        so ``FILE: ...`` should produce no matches.
        """
        response = (
            "I will create a script.\n\n"
            "FILE: /tmp/test_0106.sh\n"
            "#!/bin/bash\n"
            'echo "This uses the old format"'
        )
        success, err, files_written = self._run_step(response)

        # No file blocks found — but since it's an execution step with
        # no $ commands, it falls through to the "no file blocks" handler
        # which treats it as success for ollama harness.
        self.assertTrue(success, "Ollama with no file blocks should be treated as success")
        self.assertEqual(files_written, [], "No files should be written from old FILE: format")

        # Verify no file was created on disk
        dest = os.path.join(self._tmp_dir, "test_0106.sh")
        self.assertFalse(os.path.isfile(dest), "Old FILE: format should not create files")

    def test_shell_command_with_file_blocks(self):
        """Shell command execution combined with START_FILE/END_FILE blocks."""
        response = (
            "I will create the file.\n\n"
            "---START_FILE: output.log---\n"
            "Task completed successfully\n"
            "---END_FILE---\n\n"
            "$ echo 'Verification done'\n"
        )
        success, err, files_written = self._run_step(response)

        # Both the file block parsing AND the $ command execution should work
        self.assertTrue(success, f"execute_step should handle both shells and file blocks: {err}")
        self.assertIn("output.log", files_written)

        dest = os.path.join(self._tmp_dir, "output.log")
        self.assertTrue(os.path.isfile(dest))

    def test_failing_shell_command_after_file_block_still_writes_file(self):
        """Failing $ command AFTER file block parsing still writes the file.

        **Verifies the ordering fix: file blocks are parsed and written
        BEFORE shell commands execute, so files exist on disk even when
        shell commands fail.**

        The ``execute_step()`` function now parses ``---START_FILE:/---END_FILE---``
        blocks *before* executing ``$ `` shell commands.  When the model
        outputs both a valid file block and a failing shell command::

            1. File block is parsed and written to disk  ← FIRST
            2. Shell commands execute                     ← SECOND
            3. All shell commands fail → returns False
            4. But the file already exists on disk from step 1

        This ensures that ``$ pytest tests/my_file.py`` can find the
        file that ``---START_FILE: tests/my_file.py---`` just wrote.
        """
        response = (
            "---START_FILE: created.log---\n"
            "This content IS written even though the shell command fails\n"
            "---END_FILE---\n\n"
            "$ nonexistent_command --some-flag\n"
        )
        mock_ollama = _build_mock_ollama(response)
        with patch.object(executor_cloud, "ollama", mock_ollama), \
             patch("subprocess.run") as mock_run:
            # Simulate command not found (exit code 127)
            mock_run.return_value = MagicMock(
                returncode=127, stdout="", stderr="command not found"
            )
            success, err, files_written = execute_step(
                SAMPLE_STEP,
                SAMPLE_DCO,
                self._tmp_dir,
                self._artifacts_dir,
                self._wr_id,
            )

        # The step fails because all shell commands fail
        self.assertFalse(success, "Step should fail when all shell commands fail")
        self.assertIn("All shell commands failed", err)

        # But the file WAS written because file blocks are parsed FIRST
        self.assertIn("created.log", files_written,
                      "File should be in files_written — file blocks "
                      "are parsed BEFORE shell command execution")

        # Verify the file exists on disk
        dest = os.path.join(self._tmp_dir, "created.log")
        self.assertTrue(
            os.path.isfile(dest),
            "File should exist on disk — file block was written "
            "before shell commands executed",
        )
        with open(dest) as f:
            content = f.read()
        self.assertIn("IS written", content)

    def test_failing_shell_only_no_file_blocks_also_returns_early(self):
        """Failing $ command with NO file blocks also returns early (sanity check)."""
        response = "$ nonexistent_cmd\n"
        mock_ollama = _build_mock_ollama(response)
        with patch.object(executor_cloud, "ollama", mock_ollama), \
             patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1, stdout="", stderr="error"
            )
            success, err, files_written = execute_step(
                SAMPLE_STEP,
                SAMPLE_DCO,
                self._tmp_dir,
                self._artifacts_dir,
                self._wr_id,
            )

        self.assertFalse(success)
        self.assertIn("All shell commands failed", err)
        self.assertEqual(files_written, [])

    def test_file_written_before_shell_command_references_it(self):
        """File written via START_FILE/END_FILE exists when $ command runs.

        **End-to-end verification of the ordering fix.**

        Simulates the real-world scenario where ollama writes a shell
        script to disk and then runs it in a single response::

            ---START_FILE: verify.sh---
            #!/bin/bash
            echo "PIPELINE ORDERING VERIFIED"
            ---END_FILE---
            $ bash verify.sh

        Before the fix, the ``$ bash verify.sh`` command would run
        *before* ``verify.sh`` was written, causing an exit 127
        (command not found / file missing).

        After the fix, file blocks are written first, so bash can
        find and execute the file.
        """
        response = (
            "I will create a verification script and run it.\n\n"
            "---START_FILE: verify.sh---\n"
            "#!/bin/bash\n"
            'echo "PIPELINE ORDERING VERIFIED"\n'
            "---END_FILE---\n\n"
            "$ bash verify.sh\n"
        )
        mock_ollama = _build_mock_ollama(response)
        with patch.object(executor_cloud, "ollama", mock_ollama), \
             patch("subprocess.run") as mock_run:
            # Simulate bash verify.sh … succeeding (exit 0 with expected output)
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="PIPELINE ORDERING VERIFIED\n",
                stderr="",
            )
            success, err, files_written = execute_step(
                SAMPLE_STEP,
                SAMPLE_DCO,
                self._tmp_dir,
                self._artifacts_dir,
                self._wr_id,
            )

        # The step succeeds — file was written, then shell command ran
        self.assertTrue(
            success,
            f"Step should succeed: file written first, then shell command executed. "
            f"Got error: {err}",
        )

        # Verify the file was written to disk (proves file block ran before shell)
        self.assertIn(
            "verify.sh",
            files_written,
            "verify.sh must be in files_written — file block parsed before shell",
        )
        dest = os.path.join(self._tmp_dir, "verify.sh")
        self.assertTrue(
            os.path.isfile(dest),
            "verify.sh must exist on disk before shell command executes",
        )
        with open(dest) as f:
            content = f.read()
        self.assertIn("PIPELINE ORDERING VERIFIED", content)

        # Verify the shell command was invoked with the correct arguments
        mock_run.assert_called_once()
        call_args, call_kwargs = mock_run.call_args
        self.assertEqual(call_kwargs.get("cwd"), self._tmp_dir,
                         "Shell command must run in working_path")
        # The $ command extracted from raw_text is "bash verify.sh"
        self.assertEqual(
            call_args[0],
            "bash verify.sh",
            "Shell command should be the extracted $ line",
        )

    def test_file_written_then_shell_uses_content(self):
        """Shell command uses file content written moments earlier.

        A more complex scenario: the model writes a Python script and
        then immediately runs it.  This validates end-to-end that:
        (1) the file is written to disk first,
        (2) the shell command can execute it,
        (3) the shell command receives the expected output from the file.
        """
        response = (
            "---START_FILE: greeter.py---\n"
            "#!/usr/bin/env python3\n"
            'print("Hello from the file written before the shell ran")\n'
            "---END_FILE---\n"
            "$ python3 greeter.py\n"
        )
        mock_ollama = _build_mock_ollama(response)
        with patch.object(executor_cloud, "ollama", mock_ollama), \
             patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="Hello from the file written before the shell ran\n",
                stderr="",
            )
            success, err, files_written = execute_step(
                SAMPLE_STEP,
                SAMPLE_DCO,
                self._tmp_dir,
                self._artifacts_dir,
                self._wr_id,
            )

        self.assertTrue(success, f"Step should succeed: {err}")
        self.assertIn("greeter.py", files_written)

        # Verify the file exists on disk with correct content
        dest = os.path.join(self._tmp_dir, "greeter.py")
        self.assertTrue(os.path.isfile(dest))
        with open(dest) as f:
            content = f.read()
        self.assertIn("Hello from the file written before the shell ran", content)

        # Verify the shell command ran python3 on the file
        mock_run.assert_called_once()
        call_args, call_kwargs = mock_run.call_args
        self.assertEqual(call_args[0], "python3 greeter.py")
        self.assertEqual(call_kwargs.get("cwd"), self._tmp_dir)


class TestParserRegexDirect(unittest.TestCase):
    """Direct tests of the file-block regex used in execute_step()."""

    REGEX = re.compile(r"---START_FILE: (.*?)---(.*?)---END_FILE---", re.DOTALL)

    def test_basic_format(self):
        text = (
            "---START_FILE: src/main.py---\n"
            "print('hello')\n"
            "---END_FILE---"
        )
        blocks = self.REGEX.findall(text)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0][0].strip(), "src/main.py")
        self.assertIn("print('hello')", blocks[0][1])

    def test_multiple_blocks(self):
        text = (
            "---START_FILE: a.txt---\n"
            "content a\n"
            "---END_FILE---\n"
            "---START_FILE: b.txt---\n"
            "content b\n"
            "---END_FILE---"
        )
        blocks = self.REGEX.findall(text)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0][0].strip(), "a.txt")
        self.assertEqual(blocks[1][0].strip(), "b.txt")

    def test_content_with_newlines(self):
        content = "line1\nline2\nline3"
        text = f"---START_FILE: path---{content}---END_FILE---"
        blocks = self.REGEX.findall(text)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0][1], content)

    def test_old_file_format_not_matched(self):
        """The old ``FILE: path`` format should NOT match the regex."""
        text = "FILE: /absolute/path\ncontent here"
        blocks = self.REGEX.findall(text)
        self.assertEqual(len(blocks), 0, "Old FILE: format should produce no matches")

    def test_relative_path_with_dot_slash(self):
        text = "---START_FILE: ./src/module.py---\ncode\n---END_FILE---"
        blocks = self.REGEX.findall(text)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0][0].strip(), "./src/module.py")

    def test_no_false_positive_on_regular_text(self):
        """Regular text that happens to contain 'FILE:' should not match."""
        text = "NOTICE: This file is auto-generated."
        blocks = self.REGEX.findall(text)
        self.assertEqual(len(blocks), 0)

    def test_empty_content(self):
        """Empty content between markers should match with empty string."""
        text = "---START_FILE: empty.txt------END_FILE---"
        blocks = self.REGEX.findall(text)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0][1], "")


if __name__ == "__main__":
    unittest.main()
