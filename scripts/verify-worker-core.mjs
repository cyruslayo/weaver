import { cp, mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifact = "weaver-core-0.1.1.tgz";
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
};

run("pnpm", ["--filter", "@weaver/core", "clean"], { cwd: root, stdio: "inherit" });
run("pnpm", ["--filter", "@weaver/core", "build"], { cwd: root, stdio: "inherit" });
run("pnpm", ["pack", "--pack-destination", path.join(root, "artifacts")], { cwd: path.join(root, "packages", "core"), stdio: "inherit" });
const consumer = await mkdtemp(path.join(os.tmpdir(), "weaver-workerd-consumer-"));
for (const file of ["package.json", "pnpm-lock.yaml", "vitest.config.js", "worker.test.js"]) {
  await cp(path.join(root, "integration", "workerd-consumer", file), path.join(consumer, file));
}
await cp(path.join(root, "artifacts", artifact), path.join(consumer, artifact));
run("pnpm", ["install", "--ignore-workspace", "--frozen-lockfile", "--offline", "--store-dir", path.join(root, ".pnpm-store")], { cwd: consumer, stdio: "inherit" });
run("pnpm", ["test"], { cwd: consumer, stdio: "inherit" });
console.log(`Verified packed Core in isolated workerd consumer at ${consumer}`);
