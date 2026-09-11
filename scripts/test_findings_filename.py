#!/usr/bin/env python3
"""Tests for findings_filename.py. Run: python3 scripts/test_findings_filename.py"""

from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from findings_filename import next_path, slugify


class SlugTests(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(
            slugify("Should we migrate the monolith?"),
            "should-we-migrate-th",
        )

    def test_strips_punctuation(self):
        self.assertEqual(slugify("Hello, world!"), "hello-world")

    def test_empty_becomes_findings(self):
        self.assertEqual(slugify("???"), "findings")

    def test_max_20(self):
        slug = slugify("abcdefghijklmnopqrstuvwxyz")
        self.assertEqual(len(slug), 20)
        self.assertFalse(slug.endswith("-"))


class PathTests(unittest.TestCase):
    def test_first_file_is_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = next_path("hello world", Path(tmp), day=date(2026, 9, 11))
            self.assertEqual(path.name, "20260911 - hello-world-1.md")

    def test_sequence_increments(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            first = next_path("migrate", d, day=date(2026, 9, 11))
            first.write_text("one")
            second = next_path("migrate", d, day=date(2026, 9, 11))
            self.assertEqual(second.name, "20260911 - migrate-2.md")


if __name__ == "__main__":
    raise SystemExit(unittest.main())
