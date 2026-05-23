#!/usr/bin/env python3
"""RULE-006: Raw Font Size Literals.

Flags hardcoded fontSize values. Use Paper's Text variant prop or
typography tokens from design-tokens.ts for hero/stat numbers.
"""

import re

from .base import BaseRule, Finding

FONT_SIZE_RE = re.compile(r"\bfontSize\s*:\s*(\d+)\b")

EXEMPT_SUFFIXES = (
    "constants/design-tokens.ts",
)


class Rule(BaseRule):
    RULE_ID = "RULE-006"
    NAME = "Raw Font Size Literals"
    SEVERITY = "medium"
    FILE_TYPES = ("screen", "component")

    def check(self, file_path, content, lines):
        if any(file_path.endswith(s) for s in EXEMPT_SUFFIXES):
            return []

        if "design-tokens" in content and "typography" in content:
            return []

        findings = []
        for line_num, line in enumerate(lines, start=1):
            if line.strip().startswith("//") or line.strip().startswith("*"):
                continue
            m = FONT_SIZE_RE.search(line)
            if m:
                findings.append(Finding(
                    line=line_num,
                    column=m.start() + 1,
                    context=line.strip()[:120],
                    issue=f"Hardcoded `fontSize: {m.group(1)}`.",
                    suggestion=(
                        "Use Paper's <Text variant='bodyMedium'> for standard text, "
                        "or import { typography } from 'constants/design-tokens' "
                        "for hero/stat number styles."
                    ),
                ))
        return findings
