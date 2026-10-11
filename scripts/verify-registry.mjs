// Verifies a published release from the public npm registry. It installs @cylayo/weaver-core,
// @cylayo/weaver-web and @cylayo/weaver-mcp at one exact version into a temporary consumer outside
// the workspace, then runs the packed-tarball checks against those registry installs:
//   - the TypeScript consumer (consumer.ts, strict NodeNext) and the ESM smoke (smoke.mjs),
//   - the README and docs snippets, including the README Quick Start examples,
//   - the Worker smoke: the workerd test in integration/workerd-consumer, against the registry Core.
// The consumer and Worker files are copied from integration/, not forked.
//
// Usage: pnpm verify:registry [version]
//   The default version is the one in packages/core/package.json.
//
// This script only reads the registry (npm install). It never publishes and never touches npm
// credentials. It is a manual check after a release is published, so it is not part of
// verify:packages and is not run by the CI workflow.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docSnippets, quickstartSnippets } from "../integration/package-consumer/doc-snippets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const consumerSource = path.join(root, "integration", "package-consumer");
const workerSource = path.join(root, "integration", "workerd-consumer");
const packageNames = ["@cylayo/weaver-core", "@cylayo/weaver-web", "@cylayo/weaver-mcp"];
// A freshly published version can take minutes to reach the registry, and a stale npm cache can
// report it missing for a while. --prefer-online plus a few retries covers both.
const INSTALL_ATTEMPTS = 4;
const INSTALL_RETRY_DELAY_MS = 20_000;

// The Worker test for the README Worker example. It is generated here, not copied, because it is
// the only Worker test that imports the README snippet.
const QUICKSTART_WORKER_TEST = `import worker from "./quickstart-worker.ts";
import { describe, expect, it } from "vitest";

describe("README Worker quick start in workerd", () => {
  it("serves the resolved surface for a request", async () => {
    const response = await worker.fetch(new Request("https://worker.example/?name=Ada"));
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain("Hello, Ada");
  });
});
`;

const fail = (message) => { throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const packagePath = (dir, name) => path.join(dir, "node_modules", ...name.split("/"));

/** Runs a command and returns its combined output. Throws, with the output, on a non-zero exit. */
function run(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) fail(`${label} failed (${command} ${args.join(" ")})\n${output}`);
  return output;
}

async function installedVersion(dir, name) {
  const manifest = JSON.parse(await readFile(path.join(packagePath(dir, name), "package.json"), "utf8"));
  return manifest.version;
}

/** npm install from the registry, retried. Throws with a clear message when the version never appears. */
async function installFromRegistry(dir, label, version) {
  let output = "";
  for (let attempt = 1; attempt <= INSTALL_ATTEMPTS; attempt += 1) {
    const result = spawnSync("npm", ["install", "--prefer-online", "--no-audit", "--no-fund"], {
      cwd: dir, encoding: "utf8", shell: process.platform === "win32",
    });
    output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status === 0) {
      console.log(`${label}: npm install from the registry succeeded (attempt ${attempt} of ${INSTALL_ATTEMPTS})`);
      return;
    }
    if (attempt < INSTALL_ATTEMPTS) {
      console.log(`${label}: attempt ${attempt} of ${INSTALL_ATTEMPTS} failed; retrying in ${INSTALL_RETRY_DELAY_MS / 1000}s`);
      await sleep(INSTALL_RETRY_DELAY_MS);
    }
  }
  if (/No matching version|ETARGET/.test(output)) {
    fail(`Version ${version} is not on the npm registry for ${packageNames.join(", ")} (npm reported "No matching version" after ${INSTALL_ATTEMPTS} attempts). Check the version, or wait for the publish to appear.\n${output}`);
  }
  fail(`${label}: npm install from the registry failed after ${INSTALL_ATTEMPTS} attempts.\n${output}`);
}

