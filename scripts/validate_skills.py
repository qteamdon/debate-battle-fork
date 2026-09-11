#!/usr/bin/env python3
"""Check skills/*/SKILL.md frontmatter and a few skill-specific contracts.

Stdlib only. Exit 0 on success, 1 on failure.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = ROOT / "skills"
README = ROOT / "README.md"
FIXTURE = ROOT / "docs" / "fixtures" / "sample-debate-briefing.md"

NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MAX_BRIEFING_WORDS = 600

# Same pattern as ResultsStore._parseRanking. Appendix rankings must match it.
OVERLAY_RANK_RE = re.compile(
    r"^###\s+(\d+)(?:st|nd|rd|th)\s+[—\-–]\s+([A-Za-z0-9_]+)\b",
    flags=re.MULTILINE,
)

# Extra strings each named skill must contain. Keep these stable and small.
SKILL_CONTRACTS: dict[str, tuple[str, ...]] = {
    "debate": (
        "When NOT to use this skill",
        "cross-check",
        "## Appendix — Rankings",
        "Do not paste rankings",
        # Results overlay parses these headers. Do not replace with a table.
        "### 1st — {name}",
        "debate_start_clock",
        "Do **not** spawn a timer",
        "scale = research",
        "per_agent_event_limit = 20",
        "Skip this whole subsection when `scale = research`",
        "Every seat is `sonnet`",
        "write_findings",
        "Saved to:",
    ),
    "lean": (
        "When NOT to use this skill",
        "cross-check",
        "Do not dump the full memo into chat",
        "hosts/opencode.md",
        "write_findings",
    ),
    "cross-check": (
        "00-user-position.md",
        "FRAMING HOLDS",
        "Do not invent a position",
        "Do NOT advocate a different conclusion",
        "hosts/opencode.md",
        "write_findings",
    ),
}

# Shared human-facing briefing. Every skill must present in this order.
BRIEFING_HEADINGS = (
    "## What Survived",
    "## What To Challenge",
    "## Killshot",
    "## Framing",
    "## Residual Disagreement",
    "## Next Steps",
)

README_NEEDLES = (
    "**Purpose.**",
    "**Implementation.**",
    "**How to use.**",
    "## What you get back",
)


def parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        raise ValueError("missing opening ---")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("missing closing ---")
    fields: dict[str, str] = {}
    for raw_line in parts[1].strip().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"frontmatter line has no colon: {raw_line!r}")
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()
    return fields


def heading_order_errors(label: str, text: str) -> list[str]:
    """Headings must appear as full lines, in order. Earlier uses of the
    same title (e.g. an analyst draft's Next Steps) are ignored."""
    cursor = 0
    for heading in BRIEFING_HEADINGS:
        match = re.search(
            r"^" + re.escape(heading) + r"\s*$",
            text[cursor:],
            flags=re.MULTILINE,
        )
        if not match:
            return [f"{label}: missing briefing heading {heading} (in order)"]
        cursor += match.start() + len(heading)
    return []


def check_skill(skill_dir: Path) -> list[str]:
    errors: list[str] = []
    path = skill_dir / "SKILL.md"
    folder = skill_dir.name
    if not path.is_file():
        return [f"{folder}: missing SKILL.md"]

    text = path.read_text(encoding="utf-8")
    prompt_bits = []
    prompts_dir = skill_dir / "prompts"
    if prompts_dir.is_dir():
        for prompt_file in sorted(prompts_dir.glob("*.md")):
            body = prompt_file.read_text(encoding="utf-8")
            if "Task(" in body or "$ARGUMENTS" in body:
                errors.append(
                    f"{folder}/prompts/{prompt_file.name}: host token Task( or $ARGUMENTS"
                )
            prompt_bits.append(body)
    combined = text + "\n" + "\n".join(prompt_bits)
    try:
        fields = parse_frontmatter(text)
    except ValueError as exc:
        return [f"{folder}: {exc}"]

    name = fields.get("name", "")
    description = fields.get("description", "")

    if name != folder:
        errors.append(f"{folder}: name {name!r} does not match folder")
    if not NAME_RE.match(name):
        errors.append(f"{folder}: name {name!r} is not a valid skill name")
    if not 1 <= len(name) <= 64:
        errors.append(f"{folder}: name length {len(name)} is out of 1-64")
    if not 1 <= len(description) <= 1024:
        errors.append(
            f"{folder}: description length {len(description)} is out of 1-1024"
        )

    for needle in SKILL_CONTRACTS.get(folder, ()):
        if needle not in combined:
            errors.append(f"{folder}: missing required text {needle!r}")

    errors.extend(heading_order_errors(folder, combined))
    if folder == "debate" and 'description       = "Debate timer"' in text:
        errors.append(f"{folder}: still spawns a timer Task; use debate_start_clock")
    if folder == "debate" and "skills/debate/prompts/judge.md" not in text:
        errors.append(f"{folder}: SKILL.md does not point at prompts/judge.md")
    host_oc = skill_dir / "hosts" / "opencode.md"
    if host_oc.is_file():
        oc = host_oc.read_text(encoding="utf-8")
        if "Not wired yet" in oc:
            errors.append(f"{folder}: hosts/opencode.md is still a stub")
        if folder == "debate" and "debate-worker" not in oc:
            errors.append(f"{folder}: hosts/opencode.md missing debate-worker")
    return errors


def briefing_body(markdown: str) -> str:
    lines = markdown.splitlines()
    body: list[str] = []
    for line in lines:
        if line.startswith("## Appendix"):
            break
        body.append(line)
    return "\n".join(body)


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def check_fixture() -> list[str]:
    if not FIXTURE.is_file():
        return [f"missing briefing fixture: {FIXTURE}"]
    text = FIXTURE.read_text(encoding="utf-8")
    errors = heading_order_errors("fixture", text)
    if "## Appendix" not in text:
        errors.append("fixture: missing ## Appendix")
    words = word_count(briefing_body(text))
    if words > MAX_BRIEFING_WORDS:
        errors.append(
            f"fixture: briefing is {words} words; max is {MAX_BRIEFING_WORDS}"
        )
    appendix = text.split("## Appendix", 1)[-1]
    if not OVERLAY_RANK_RE.search(appendix):
        errors.append(
            "fixture: appendix has no ### 1st — agent headers; "
            "Results overlay cannot parse rank badges"
        )
    return errors


def check_readme() -> list[str]:
    if not README.is_file():
        return ["missing README.md"]
    text = README.read_text(encoding="utf-8")
    errors: list[str] = []
    for needle in README_NEEDLES:
        if needle not in text:
            errors.append(f"README.md: missing {needle!r}")
    for skill in ("cross-check", "lean", "debate"):
        heading = f"### `{skill}`"
        if heading not in text:
            errors.append(f"README.md: missing {heading}")
    return errors


def main() -> int:
    if not SKILLS_DIR.is_dir():
        print(f"no skills directory at {SKILLS_DIR}", file=sys.stderr)
        return 1

    skill_dirs = sorted(p for p in SKILLS_DIR.iterdir() if p.is_dir())
    if not skill_dirs:
        print("no skill folders found", file=sys.stderr)
        return 1

    errors: list[str] = []
    for skill_dir in skill_dirs:
        errors.extend(check_skill(skill_dir))

    expected = {"debate", "lean", "cross-check"}
    found = {p.name for p in skill_dirs}
    missing = expected - found
    if missing:
        errors.append(f"missing skill folders: {sorted(missing)}")

    errors.extend(check_fixture())
    errors.extend(check_readme())

    if errors:
        print("skill validation failed:")
        for err in errors:
            print(f"  - {err}")
        return 1

    fixture_words = word_count(briefing_body(FIXTURE.read_text(encoding="utf-8")))
    print(f"ok: {len(skill_dirs)} skill(s); fixture briefing {fixture_words} words")
    for skill_dir in skill_dirs:
        print(f"  - {skill_dir.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
