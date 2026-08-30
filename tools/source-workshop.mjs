import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const sources = JSON.parse(readFileSync("docs/research/source-lock.json", "utf8")).sources;
const cache = join(process.cwd(), ".cache", "sources");
const command = process.argv[2];

const run = (program, args, options = {}) => execFileSync(program, args, { stdio: "inherit", ...options });

if (command === "fetch") {
  mkdirSync(cache, { recursive: true });
  for (const source of sources) {
    const target = join(cache, source.id);
    if (!existsSync(target)) {
      const refArgs = source.clone_ref ? ["--branch", source.clone_ref, "--depth=1"] : [];
      run("git", ["clone", "--filter=blob:none", "--no-checkout", ...refArgs, source.repository, target]);
    }
    run("git", ["-C", target, "fetch", "--prune", "origin"]);
    const revision = spawnSync("git", ["-C", target, "cat-file", "-e", `${source.revision}^{commit}`]);
    if (revision.status !== 0) throw new Error(`${source.id}: locked revision is no longer reachable from the fetched repository`);
    run("git", ["-C", target, "checkout", "--detach", "--force", source.revision]);
    const actual = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (actual !== source.revision) throw new Error(`${source.id}: expected ${source.revision}, got ${actual}`);
  }
} else if (command === "search") {
  const query = process.argv.slice(3).join(" ");
  if (!query) throw new Error("usage: npm run sources:search -- <query>");
  if (!existsSync(cache)) throw new Error("run npm run sources:fetch first");
  const result = spawnSync("rg", ["--line-number", "--glob", "!**/.git/**", query, cache], { stdio: "inherit" });
  process.exit(result.status ?? 1);
} else if (command === "board") {
  console.log("# Reproducible source board\n");
  for (const source of sources) {
    console.log(`## ${source.id}\n\n- ${source.repository.replace(/\.git$/, "")}/tree/${source.revision}`);
    console.log(`- Inspected: ${source.paths.join(", ")}`);
    console.log(`- Adopted: ${source.adopted.join("; ")}`);
    console.log(`- Rejected: ${source.rejected.join("; ")}\n`);
  }
} else {
  throw new Error("usage: source-workshop.mjs fetch|search <query>|board");
}
