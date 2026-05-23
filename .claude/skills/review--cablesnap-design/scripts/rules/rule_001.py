#!/usr/bin/env python3
"""RULE-001: Raw Hex Colors.

Flags hex color literals (#RGB, #RRGGBB, #RRGGBBAA) in non-token files.
Colors must come from theme.colors.* via useTheme() or from constants/theme.ts.
"""

import re

from .base import BaseRule, Finding

HEX_COLOR_RE = re.compile(
    r"""(['"])#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\1"""
)

EXEMPT_SUFFIXES = (
    "constants/theme.ts",
    "constants/design-tokens.ts",
    "components/muscle-paths.ts",
)


class Rule(BaseRule):
    RULE_ID = "RULE-001"
    NAME = "Raw Hex Colors"
    SEVERITY = "critical"
    FILE_TYPES = ("screen", "component", "lib", "animation")

    def check(self, file_path, content, lines):
        if any(file_path.endswith(s) for s in EXEMPT_SUFFIXES):
            return []

        findings = []
        for line_num, line in enumerate(lines, start=1):
            if line.strip().startswith("//") or line.strip().startswith("*"):
                continue
            for m in HEX_COLOR_RE.finditer(line):
                findings.append(Finding(
                    line=line_num,
                    column=m.start() + 1,
                    context=line.strip()[:120],
                    issue=f"Raw hex color {m.group()} found.",
                    suggestion=(
                        "Use theme.colors.* via useTheme() or import from "
                        "constants/theme.ts. Never hardcode colors."
                    ),
                ))
        return findings
