import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const EXPECTED_SCREENSHOTS = [
  "history-day-earlier-dark.png",
  "history-day-now-dark.png",
  "history-touch-inspection-dark.png",
  "history-week-bright-theme.png",
  "timed-away-active.png",
  "timed-away-failure.png",
  "timed-away-picker.png",
];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const TEXTUAL_CHUNKS = new Set(["eXIf", "iTXt", "tEXt", "zTXt"]);
const ALLOWED_CHUNKS = new Set(["IHDR", "IDAT", "IEND"]);
const EXPECTED_CSS = { width: 390, height: 844 };
const EXPECTED_DPR = 3;
const EXPECTED_PIXELS = {
  width: EXPECTED_CSS.width * EXPECTED_DPR,
  height: EXPECTED_CSS.height * EXPECTED_DPR,
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const exactKeys = (value, expected, label) => {
  const observed = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(observed) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fields must be exactly ${wanted.join(", ")}`);
  }
};

const assertPlainObject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
};

export const inspectPng = (file, bytes) => {
  if (bytes.length < 45 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${file}: invalid PNG signature or length`);
  }
  let offset = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let seenHeader = false;
  let seenData = false;
  let seenEnd = false;
  let dataEnded = false;
  let dimensions;
  const compressedImageData = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(`${file}: truncated PNG chunk header`);
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error(`${file}: truncated PNG chunk data`);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) {
      throw new Error(`${file}: invalid ${type} CRC`);
    }
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`${file}: invalid PNG chunk type`);
    if (TEXTUAL_CHUNKS.has(type)) throw new Error(`${file}: textual or private metadata chunk ${type} is forbidden`);
    if (!ALLOWED_CHUNKS.has(type)) throw new Error(`${file}: unapproved PNG chunk ${type}`);
    if (chunkIndex === 0 && type !== "IHDR") throw new Error(`${file}: IHDR must be first`);
    if (type === "IHDR") {
      if (seenHeader || length !== 13) throw new Error(`${file}: invalid IHDR`);
      seenHeader = true;
      dimensions = { width: data.readUInt32BE(0), height: data.readUInt32BE(4) };
      const [bitDepth, colorType, compression, filter, interlace] = data.subarray(8);
      if (bitDepth !== 8 || colorType !== 2 || compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new Error(`${file}: expected non-interlaced 8-bit RGB PNG`);
      }
    } else if (type === "IDAT") {
      if (!seenHeader || seenEnd || dataEnded) throw new Error(`${file}: invalid IDAT sequence`);
      seenData = true;
      compressedImageData.push(data);
    } else {
      if (seenData && !seenEnd) dataEnded = true;
      if (type === "IEND") {
        if (length !== 0 || seenEnd || !seenData || end !== bytes.length) throw new Error(`${file}: invalid IEND`);
        seenEnd = true;
      }
    }
    chunkIndex += 1;
    offset = end;
  }
  if (!seenHeader || !seenData || !seenEnd || offset !== bytes.length) throw new Error(`${file}: incomplete PNG`);
  if (dimensions.width !== EXPECTED_PIXELS.width || dimensions.height !== EXPECTED_PIXELS.height) {
    throw new Error(`${file}: expected ${EXPECTED_PIXELS.width}x${EXPECTED_PIXELS.height} pixels`);
  }
  let imageData;
  try {
    const compressed = Buffer.concat(compressedImageData);
    const inflated = inflateSync(compressed, {
      info: true,
      maxOutputLength: (dimensions.width * 3 + 1) * dimensions.height,
    });
    if (inflated.engine.bytesWritten !== compressed.length) throw new Error("trailing compressed data");
    imageData = inflated.buffer;
  } catch {
    throw new Error(`${file}: IDAT is not a valid bounded zlib image stream`);
  }
  const rowLength = dimensions.width * 3 + 1;
  if (imageData.length !== rowLength * dimensions.height) throw new Error(`${file}: decoded pixel data length is invalid`);
  for (let row = 0; row < dimensions.height; row += 1) {
    if (imageData[row * rowLength] > 4) throw new Error(`${file}: invalid PNG scanline filter`);
  }
  return dimensions;
};

export const validateReleaseArtifacts = (directory = "artifacts") => {
  const screenshotsDirectory = join(directory, "screenshots");
  const contractPath = join(directory, "visual-contract.json");
  const rootEntries = readdirSync(directory).sort();
  if (JSON.stringify(rootEntries) !== JSON.stringify(["screenshots", "visual-contract.json"])) {
    throw new Error("release artifacts must contain only screenshots/ and visual-contract.json");
  }
  if (!lstatSync(screenshotsDirectory).isDirectory() || !lstatSync(contractPath).isFile()) {
    throw new Error("release artifact paths must be regular files/directories");
  }
  const screenshotEntries = readdirSync(screenshotsDirectory, { withFileTypes: true });
  if (screenshotEntries.some((entry) => !entry.isFile())) throw new Error("screenshot artifacts must be regular files");
  const screenshotNames = screenshotEntries.map((entry) => entry.name).sort();
  if (JSON.stringify(screenshotNames) !== JSON.stringify(EXPECTED_SCREENSHOTS)) {
    throw new Error(`screenshot names must be exactly ${EXPECTED_SCREENSHOTS.join(", ")}`);
  }

  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  assertPlainObject(contract, "visual contract");
  exactKeys(contract, ["schema", "screenshots"], "visual contract");
  if (contract.schema !== "alx.visual-contract.v1" || !Array.isArray(contract.screenshots)) {
    throw new Error("visual contract schema is invalid");
  }
  const contractNames = contract.screenshots.map((entry) => entry?.file).sort();
  if (JSON.stringify(contractNames) !== JSON.stringify(EXPECTED_SCREENSHOTS)) {
    throw new Error("visual contract must contain each expected screenshot exactly once");
  }

  for (const entry of contract.screenshots) {
    assertPlainObject(entry, `visual contract entry ${entry?.file ?? "unknown"}`);
    exactKeys(entry, ["capture_mode", "css_viewport", "device_scale_factor", "file", "pixel_dimensions", "sha256"], `visual contract entry ${entry.file}`);
    assertPlainObject(entry.css_viewport, `${entry.file} css_viewport`);
    assertPlainObject(entry.pixel_dimensions, `${entry.file} pixel_dimensions`);
    exactKeys(entry.css_viewport, ["height", "width"], `${entry.file} css_viewport`);
    exactKeys(entry.pixel_dimensions, ["height", "width"], `${entry.file} pixel_dimensions`);
    if (entry.capture_mode !== "viewport"
      || entry.css_viewport.width !== EXPECTED_CSS.width || entry.css_viewport.height !== EXPECTED_CSS.height
      || entry.device_scale_factor !== EXPECTED_DPR
      || entry.pixel_dimensions.width !== EXPECTED_PIXELS.width || entry.pixel_dimensions.height !== EXPECTED_PIXELS.height) {
      throw new Error(`${entry.file}: visual contract dimensions must be 390x844 CSS at DPR 3`);
    }
    const bytes = readFileSync(join(screenshotsDirectory, entry.file));
    inspectPng(entry.file, bytes);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(entry.sha256) || digest !== entry.sha256) {
      throw new Error(`${entry.file}: SHA-256 does not match visual-contract.json`);
    }
  }

  return { screenshots: EXPECTED_SCREENSHOTS.length };
};

const main = () => {
  const result = validateReleaseArtifacts();
  console.log(`release artifact privacy passed (${result.screenshots} exact PNGs)`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
