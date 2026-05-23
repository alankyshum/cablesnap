#!/usr/bin/env python3
"""RULE-002: Hardcoded Spacing Values.

Flags numeric literals used for padding, margin, gap, top, bottom, left, right
inside StyleSheet or style objects. Use spacing tokens from design-tokens.ts.
"""

import re

from .base import BaseRule, Finding

SPACING_PROP_RE = re.compile(
    r"\b(padding|paddingHorizontal|paddingVertical|paddingTop|paddingBottom"
    r"|paddingLeft|paddingRight|paddingStart|paddingEnd"
    r"|margin|marginHorizontal|marginVertical|marginTop|marginBottom"
    r"|marginLeft|marginRight|marginStart|marginEnd"
    r"|gap|rowGap|columnGap|top|bottom|left|right)"
    r"\s*:\s*(\d+)\b"
)

EXEMPT_SUFFIXES = (
    "constants/design-tokens.ts",
    "constants/theme.ts",
)


class Rule(BaseRule):
    RULE_ID = "RULE-002"
    NAME = "Hardcoded Spacing Values"
    SEVERITY = "high"
    FILE_TYPES = ("screen", "component")

    def check(self, file_path, content, lines):
        if any(file_path.endswith(s) for s in EXEMPT_SUFFIXES):
            return []

        findings = []
        for line_num, line in enumerate(lines, start=1):
            if line.strip().startswith("//") or line.strip().startswith("*"):
                continue
            for m in SPACING_PROP_RE.finditer(line):
                prop_name = m.group(1)
                value = int(m.group(2))
                if value == 0:
                    continue
                findings.append(Finding(
                    line=line_num,
                    column=m.start() + 1,
                    context=line.strip()[:120],
                    issue=f"Hardcoded spacing `{prop_name}: {value}`.",
                    suggestion=(
                        "Import { spacing } from 'constants/design-tokens' "
                        "and use a token key, e.g. spacing.base (16), "
                        "spacing.sm (8), spacing.md (12)."
                    ),
                ))
        return findings
