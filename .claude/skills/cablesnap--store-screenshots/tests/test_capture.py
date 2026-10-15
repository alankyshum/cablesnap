import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

SCRIPT = Path(__file__).parents[1] / "scripts/capture.py"
ENCODER = SCRIPT.parent / "encode-play-png.cjs"
ROOT = SCRIPT.parents[4]
SPEC = importlib.util.spec_from_file_location("capture", SCRIPT)
capture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def test_default_profiles_are_play_valid_and_tablet_sized(self):
        expected = {
            "phone": {"size": "1080x1920", "density": 420},
            "7-inch": {"size": "1080x1920", "density": 288},
            "10-inch": {"size": "1440x2560", "density": 288},
        }
        self.assertEqual(capture.PROFILES, expected)
        self.assertEqual(capture.SCREENS, ("workouts", "nutrition", "progress", "exercises"))
        for profile in capture.PROFILES.values():
            width, height = map(int, profile["size"].split("x"))
            self.assertLessEqual(max(width, height), 2 * min(width, height))

    def test_profile_and_screen_selection(self):
        self.assertEqual(capture.parse_selection("phone,10-inch", capture.PROFILES, "--devices"), ["phone", "10-inch"])
        self.assertEqual(capture.parse_selection("nutrition,exercises", capture.SCREENS, "--screens"), ["nutrition", "exercises"])
        for value in ("phone,phone", "unknown", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                capture.parse_selection(value, capture.PROFILES, "--devices")

    def test_config_profile_values_and_rejects_unsafe_or_unknown_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profiles.json"
            path.write_text(json.dumps({"profiles": {"phone": {"size": "1080x1920", "density": 400}}}))
            self.assertEqual(capture.load_profiles(path)["phone"], {"size": "1080x1920", "density": 400})
            for override in ({"size": "10; reset", "density": 420}, {"size": "1080x2400", "density": 420}, {"size": "100x500", "density": 420}, {"size": "800x1600", "density": 0}, {"size": "800x1600", "density": True}, {"size": "800x1600", "density": 420, "command": "adb shell"}):
                path.write_text(json.dumps({"profiles": {"phone": override}}))
                with self.subTest(override=override), self.assertRaises(ValueError):
                    capture.load_profiles(path)
            path.write_text('{"profiles":{"wearable":{"size":"1x1","density":1}}}')
            with self.assertRaises(ValueError):
                capture.load_profiles(path)

    def test_dark_requires_selected_native_appearance_option(self):
        checked = ET.fromstring('<hierarchy><node content-desc="Dark" selected="true" /></hierarchy>')
        unchecked = ET.fromstring('<hierarchy><node content-desc="Dark" selected="false" /></hierarchy>')
        capture.verify_dark_theme(checked)
        with self.assertRaisesRegex(RuntimeError, "set it in the app"):
            capture.verify_dark_theme(unchecked)

    def test_screen_requires_body_content_not_navigation_label(self):
        root = ET.fromstring('<hierarchy><node text="Progress" /><node text="Calories" /></hierarchy>')
        capture.verify_screen(root, "nutrition")
        with self.assertRaisesRegex(RuntimeError, "content was not verified"):
            capture.verify_screen(root, "progress")

    def test_source_and_installed_both_version_fields_must_match(self):
        source = 'version: "1.2.3", versionCode: 17'
        self.assertEqual(capture.package_versions(source, "versionName=1.2.3 versionCode=17 minSdk=26"), ("1.2.3", "17"))
        with self.assertRaisesRegex(ValueError, "differs from source"):
            capture.package_versions(source, "versionName=1.2.3 versionCode=16")

    def test_all_native_tabs_have_accessible_content_markers(self):
        for screen in capture.SCREENS:
            root = ET.fromstring(f'<hierarchy><node text="{capture.SCREEN_MARKERS[screen][0]}" /></hierarchy>')
            capture.verify_screen(root, screen)

    def test_restore_uses_original_override_or_reset(self):
        calls = []
        capture.restore_override(lambda *args, **kwargs: calls.append((args, kwargs)), "size", "Physical size: 1600x2560\nOverride size: 1200x1920")
        capture.restore_override(lambda *args, **kwargs: calls.append((args, kwargs)), "density", "Physical density: 320")
        self.assertEqual(calls, [
            (("shell", "wm", "size", "1200x1920"), {"capture": False}),
            (("shell", "wm", "density", "reset"), {"capture": False}),
        ])

    def test_play_png_is_rgb_and_pixel_identical(self):
        pixels = bytes((12, 34, 56, 255, 200, 150, 100, 255))
        raw = subprocess.run(
            ["node", "-e", "const sharp=require('sharp'); sharp(Buffer.from(process.argv[1],'hex'),{raw:{width:2,height:1,channels:4}}).png().toBuffer().then(b=>process.stdout.write(b))", pixels.hex()],
            cwd=ROOT, capture_output=True, check=True, timeout=30,
        ).stdout
        converted = subprocess.run(["node", str(ENCODER)], input=raw, cwd=ROOT,
                                    capture_output=True, check=True, timeout=30).stdout
        self.assertEqual((converted[24], converted[25]), (8, 2))
        decoded = subprocess.run(
            ["node", "-e", "const sharp=require('sharp'); const c=[]; process.stdin.on('data',x=>c.push(x)); process.stdin.on('end',()=>sharp(Buffer.concat(c)).raw().toBuffer().then(b=>process.stdout.write(b)))"],
            input=converted, cwd=ROOT, capture_output=True, check=True, timeout=30,
        ).stdout
        self.assertEqual(decoded, pixels[:3] + pixels[4:7])

    def test_play_png_refuses_translucent_pixels(self):
        raw = subprocess.run(
            ["node", "-e", "const sharp=require('sharp'); sharp(Buffer.from([12,34,56,128]),{raw:{width:1,height:1,channels:4}}).png().toBuffer().then(b=>process.stdout.write(b))"],
            cwd=ROOT, capture_output=True, check=True, timeout=30,
        ).stdout
        result = subprocess.run(["node", str(ENCODER)], input=raw, cwd=ROOT,
                                capture_output=True, timeout=30)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"non-opaque", result.stderr)


if __name__ == "__main__":
    unittest.main()
