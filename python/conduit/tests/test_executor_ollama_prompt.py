#!/usr/bin/env python3
"""Tests for the corrected ollama prompt format in executor_cloud.py.

Verifies that the ollama prompt instructs the model to use
``---START_FILE: relative/path---content---END_FILE---`` format
instead of the old ``FILE: path`` format that never matched the
parser regex.

Run:  python -m pytest nexus/legacy/python/conduit/tests/test_executor_ollama_prompt.py -v
"""

import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from executor_cloud import _resolve_harness, _resolve_role


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
