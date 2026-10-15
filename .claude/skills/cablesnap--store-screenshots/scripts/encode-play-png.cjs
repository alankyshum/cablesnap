const sharp = require("sharp");

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks);
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = decoded.data;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) throw new Error("raw emulator screenshot contains non-opaque pixels; refusing lossy alpha removal");
  }
  const output = await sharp(input).removeAlpha().png({ palette: false }).toBuffer();
  const result = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  if (result.info.channels !== 3 || result.info.width !== decoded.info.width || result.info.height !== decoded.info.height) {
    throw new Error("RGB PNG encoding changed the screenshot dimensions or channel count");
  }
  const rgb = result.data;
  for (let src = 0, dst = 0; dst < rgb.length; src += 4, dst += 3) {
    if (rgba[src] !== rgb[dst] || rgba[src + 1] !== rgb[dst + 1] || rgba[src + 2] !== rgb[dst + 2]) {
      throw new Error("RGB PNG encoding changed decoded pixel values");
    }
  }
  if (output[24] !== 8 || output[25] !== 2) throw new Error("encoder did not produce a 24-bit RGB PNG without alpha");
  process.stdout.write(output);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
