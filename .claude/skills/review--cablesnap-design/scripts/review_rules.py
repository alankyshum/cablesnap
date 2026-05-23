#!/usr/bin/env python3
"""review_rules.py - Run deterministic review rules against CableSnap source files.

Usage:
    python3 review_rules.py <file1> [file2 ...] [OPTIONS]
    python3 review_rules.py --stdin [OPTIONS]
    python3 review_rules.py --batch "file1,file2" [OPTIONS]
    python3 review_rules.py --list-rules

Options:
    --rules RULE-001,RULE-002    Only run these rules (comma-separated)
    --severity critical,high     Only run rules at these severity levels
    --file-type screen,component Only process files of these types
    --stdin                      Read file paths from stdin (one per line)
    --batch "f1,f2"              Comma-separated file list
    --list-rules                 Print all available rules as JSON and exit
    --help                       Show this help message

Output (stdout): JSON with results and summary
Exit codes: 0 = all pass, 1 = issues found, 2 = usage error
"""

import importlib
import json
import os
import sys


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def error_json(msg, err_type="error"):
    json.dump({"error": msg, "type": err_type}, sys.stderr, indent=2)
    sys.stderr.write("\n")


def discover_rules():
    rules_dir = os.path.join(SCRIPT_DIR, "rules")
    if not os.path.isdir(rules_dir):
        return []

    rules = []
    try:
        filenames = os.listdir(rules_dir)
    except OSError:
        return []

    for filename in sorted(filenames):
        if not filename.startswith("rule_") or not filename.endswith(".py"):
            continue
        module_name = filename[:-3]
        try:
            module = importlib.import_module(f"rules.{module_name}")
            if hasattr(module, "Rule"):
                rule_instance = module.Rule()
                if rule_instance.RULE_ID and rule_instance.NAME:
                    rules.append(rule_instance)
        except Exception as exc:
            error_json(f"Failed to load {module_name}: {exc}", "import_error")

    rules.sort(key=lambda r: r.RULE_ID)
    return rules


def classify_file_type(file_path):
    try:
        sys.path.insert(0, SCRIPT_DIR)
        classifier = importlib.import_module("review_file_classifier")
        result = classifier.classify_file(file_path)
        return result["type"]
    except Exception as exc:
        error_json(f"Failed to classify {file_path}: {exc}", "classification_error")
        return "unknown"


def parse_args(argv):
    if not argv:
        error_json("No input provided. Use --help for usage.", "usage_error")
        return None

    result = {
        "mode": "files",
        "files": [],
        "rule_ids": None,
        "severities": None,
        "type_filter": None,
    }

    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--list-rules":
            result["mode"] = "list-rules"
        elif arg == "--stdin":
            result["mode"] = "stdin"
            result["files"] = [line.strip() for line in sys.stdin if line.strip()]
        elif arg == "--batch":
            i += 1
            if i >= len(argv):
                error_json("--batch requires a comma-separated list", "usage_error")
                return None
            result["mode"] = "batch"
            result["files"] = [f.strip() for f in argv[i].split(",") if f.strip()]
        elif arg == "--rules":
            i += 1
            if i >= len(argv):
                error_json("--rules requires comma-separated rule IDs", "usage_error")
                return None
            result["rule_ids"] = set(argv[i].split(","))
        elif arg == "--severity":
            i += 1
            if i >= len(argv):
                error_json("--severity requires comma-separated levels", "usage_error")
                return None
            result["severities"] = set(argv[i].split(","))
        elif arg == "--file-type":
            i += 1
            if i >= len(argv):
                error_json("--file-type requires comma-separated types", "usage_error")
                return None
            result["type_filter"] = set(argv[i].split(","))
        elif arg == "--help":
            print(__doc__)
            result["mode"] = "help"
            return result
        elif arg.startswith("--"):
            error_json(f"Unknown option: {arg}", "usage_error")
            return None
        else:
            result["files"].append(arg)
        i += 1

    return result


def filter_rules(rules, rule_ids=None, severities=None):
    filtered = rules
    if rule_ids:
        filtered = [r for r in filtered if r.RULE_ID in rule_ids]
    if severities:
        filtered = [r for r in filtered if r.SEVERITY in severities]
    return filtered


def select_rules_for_file(rules, file_type):
    return [r for r in rules if r.applies_to(file_type)]


def read_file(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        lines = content.splitlines()
        return content, lines
    except (FileNotFoundError, PermissionError, UnicodeDecodeError) as exc:
        error_json(f"Cannot read {file_path}: {exc}", "read_error")
        return None


def process_file(file_path, rules, type_filter=None):
    file_type = classify_file_type(file_path)

    if type_filter and file_type not in type_filter:
        return None

    applicable = select_rules_for_file(rules, file_type)
    if not applicable:
        return None

    file_data = read_file(file_path)
    if file_data is None:
        return None
    content, lines = file_data

    findings = []
    rules_checked = []

    for rule in applicable:
        rules_checked.append(rule.RULE_ID)
        try:
            results = rule.check(file_path, content, lines)
            for finding in results:
                findings.append({
                    "rule": rule.RULE_ID,
                    "name": rule.NAME,
                    "severity": rule.SEVERITY,
                    **finding.to_dict(),
                })
        except Exception as exc:
            error_json(f"Rule {rule.RULE_ID} failed on {file_path}: {exc}", "rule_error")

    return {
        "file": file_path,
        "file_type": file_type,
        "findings": findings,
        "rules_checked": sorted(rules_checked),
        "finding_count": len(findings),
    }


def build_output(results):
    by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    by_rule = {}
    total = 0

    for result in results:
        for finding in result["findings"]:
            sev = finding["severity"]
            if sev in by_severity:
                by_severity[sev] += 1
            rule_id = finding["rule"]
            by_rule[rule_id] = by_rule.get(rule_id, 0) + 1
            total += 1

    return {
        "results": results,
        "summary": {
            "files_scanned": len(results),
            "total_findings": total,
            "by_severity": by_severity,
            "by_rule": by_rule,
        },
    }


def main():
    args = parse_args(sys.argv[1:])
    if not args:
        return 2

    if args["mode"] == "help":
        return 0

    if args["mode"] == "list-rules":
        all_rules = discover_rules()
        filtered = filter_rules(all_rules, args.get("rule_ids"), args.get("severities"))
        output = {"rules": [r.to_meta() for r in filtered]}
        json.dump(output, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0

    files = args["files"]
    if not files:
        error_json("No files to process", "usage_error")
        return 2

    all_rules = discover_rules()
    rules = filter_rules(all_rules, args.get("rule_ids"), args.get("severities"))

    if not rules:
        output = build_output([])
        json.dump(output, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0

    results = []
    for file_path in files:
        result = process_file(file_path, rules, args.get("type_filter"))
        if result is not None:
            results.append(result)

    output = build_output(results)
    json.dump(output, sys.stdout, indent=2)
    sys.stdout.write("\n")

    return 1 if output["summary"]["total_findings"] > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
