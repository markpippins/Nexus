# NOTE: This test was written for the BeautifulSoup-based parsing pipeline.
# The pipeline now uses DocLing. This file is retained for reference but
# requires migration to use DocLingDocument instead of BeautifulSoup.
from pathlib import Path
from parsers.opencode_parser import OpenCodeParser
from models import ConversationMetadata

# TODO: Rewrite using DocLing once the migration comparison test framework
# (test_docling_migration.py) validates equivalence.
print("test_opencode_parser.py: Skipped — pending DocLing migration rewrite.")
