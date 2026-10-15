#!/usr/bin/env python3
"""Capture genuine, unmodified CableSnap Android emulator screenshots."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PACKAGE = "com.persoack.cablesnap"
SCREENS = ("workouts", "nutrition", "progress", "exercises")
PROFILES = {
    "phone": {"size": "1080x1920", "density": 420},
    "7-inch": {"size": "1080x1920", "density": 288},
    "10-inch": {"size": "1440x2560", "density": 288},
}
SCREEN_MARKERS = {
    "workouts": ("Streak",),
    "nutrition": ("Calories",),
    "progress": ("Track your progress",),
    "exercises": ("Search exercises...",),
}


def parse_selection(value, allowed, option):
    selected = value.split(",")
    if not selected or any(item not in allowed for item in selected) or len(set(selected)) != len(selected):
        raise ValueError(f"{option} must be a comma-separated subset of {','.join(allowed)}")
    return selected


def load_profiles(config_path):
    profiles = {name: spec.copy() for name, spec in PROFILES.items()}
    if config_path is None:
        return profiles
    config = json.loads(config_path.read_text())
    if not isinstance(config, dict) or set(config) - {"profiles"}:
        raise ValueError("config must be a JSON object containing only 'profiles'")
    overrides = config.get("profiles", {})
    if not isinstance(overrides, dict):
        raise ValueError("config 'profiles' must be an object")
    for name, override in overrides.items():
        if name not in PROFILES or not isinstance(override, dict) or set(override) - {"size", "density"}:
            raise ValueError(f"invalid profile override: {name!r}")
        updated = profiles[name] | override
        size = updated["size"]
        density = updated["density"]
        if not isinstance(size, str) or not re.fullmatch(r"[1-9]\d*x[1-9]\d*", size):
            raise ValueError(f"{name} size must be WIDTHxHEIGHT with positive integers")
        if isinstance(density, bool) or not isinstance(density, int) or density <= 0:
            raise ValueError(f"{name} density must be a positive integer")
        width, height = map(int, size.split("x"))
        shortest, longest = sorted((width, height))
        if shortest < 320 or longest > 3840 or longest > 2 * shortest:
            raise ValueError(f"{name} dimensions must be 320–3840 pixels with max <= 2x min (Play screenshot rule)")
        profiles[name] = updated
    return profiles


def package_versions(app_config, dumpsys):
    source_name = re.search(r'\bversion:\s*["\']([^"\']+)["\']', app_config)
    source_code = re.search(r"\bversionCode:\s*(\d+)", app_config)
    installed_name = re.search(r"versionName=([^\s]+)", dumpsys)
    installed_code = re.search(r"versionCode=(\d+)", dumpsys)
    if not all((source_name, source_code, installed_name, installed_code)):
        raise ValueError("could not determine installed and source app versionName/versionCode")
    expected = (source_name.group(1), source_code.group(1))
    actual = (installed_name.group(1), installed_code.group(1))
    if actual != expected:
        raise ValueError(f"installed app {actual[0]} ({actual[1]}) differs from source {expected[0]} ({expected[1]}); install a matching APK explicitly")
    return actual


def verify_dark_theme(root):
    dark = [n for n in root.iter("node") if n.attrib.get("content-desc", "").strip().casefold() == "dark"]
    if not dark:
        raise RuntimeError("Dark option is not visible in app Appearance settings; scroll to Units & Appearance and retry")
    if not any(n.attrib.get("selected") == "true" or n.attrib.get("checked") == "true" for n in dark):
        raise RuntimeError("Dark theme is not selected in app Appearance settings; set it in the app, then retry (capture never changes theme preference)")


def verify_screen(root, screen):
    labels = {n.attrib.get("text", "").strip().casefold() for n in root.iter("node")}
    if not any(marker.casefold() in labels for marker in SCREEN_MARKERS[screen]):
        raise RuntimeError(f"{screen} screen content was not verified; expected one of {SCREEN_MARKERS[screen]}")


def saved_override(kind, output):
    match = re.search(rf"Override {kind}: ([\d]+(?:x[\d]+)?)", output)
    return match.group(1) if match else "reset"


def restore_override(adb_call, kind, output):
    adb_call("shell", "wm", kind, saved_override(kind, output), capture=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", type=Path, default=Path.home() / "Downloads/cablesnap-store-screenshots")
    parser.add_argument("--devices", default=",".join(PROFILES), help="comma-separated emulator profiles (default: all)")
    parser.add_argument("--config", type=Path, help="JSON profile overrides; see skill documentation")
    parser.add_argument("--screens", default=",".join(SCREENS), help="screens in capture order (default: all four)")
    parser.add_argument("--apk", type=Path)
    args = parser.parse_args()
    try:
        devices = parse_selection(args.devices, PROFILES, "--devices")
        screens = parse_selection(args.screens, SCREENS, "--screens")
        profiles = load_profiles(args.config)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    if args.output.exists():
        parser.error(f"output already exists; choose a new directory: {args.output}")

    def adb(*cmd, capture=True, check=True):
        return subprocess.run(["adb", "-s", args.serial, *cmd], check=check,
                              stdout=subprocess.PIPE if capture else None,
                              stderr=subprocess.PIPE if capture else None, timeout=20)

    connected = subprocess.run(["adb", "devices"], check=True, text=True, capture_output=True, timeout=20).stdout
    if not re.search(rf"^{re.escape(args.serial)}\s+device$", connected, re.M) or not args.serial.startswith("emulator-"):
        parser.error("--serial must name an online Android emulator (physical devices are not allowed)")
    if args.apk:
        if not args.apk.is_file():
            parser.error(f"APK not found: {args.apk}")
        subprocess.run(["adb", "-s", args.serial, "install", "-r", str(args.apk)], check=True, timeout=120)
    if not adb("shell", "pm", "path", PACKAGE).stdout:
        parser.error(f"{PACKAGE} is not installed; provide an explicit --apk")
    repo_root = Path(__file__).resolve().parents[4]
    source = (repo_root / "app.config.ts").read_text()
    version_name, version_code = package_versions(source, adb("shell", "dumpsys", "package", PACKAGE).stdout.decode(errors="replace"))
    old_size = adb("shell", "wm", "size").stdout.decode().strip()
    old_density = adb("shell", "wm", "density").stdout.decode().strip()
    args.output.mkdir(parents=True)
    manifest = {"package": PACKAGE, "version": version_name, "serial": args.serial,
                "versionCode": int(version_code), "theme": "dark", "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "captures": []}

    def hierarchy():
        adb("shell", "uiautomator", "dump", "/sdcard/cablesnap-capture.xml")
        return ET.fromstring(adb("shell", "cat", "/sdcard/cablesnap-capture.xml").stdout)

    def tap_label(label):
        root = hierarchy()
        hits = [n for n in root.iter("node") if n.attrib.get("text", "").strip().casefold() == label.casefold()
                or n.attrib.get("content-desc", "").strip().casefold() == label.casefold()]
        hits = [n for n in hits if n.attrib.get("bounds")]
        if not hits:
            raise RuntimeError(f"No visible accessibility node for {label!r}")
        # Bottom navigation labels can repeat in screen content; prefer the
        # navigation row nearest the bottom, based on current hierarchy bounds.
        hits.sort(key=lambda n: int(re.findall(r"\d+", n.attrib["bounds"])[1]), reverse=True)
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", hits[0].attrib["bounds"]))
        adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2), capture=False)
        time.sleep(1.5)
        return hierarchy()

    def check_dark_theme():
        root = tap_label("Settings")
        for _ in range(8):
            if any(n.attrib.get("content-desc", "").strip().casefold() == "dark" for n in root.iter("node")):
                break
            scrolls = [n for n in root.iter("node") if n.attrib.get("scrollable") == "true" and n.attrib.get("bounds")]
            if not scrolls:
                break
            scrolls.sort(key=lambda n: int(re.findall(r"\d+", n.attrib["bounds"])[2]) - int(re.findall(r"\d+", n.attrib["bounds"])[0]), reverse=True)
            x1, y1, x2, y2 = map(int, re.findall(r"\d+", scrolls[0].attrib["bounds"]))
            adb("shell", "input", "swipe", str((x1+x2)//2), str(y2-80), str((x1+x2)//2), str(y1+80), "400", capture=False)
            time.sleep(0.8)
            root = hierarchy()
        verify_dark_theme(root)

    def navigate_to_screen(screen):
        if screen == "exercises":
            adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "cablesnap:///exercises", PACKAGE, capture=False)
            time.sleep(2)
            return hierarchy()
        return tap_label(screen.title())

    try:
        for profile in devices:
            size, density = profiles[profile]["size"], profiles[profile]["density"]
            adb("shell", "wm", "size", size, capture=False)
            adb("shell", "wm", "density", str(density), capture=False)
            adb("shell", "am", "force-stop", PACKAGE, capture=False)
            adb("shell", "am", "start", "-n", f"{PACKAGE}/.MainActivity", capture=False)
            time.sleep(5)
            check_dark_theme()
            previous_png = None
            for screen in screens:
                root = navigate_to_screen(screen)
                verify_screen(root, screen)
                # Let layout settle after density changes and tab navigation.
                time.sleep(1)
                raw_png = adb("exec-out", "screencap", "-p").stdout
                if not raw_png.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise RuntimeError("adb screencap did not return a PNG")
                encoder = repo_root / ".claude/skills/cablesnap--store-screenshots/scripts/encode-play-png.cjs"
                encoded = subprocess.run(["node", str(encoder)], input=raw_png, stdout=subprocess.PIPE,
                                         stderr=subprocess.PIPE, check=False, timeout=120, cwd=repo_root)
                if encoded.returncode:
                    raise RuntimeError(f"RGB PNG conversion failed: {encoded.stderr.decode(errors='replace').strip()}")
                png = encoded.stdout
                if png == previous_png:
                    raise RuntimeError(f"{screen} capture was identical to the prior tab; navigation did not change the screen")
                previous_png = png
                width, height = int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")
                if png[24] != 8 or png[25] != 2:
                    raise RuntimeError("final PNG must be 8-bit RGB (24-bit) with no alpha channel")
                expected = tuple(map(int, size.split("x")))
                if (width, height) != expected:
                    raise RuntimeError(f"PNG is {width}x{height}, expected {size}")
                if max(width, height) > 2 * min(width, height):
                    raise RuntimeError(f"{screen} dimensions violate Play's max <= 2x min screenshot rule")
                path = args.output / profile / f"{SCREENS.index(screen)+1:02d}-{screen}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(png)
                manifest["captures"].append({"profile": profile, "screen": screen, "path": str(path),
                                             "width": width, "height": height, "densityDpi": density,
                                             "format": "PNG RGB 24-bit (no alpha)",
                                             "rawScreenshotSha256": hashlib.sha256(raw_png).hexdigest(),
                                             "sha256": hashlib.sha256(png).hexdigest()})
                print(path)
        (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    finally:
        try:
            restore_override(adb, "size", old_size)
        finally:
            restore_override(adb, "density", old_density)
        adb("shell", "am", "force-stop", PACKAGE, capture=False)
    print(f"Manifest: {args.output / 'manifest.json'}")


if __name__ == "__main__":
    try:
        main()
    except (subprocess.SubprocessError, OSError, RuntimeError, ValueError, ET.ParseError) as exc:
        print(f"capture failed: {exc}", file=sys.stderr)
        sys.exit(1)
