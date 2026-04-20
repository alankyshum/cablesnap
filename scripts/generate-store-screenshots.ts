/**
 * Generate device-framed store screenshots from raw Playwright captures.
 *
 * Reads raw PNGs from .pixelslop/screenshots/ (produced by store-pixel9
 * and store-fold7 Playwright projects), composites a programmatic device
 * frame around each using sharp, and writes them to:
 *   - fdroid/metadata/com.persoack.cablesnap/en-US/phoneScreenshots/ (Pixel 9)
 *   - assets/store-screenshots/ (both devices)
 *
 * Usage: npx tsx scripts/generate-store-screenshots.ts
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SCREENSHOT_DIR = path.resolve(__dirname, "../.pixelslop/screenshots");
const FDROID_DIR = path.resolve(
  __dirname,
  "../fdroid/metadata/com.persoack.cablesnap/en-US/phoneScreenshots",
);
const ASSETS_DIR = path.resolve(__dirname, "../assets/store-screenshots");

const TAB_SLUGS = ["workouts", "exercises", "nutrition", "progress", "settings"];

interface DeviceSpec {
  /** Playwright project name */
  project: string;
  /** Label for logging */
  label: string;
  /** Raw screenshot viewport width */
  viewportW: number;
  /** Raw screenshot viewport height */
  viewportH: number;
  /** Final output width (including frame) */
  outputW: number;
  /** Final output height (including frame) */
  outputH: number;
  /** Bezel thickness around the screen */
  bezel: number;
  /** Corner radius of the outer bezel */
  cornerRadius: number;
  /** Corner radius of the inner screen area */
  screenRadius: number;
}

const DEVICES: DeviceSpec[] = [
  {
    project: "store-pixel9",
    label: "Pixel 9",
    viewportW: 412,
    viewportH: 924,
    outputW: 1080,
    outputH: 2424,
    bezel: 36,
    cornerRadius: 48,
    screenRadius: 28,
  },
  {
    project: "store-fold7",
    label: "Galaxy Z Fold 7",
    viewportW: 712,
    viewportH: 853,
    outputW: 1440,
    outputH: 1760,
    bezel: 40,
    cornerRadius: 52,
    screenRadius: 30,
  },
];

// ---------------------------------------------------------------------------
// SVG builders
// ---------------------------------------------------------------------------

function buildFrameSvg(device: DeviceSpec): string {
  const { outputW, outputH, bezel, cornerRadius, screenRadius } = device;
  const sx = bezel;
  const sy = bezel;
  const sw = outputW - bezel * 2;
  const sh = outputH - bezel * 2;
  const cr = cornerRadius;
  const sr = screenRadius;

  // Outer rounded rect (clockwise)
  const outer = `M${cr},0 H${outputW - cr} Q${outputW},0 ${outputW},${cr} V${outputH - cr} Q${outputW},${outputH} ${outputW - cr},${outputH} H${cr} Q0,${outputH} 0,${outputH - cr} V${cr} Q0,0 ${cr},0 Z`;

  // Inner rounded rect (same winding — even-odd creates hole)
  const inner = `M${sx + sr},${sy} H${sx + sw - sr} Q${sx + sw},${sy} ${sx + sw},${sy + sr} V${sy + sh - sr} Q${sx + sw},${sy + sh} ${sx + sw - sr},${sy + sh} H${sx + sr} Q${sx},${sy + sh} ${sx},${sy + sh - sr} V${sy + sr} Q${sx},${sy} ${sx + sr},${sy} Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outputW}" height="${outputH}">
  <defs>
    <filter id="shadow" x="-5%" y="-2%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <path fill-rule="evenodd" d="${outer} ${inner}" fill="#1a1a1a" filter="url(#shadow)"/>
</svg>`;
}

