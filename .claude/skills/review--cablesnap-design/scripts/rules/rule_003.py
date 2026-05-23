#!/usr/bin/env python3
"""RULE-003: Hardcoded Border Radius.

Flags numeric literals used for borderRadius. Use radii tokens from design-tokens.ts.
"""

import re

from .base import BaseRule, Finding

RADIUS_RE = re.compile(
    r"\b(borderRadius|borderTopLeftRadius|borderTopRightRadius"
    r"|borderBottomLeftRadius|borderBottomRightRadius)"
    r"\s*:\s*(\d+)\b"
)

EXEMPT_SUFFIXES = (
    "constants/design-tokens.ts",
)


class Rule(BaseRule):
    RULE_ID = "RULE-003"
    NAME = "Hardcoded Border Radius"
    SEVERITY = "high"
    FILE_TYPES = ("screen", "component")

    def check(self, file_path, content, lines):
        if any(file_path.endswith(s) for s in EXEMPT_SUFFIXES):
            return []

        findings = []
        for line_num, line in enumerate(lines, start=1):
            if line.strip().startswith("//") or line.strip().startswith("*"):
                continue
            for m in RADIUS_RE.finditer(line):
                prop_name = m.group(1)
                value = int(m.group(2))
                if value == 0:
                    continue
                findings.append(Finding(
                    line=line_num,
                    column=m.start() + 1,
                    context=line.strip()[:120],
                    issue=f"Hardcoded `{prop_name}: {value}`.",
                    suggestion=(
                        "Import { radii } from 'constants/design-tokens' "
                        "and use a token key, e.g. radii.md (8), radii.lg (12), "
                        "radii.pill (9999)."
                    ),
                ))
        return findings
