# /// script
# requires-python = ">=3.11"
# dependencies = ["fdroidserver==2.4.5"]
# ///
# Run after the recipe's init and npm install steps:
# uv run scripts/test-fdroid-native-build-scripts.py
"""Check that F-Droid scanning preserves every autolinked Android build script."""

import json
import logging
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from fdroidserver import common, metadata, scanner

ROOT = Path(__file__).resolve().parents[1]
# Build-script entries from fdroiddata's metadata/com.persoack.cablesnap.yml.
SCANIGNORE = [
    "node_modules/@react-native-community/netinfo/android/build.gradle",
    "node_modules/react-native-safe-area-context/android/build.gradle",
    "node_modules/react-native-view-shot/android/build.gradle",
]
REQUIRED_LIBRARIES = {
    Path("node_modules/react-native-screens/android/build.gradle"),
    Path("node_modules/react-native-svg/android/build.gradle"),
}

logging.basicConfig(level=logging.INFO)
# Repository URL checks are built into scan_source; no signature downloads needed.
common.config = {"scanner_signature_sources": []}


def autolinking(command: str) -> dict:
    """Return Expo's Android autolinking output for one resolver command."""
    return json.loads(
        subprocess.check_output(
            [
                "node",
                "--no-warnings",
                "--eval",
                "require('expo/bin/autolinking')",
                "expo-modules-autolinking",
                command,
                "--platform",
                "android",
                "--json",
            ],
            cwd=ROOT,
        )
    )


react_native_sources = [
    android["sourceDir"]
    for dependency in autolinking("react-native-config")["dependencies"].values()
    if (android := (dependency.get("platforms") or {}).get("android"))
]
expo_sources = [
    project["sourceDir"]
    for module in autolinking("resolve")["modules"]
    for project in module.get("projects", [])
]
scripts = sorted(
    {
        (Path(directory) / name).resolve().relative_to(ROOT)
        for directory in react_native_sources + expo_sources
        for name in ("build.gradle", "build.gradle.kts")
        if Path(directory, name).is_file()
    }
)
missing = REQUIRED_LIBRARIES.difference(scripts)
assert not missing, f"Autolinking did not expose required native build scripts: {sorted(missing)}"

with TemporaryDirectory(prefix="cablesnap-native-scan-") as temporary:
    fixture = Path(temporary)
    for relative in scripts:
        (fixture / relative).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, fixture / relative)
    # Exercise scandelete as the real node_modules scan does; otherwise a clean
    # fixture fails the scanner's unused-scandelete-path check.
    (fixture / "node_modules/publisher-artifact.jar").write_bytes(b"scanner fixture")
    build = metadata.Build()
    build.scandelete = ["node_modules"]
    build.scanignore = [path for path in SCANIGNORE if (fixture / path).is_file()]
    messages = scanner.MessageStore()

    problems = scanner.scan_source(str(fixture), build, messages)

    deleted = [str(relative) for relative in scripts if not (fixture / relative).is_file()]
    assert not deleted, f"F-Droid scandelete removes autolinked build scripts: {deleted}"
    assert not problems, messages.errors
    print(
        f"PASS: F-Droid scanner preserves {len(scripts)} autolinked Android build scripts"
    )
