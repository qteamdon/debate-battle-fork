#!/usr/bin/env python3
"""Print a path for the saved briefing.

Name shape: YYYYMMDD - {slug}-{n}.md
slug is the query, lowercase, letters and digits only, max 20 characters.
n is 1, then 2, then 3, for files that already exist that day.

Stdlib only. Prints the path to stdout.
"""

from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path

DEFAULT_DIR = Path("debate-workspace") / "findings"
SLUG_LEN = 20


def slugify(text: str, max_len: int = SLUG_LEN) -> str:
    lowered = text.lower()
    pieces = re.findall(r"[a-z0-9]+", lowered)
    slug = "-".join(pieces)
    slug = slug[:max_len].rstrip("-")
    return slug or "findings"


def next_path(
    topic: str,
    directory: Path = DEFAULT_DIR,
    day: date | None = None,
) -> Path:
    day = day or date.today()
    stamp = day.strftime("%Y%m%d")
    slug = slugify(topic)
    directory.mkdir(parents=True, exist_ok=True)
    n = 1
    while True:
        path = directory / f"{stamp} - {slug}-{n}.md"
        if not path.exists():
            return path
        n += 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", required=True, help="The query or position")
    parser.add_argument(
        "--dir",
        default=str(DEFAULT_DIR),
        help="Directory to write into (default: debate-workspace/findings)",
    )
    args = parser.parse_args()
    path = next_path(args.topic, Path(args.dir))
    print(path.as_posix())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
