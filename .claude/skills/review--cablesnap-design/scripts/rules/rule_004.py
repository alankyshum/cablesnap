#!/usr/bin/env python3
"""RULE-004: Inline Shadow Styles.

Flags manual shadowOffset/shadowRadius/shadowOpacity/elevation usage.
Use elevation tokens from design-tokens.ts instead.
"""

import re

from .base import BaseRule, Finding

SHADOW_PROP_RE = re.compile(
    r"\b(shadowOffset|shadowRadius|shadowOpacity|shadowColor)\s*:"
)

ELEVATION_LITERAL_RE = re.compile(
    r"\belevation\s*:\s*(\d+)\b"
)

EXEMPT_SUFFIXES = (
    "constants/design-tokens.ts",
)


class Rule(BaseRule):
    RULE_ID = "RULE-004"
    NAME = "Inline Shadow Styles"
    SEVERITY = "medium"
    FILE_TYPES = ("screen", "component")

    def check(self, file_path, content, lines):
        if any(file_path.endswith(s) for s in EXEMPT_SUFFIXES):
            return []

        if "design-tokens" in content and "elevation" in content:
            return []

        findings = []
        for line_num, line in enumerate(lines, start=1):
            if line.strip().startswith("//") or line.strip().startswith("*"):
                continue

            m = SHADOW_PROP_RE.search(line)
            if m:
                findings.append(Finding(
                    line=line_num,
                    column=m.start() + 1,
                    context=line.strip()[:120],
                    issue=f"Manual shadow property `{m.group(1)}`.",
                    suggestion=(
                        "Import { elevation } from 'constants/design-tokens' "
                        "and spread a token: ...elevation.low, ...elevation.medium, "
                        "or ...elevation.high."
                    ),
                ))

            m2 = ELEVATION_LITERAL_RE.search(line)
            if m2 and int(m2.group(1)) > 0:
                findings.append(Finding(
                    line=line_num,
                    column=m2.start() + 1,
                    context=line.strip()[:120],
                    issue=f"Hardcoded `elevation: {m2.group(1)}`.",
                    suggestion=(
                        "Import { elevation } from 'constants/design-tokens' "
                        "and use a token: elevation.low, elevation.medium, "
                        "elevation.high."
                    ),
                ))
        return findings
