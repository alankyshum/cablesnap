#!/usr/bin/env python3
"""File classifier for CableSnap React Native / Expo project.

Maps file paths to types used by the deterministic rule engine.
"""

import json
import re
import sys

PATTERNS = [
    ("test", [
        re.compile(r"__tests__/"),
        re.compile(r"\.test\.(ts|tsx)$"),
        re.compile(r"\.spec\.(ts|tsx)$"),
    ]),
    ("constant", [
        re.compile(r"constants/.*\.(ts|tsx)$"),
    ]),
    ("animation", [
        re.compile(r"lib/animations/.*\.(ts|tsx)$"),
    ]),
    ("component", [
        re.compile(r"components/.*\.(tsx|ts)$"),
    ]),
    ("screen", [
        re.compile(r"app/.*\.(tsx|ts)$"),
    ]),
    ("lib", [
        re.compile(r"lib/.*\.(ts|tsx)$"),
    ]),
    ("config", [
        re.compile(r"app\.config\.(ts|js)$"),
        re.compile(r"metro\.config\.(ts|js)$"),
        re.compile(r"\.eslintrc\.(js|json)$"),
        re.compile(r"tsconfig\.json$"),
        re.compile(r"package\.json$"),
    ]),
]


def classify_file(file_path):
    """Classify a single file path and return its type + applicable rule count."""
    normalized = file_path.replace("\\", "/")

    for file_type, regexes in PATTERNS:
        for regex in regexes:
            if regex.search(normalized):
                return {"path": file_path, "type": file_type}

    return {"path": file_path, "type": "unknown"}


def main():
    if len(sys.argv) < 2:
        if "--stdin" in sys.argv:
            paths = [line.strip() for line in sys.stdin if line.strip()]
        else:
            print("Usage: review_file_classifier.py <file1> [file2 ...] [--stdin]")
            return 1
    elif "--stdin" in sys.argv:
        paths = [line.strip() for line in sys.stdin if line.strip()]
    else:
        paths = [a for a in sys.argv[1:] if not a.startswith("--")]

    results = [classify_file(p) for p in paths]
    json.dump({"files": results}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
