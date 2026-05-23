#!/usr/bin/env python3
"""RULE-005: Missing Design Token Import.

Flags files that use numeric spacing/radii values but don't import from
constants/design-tokens. Heuristic: if StyleSheet.create is present and
spacing-like numeric values are used, the file should import design-tokens.
"""

import re

from .base import BaseRule, Finding

STYLESHEET_RE = re.compile(r"StyleSheet\.create")
IMPORT_TOKENS_RE = re.compile(r"from\s+['\"].*design-tokens['\"]")

SPACING_USAGE_RE = re.compile(
    r"\b(padding|margin|gap|borderRadius)\w*\s*:\s*[1-9]\d*\b"
)

EXEMPT_SUFFIXES = (
    "constants/design-tokens.ts",
    "constants/theme.ts",
    "components/muscle-paths.ts",
)


class Rule(BaseRule):
    RULE_ID = "RULE-005"
    NAME = "Missing Design Token Import"
    SEVERITY = "high"
    FILE_TYPES = ("screen", "component")

    def check(self, file_path, content, lines):
        if any(file_path.endswith(s) for s in EXEMPT_SUFFIXES):
            return []

        if not STYLESHEET_RE.search(content):
            return []

        if IMPORT_TOKENS_RE.search(content):
            return []

        spacing_lines = []
        for line_num, line in enumerate(lines, start=1):
            if SPACING_USAGE_RE.search(line):
                spacing_lines.append(line_num)

        if not spacing_lines:
            return []

        return [Finding(
            line=spacing_lines[0],
            column=1,
            context=f"Found {len(spacing_lines)} hardcoded spacing/radii values",
            issue=(
                "This file uses StyleSheet.create with hardcoded numeric "
                "spacing/radii values but does not import from design-tokens."
            ),
            suggestion=(
                "Add: import { spacing, radii } from 'constants/design-tokens'; "
                "then replace numeric values with token references."
            ),
        )]