function buildStatusBarSvg(width: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44">
  <rect width="${width}" height="44" fill="rgba(0,0,0,0.15)"/>
  <text x="24" y="30" font-family="sans-serif" font-size="16" font-weight="600"
        fill="white">9:41</text>
  <!-- Battery icon -->
  <rect x="${width - 52}" y="14" width="24" height="14" rx="3" ry="3"
        stroke="white" stroke-width="1.5" fill="none"/>
  <rect x="${width - 27}" y="19" width="2" height="4" rx="1" ry="1" fill="white"/>
  <rect x="${width - 49}" y="17" width="18" height="8" rx="1.5" ry="1.5" fill="white"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function frameScreenshot(
  rawPath: string,
  device: DeviceSpec,
  outputPath: string,
): Promise<void> {
  const { outputW, outputH, bezel, screenRadius } =
    device;
  const screenW = outputW - bezel * 2;
  const screenH = outputH - bezel * 2;

  // Resize raw screenshot to fit the screen area
  const resized = await sharp(rawPath)
    .resize(screenW, screenH, { fit: "cover", position: "top" })
    .toBuffer();

  // Create rounded mask for the screen area
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${screenW}" height="${screenH}">
    <rect width="${screenW}" height="${screenH}" rx="${screenRadius}" ry="${screenRadius}" fill="white"/>
  </svg>`;

  const maskedScreen = await sharp(resized)
    .composite([
      {
        input: Buffer.from(maskSvg),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  // Build frame and status bar
  const frameSvg = Buffer.from(buildFrameSvg(device));
  const statusBarSvg = Buffer.from(buildStatusBarSvg(screenW));

  // Composite: white bg → masked screenshot → frame → status bar
  await sharp({
    create: {
      width: outputW,
      height: outputH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: maskedScreen, left: bezel, top: bezel },
      { input: frameSvg, left: 0, top: 0 },
      { input: statusBarSvg, left: bezel, top: bezel },
    ])
    .png()
    .toFile(outputPath);
}

async function main(): Promise<void> {
  // Find today's date stamp to match screenshot filenames
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Check screenshot dir exists
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    console.error(
      `Screenshot directory not found: ${SCREENSHOT_DIR}\nRun 'npm run screenshots:raw' first.`,
    );
    process.exit(1);
  }

  const files = fs.readdirSync(SCREENSHOT_DIR).filter((f) => f.endsWith(".png"));
  if (files.length === 0) {
    console.error(
      `No screenshots found in ${SCREENSHOT_DIR}\nRun 'npm run screenshots:raw' first.`,
    );
    process.exit(1);
  }

  // Ensure output dirs
  fs.mkdirSync(FDROID_DIR, { recursive: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  for (const device of DEVICES) {
    for (let i = 0; i < TAB_SLUGS.length; i++) {
      const slug = TAB_SLUGS[i];

      // Find matching screenshot (try today first, then any date)
      let rawFile = files.find(
        (f) => f === `${slug}-${device.project}-${today}.png`,
      );
      if (!rawFile) {
        rawFile = files.find(
          (f) =>
            f.startsWith(`${slug}-${device.project}-`) && f.endsWith(".png"),
        );
      }

      if (!rawFile) {
        console.warn(
          `Missing screenshot for ${slug} (${device.label}), skipping`,
        );
        continue;
      }

      const rawPath = path.join(SCREENSHOT_DIR, rawFile);
      const assetName = `${slug}-${device.project}.png`;
      const assetPath = path.join(ASSETS_DIR, assetName);

      process.stdout.write(`Framing ${slug} for ${device.label}... `);
      await frameScreenshot(rawPath, device, assetPath);
      console.log("done");

      // Copy Pixel 4 shots to F-Droid as 1.png-5.png
      if (device.project === "store-pixel9") {
        const fdroidPath = path.join(FDROID_DIR, `${i + 1}.png`);
        fs.copyFileSync(assetPath, fdroidPath);
        console.log(`  → ${path.relative(process.cwd(), fdroidPath)}`);
      }
    }
  }

  console.log("\nStore screenshots generated successfully.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
