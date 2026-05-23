#!/usr/bin/env python3
"""Base class and data structures for review rule plugins.

Valid FILE_TYPES for CableSnap:
    screen, component, lib, animation, constant, config, test, unknown
"""


class Finding:
    """A single issue found by a rule check."""

    __slots__ = ("line", "column", "context", "issue", "suggestion")

    def __init__(self, line, column, context, issue, suggestion=""):
        self.line = line
        self.column = column
        self.context = context
        self.issue = issue
        self.suggestion = suggestion

    def to_dict(self):
        d = {
            "line": self.line,
            "column": self.column,
            "context": self.context,
            "issue": self.issue,
        }
        if self.suggestion:
            d["suggestion"] = self.suggestion
        return d


class BaseRule:
    """Abstract base for all rule plugins.

    Subclasses MUST define:
        RULE_ID   - str, e.g. "RULE-001"
        NAME      - str, human-readable rule name
        SEVERITY  - str, one of "critical", "high", "medium", "low"
        FILE_TYPES - tuple[str], file types this rule applies to

    Subclasses MUST implement:
        check(file_path, content, lines) -> list[Finding]
    """

    RULE_ID = None
    NAME = None
    SEVERITY = None
    FILE_TYPES = ()

    def check(self, file_path, content, lines):
        raise NotImplementedError

    def applies_to(self, file_type):
        return "all" in self.FILE_TYPES or file_type in self.FILE_TYPES

    def to_meta(self):
        return {
            "rule": self.RULE_ID,
            "name": self.NAME,
            "severity": self.SEVERITY,
            "file_types": list(self.FILE_TYPES),
        }
