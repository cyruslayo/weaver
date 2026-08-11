import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "artifacts");
const packages = ["core", "web", "mcp"];

await rm(artifacts, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });
for (const packageName of packages) {
  const result = spawnSync("pnpm", ["pack", "--pack-destination", artifacts], {
    cwd: path.join(root, "packages", packageName),
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
