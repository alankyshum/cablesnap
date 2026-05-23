#!/usr/bin/env python3
"""RULE-007: Untokenized Color Property.

Flags color/backgroundColor/borderColor/tintColor set to a string literal
(hex or named color) rather than theme.colors.* via useTheme().
"""

import re

from .base import BaseRule, Finding

COLOR_PROP_LITERAL_RE = re.compile(
    r"""\b(color|backgroundColor|borderColor|tintColor|borderTopColor"""
    r"""|borderBottomColor|borderLeftColor|borderRightColor)"""
    r"""\s*:\s*(['"])([^'"]+)\2"""
)

HEX_RE = re.compile(r"^#[0-9A-Fa-f]{3,8}$")

NAMED_COLORS = {
    "red", "blue", "green", "black", "white", "gray", "grey",
    "orange", "yellow", "purple", "pink", "cyan", "transparent",
    "brown", "magenta", "lime", "teal", "navy", "aqua", "silver",
}

EXEMPT_SUFFIXES = (
    "constants/theme.ts",
    "constants/design-tokens.ts",
    "components/muscle-paths.ts",
)


class Rule(BaseRule):
    RULE_ID = "RULE-007"
    NAME = "Untokenized Color Property"
    SEVERITY = "critical"
    FILE_TYPES = ("screen", "component", "lib")

    def check(self, file_path, content, lines):
        if any(file_path.endswith(s) for s in EXEMPT_SUFFIXES):
            return []

        findings = []
        for line_num, line in enumerate(lines, start=1):
            if line.strip().startswith("//") or line.strip().startswith("*"):
                continue
            for m in COLOR_PROP_LITERAL_RE.finditer(line):
                prop_name = m.group(1)
                color_value = m.group(3)

                if color_value == "transparent":
                    continue

                is_hex = bool(HEX_RE.match(color_value))
                is_named = color_value.lower() in NAMED_COLORS

                if is_hex or is_named:
                    findings.append(Finding(
                        line=line_num,
                        column=m.start() + 1,
                        context=line.strip()[:120],
                        issue=(
                            f"`{prop_name}` set to literal '{color_value}'."
                        ),
                        suggestion=(
                            "Use theme.colors.* via useTheme() hook. "
                            "Example: { color: theme.colors.onSurface }. "
                            "For domain colors, import from constants/theme.ts."
                        ),
                    ))
        return findings
