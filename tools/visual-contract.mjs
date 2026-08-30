import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const directory = "artifacts/screenshots";
if (!existsSync(directory)) throw new Error("No screenshots found");
const screenshots = readdirSync(directory).filter((file) => file.endsWith(".png")).sort().map((file) => {
  const bytes = readFileSync(join(directory, file));
  return {
    file,
    capture_mode: "viewport",
    css_viewport: { width: 390, height: 844 },
    device_scale_factor: 3,
    pixel_dimensions: { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) },
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});
if (screenshots.length === 0) throw new Error("No PNG screenshots found");
mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/visual-contract.json", `${JSON.stringify({ schema: "alx.visual-contract.v1", screenshots }, null, 2)}\n`);
console.log(`recorded ${screenshots.length} visual scenarios`);