async function main() {
  if (process.argv.length > 3) fail("Usage: pnpm verify:registry [version]");
  const coreManifest = JSON.parse(await readFile(path.join(root, "packages", "core", "package.json"), "utf8"));
  const version = process.argv[2] ?? coreManifest.version;
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) fail(`Not an exact version: ${version}`);
  console.log(`Verifying ${packageNames.join(", ")} at ${version} from the npm registry`);

  const temp = await mkdtemp(path.join(os.tmpdir(), "weaver-registry-verification-"));

  // 1. TypeScript consumer and ESM smoke, against the registry installs.
  const consumer = path.join(temp, "consumer");
  await mkdir(consumer);
  for (const file of ["consumer.ts", "smoke.mjs", "quickstart-check.mjs", "tsconfig.json", "tsconfig.doc-snippets.json"]) {
    await cp(path.join(consumerSource, file), path.join(consumer, file));
  }
  const consumerManifest = JSON.parse(await readFile(path.join(consumerSource, "package.json"), "utf8"));
  consumerManifest.dependencies = Object.fromEntries(packageNames.map((name) => [name, version]));
  await writeFile(path.join(consumer, "package.json"), `${JSON.stringify(consumerManifest, null, 2)}\n`);
  await installFromRegistry(consumer, "Consumer", version);
  for (const name of packageNames) {
    const installed = await installedVersion(consumer, name);
    if (installed !== version) fail(`Consumer installed ${name}@${installed}, expected ${version}`);
  }
  // Web and MCP must share the top-level Core instance, not carry a nested copy.
  for (const name of packageNames.slice(1)) {
    if (existsSync(path.join(packagePath(consumer, name), "node_modules", "@cylayo", "weaver-core"))) {
      fail(`${name} carries a nested copy of @cylayo/weaver-core; expected one Core instance`);
    }
  }
  for (const dependency of ["client", "server"]) {
    if (!existsSync(path.join(consumer, "node_modules", "@modelcontextprotocol", dependency, "package.json"))) {
      fail(`MCP runtime dependency missing: @modelcontextprotocol/${dependency}`);
    }
  }
  console.log(run("npm", ["run", "typecheck"], consumer, "TypeScript consumer typecheck"));
  console.log(run("npm", ["run", "smoke"], consumer, "ESM consumer smoke"));

  // 2. README and docs snippets, the same as verify:packages, read from this checkout's docs.
  const snippetDir = path.join(consumer, "doc-snippets");
  await mkdir(snippetDir);
  const snippets = await docSnippets(root);
  const quickstart = await quickstartSnippets(root);
  for (const snippet of [...snippets, ...quickstart]) await writeFile(path.join(snippetDir, snippet.name), snippet.source);
  const tsc = path.join(consumer, "node_modules", "typescript", "bin", "tsc");
  run(process.execPath, [tsc, "-p", "tsconfig.doc-snippets.json"], consumer, "Documentation snippets typecheck");
  for (const snippet of snippets) {
    run(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join("doc-snippets", snippet.name)], consumer, `Documentation snippet ${snippet.name}`);
  }
  console.log(run(process.execPath, ["--experimental-strip-types", "--no-warnings", "quickstart-check.mjs", "doc-snippets"], consumer, "README Quick Start examples").trimEnd());
  console.log(`Ran ${snippets.length} documentation snippets and ${quickstart.length} Quick Start examples against the registry installs`);

  // 3. Worker smoke: the workerd test of integration/workerd-consumer, with Core from the registry.
  const worker = path.join(temp, "worker");
  await mkdir(worker);
  for (const file of ["vitest.config.js", "worker.test.js"]) await cp(path.join(workerSource, file), path.join(worker, file));
  // The README Worker example runs inside workerd as well, from the snippet written above.
  await cp(path.join(snippetDir, "quickstart-worker.ts"), path.join(worker, "quickstart-worker.ts"));
  await writeFile(path.join(worker, "quickstart.test.js"), QUICKSTART_WORKER_TEST);
  const workerManifest = JSON.parse(await readFile(path.join(workerSource, "package.json"), "utf8"));
  workerManifest.dependencies = { "@cylayo/weaver-core": version };
  await writeFile(path.join(worker, "package.json"), `${JSON.stringify(workerManifest, null, 2)}\n`);
  await installFromRegistry(worker, "Worker consumer", version);
  const workerCore = await installedVersion(worker, "@cylayo/weaver-core");
  if (workerCore !== version) fail(`Worker consumer installed @cylayo/weaver-core@${workerCore}, expected ${version}`);
  console.log(run("npm", ["test"], worker, "Worker smoke in workerd"));

  console.log(`Verified ${packageNames.join(", ")} at ${version} from the npm registry. Consumer: ${consumer}. Worker: ${worker}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
