# /// script
# requires-python = ">=3.11"
# dependencies = ["fdroidserver==2.4.5"]
# ///
# Run after npm install: uv run scripts/test-fdroid-keyboard-scanner.py
"""Check that F-Droid scanning preserves KC's patched Gradle build script."""

import logging
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from fdroidserver import common, metadata, scanner

logging.basicConfig(level=logging.INFO)
# Repository URL checks are built into scan_source; no signature downloads needed.
common.config = {"scanner_signature_sources": []}

with TemporaryDirectory(prefix="cablesnap-kc-scan-") as temporary:
    root = Path(temporary)
    relative = Path(
        "node_modules/react-native-keyboard-controller/android/build.gradle"
    )
    source = Path(__file__).resolve().parents[1] / relative
    target = root / relative
    target.parent.mkdir(parents=True)
    shutil.copyfile(source, target)
    # Exercise scandelete as the real node_modules scan does; otherwise a clean
    # single-file fixture fails the scanner's unused-scandelete-path check.
    (target.parent / "publisher-artifact.jar").write_bytes(b"scanner fixture")
    build = metadata.Build()
    build.scandelete = ["node_modules"]
    messages = scanner.MessageStore()

    problems = scanner.scan_source(str(root), build, messages)

    assert target.is_file(), f"F-Droid deleted KC build.gradle: {messages.infos}"
    assert not problems, messages.errors
    assert target.read_bytes() == source.read_bytes()
    print("PASS: F-Droid scanner preserves KC build.gradle unchanged")
