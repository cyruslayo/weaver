import { cp, mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => { throw new Error(message); };
const parseJson = (text, label) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};
const packageDirs = ["core", "web", "mcp"];
const expectedNames = { core: "@weaver/core", web: "@weaver/web", mcp: "@weaver/mcp" };
const packageManifests = Object.fromEntries(await Promise.all(packageDirs.map(async (dir) => [
  dir,
  parseJson(await readFile(path.join(root, "packages", dir, "package.json"), "utf8"), `${dir}/package.json`),
])));
const version = packageManifests.core.version;
if (version !== "0.2.0") fail(`Expected Core release version 0.2.0, found ${version}`);
for (const dir of packageDirs) {
  if (packageManifests[dir].name !== expectedNames[dir]) fail(`${dir} package identity is incorrect`);
  if (packageManifests[dir].version !== version) fail(`${dir} package version is not synchronized at ${version}`);
}
const specs = packageDirs.map((dir) => ({
  dir,
  name: packageManifests[dir].name,
  file: `${packageManifests[dir].name.replace("@weaver/", "weaver-")}-${packageManifests[dir].version}.tgz`,
}));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32", ...options });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result.stdout;
};
const tarCommand = process.platform === "win32"
  ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
  : "tar";
if (process.platform === "win32") {
  await stat(tarCommand).catch(() => fail(`Native Windows tar is unavailable: ${tarCommand}`));
  console.log(`Package verifier tar: ${tarCommand}`);
}
const runTar = (args) => run(tarCommand, args, { shell: false });
const tarList = (archive) => runTar(["-tzf", archive]).trim().split(/\r?\n/).sort();
const rootLicense = await readFile(path.join(root, "LICENSE"));
const dependencyValues = (manifest) => Object.values({
  ...manifest.dependencies,
  ...manifest.peerDependencies,
  ...manifest.optionalDependencies,
  ...manifest.devDependencies,
});

const temp = await mkdtemp(path.join(os.tmpdir(), "weaver-package-verification-"));
const extractedRoot = path.join(temp, "extracted");
const secondPackRoot = path.join(temp, "second-pack");
await mkdir(extractedRoot);
await mkdir(secondPackRoot);

for (const spec of specs) {
  const archive = path.join(root, "artifacts", spec.file);
  await stat(archive).catch(() => fail(`Missing artifact: ${spec.file}`));
  const files = tarList(archive);
  if (!files.includes("package/package.json") || !files.includes("package/dist/index.js") || !files.includes("package/dist/index.d.ts")) fail(`${spec.file}: required publication files missing`);
  if (!files.includes("package/LICENSE")) fail(`${spec.file}: project LICENSE file missing`);
  if (spec.dir === "core" && !files.includes("package/THIRD_PARTY_LICENSES.txt")) fail(`${spec.file}: required A2UI third-party license file missing`);
  const forbiddenFile = files.find((file) => /(^|\/)(src|tests?|fixtures|coverage|node_modules|docs\/references|playground)(\/|$)|\.test(?:-helper)?\.|pnpm-lock\.yaml|tsconfig\.json$/i.test(file));
  if (forbiddenFile) fail(`${spec.file}: unexpected file ${forbiddenFile}`);

  const extractDir = path.join(extractedRoot, spec.dir);
  await mkdir(extractDir);
  runTar(["-xzf", archive, "-C", extractDir]);
  const packageDir = path.join(extractDir, "package");
  const manifestText = await readFile(path.join(packageDir, "package.json"), "utf8");
  const manifest = parseJson(manifestText, `${spec.file} package.json`);
  if (manifest.name !== spec.name || manifest.version !== version) fail(`${spec.file}: incorrect packed identity`);
  if (manifest.license !== "Apache-2.0") fail(`${spec.file}: incorrect license metadata`);
  const packageLicense = await readFile(path.join(packageDir, "LICENSE"));
  if (!packageLicense.equals(rootLicense)) fail(`${spec.file}: package/LICENSE differs from root LICENSE`);
  if (spec.dir === "core") {
    const thirdParty = await readFile(path.join(packageDir, "THIRD_PARTY_LICENSES.txt"), "utf8");
    if (thirdParty === rootLicense.toString("utf8") || !thirdParty.includes("A2UI v0.9.1 Basic Catalog")) fail(`${spec.file}: third-party provenance material is missing or conflated`);
  }
  if (spec.dir !== "core" && manifest.peerDependencies?.["@weaver/core"] !== "0.2.x") fail(`${spec.file}: Core peer range is not 0.2.x`);
  for (const value of dependencyValues(manifest)) {
    if (typeof value === "string" && /^(workspace:|link:|file:)|(^|[\\/])\.\.([\\/]|$)|^[A-Za-z]:[\\/]|^\//.test(value)) fail(`${spec.file}: local dependency leaked: ${value}`);
  }
  for (const target of [manifest.types, manifest.exports?.["."]?.types, manifest.exports?.["."]?.import]) {
    if (typeof target !== "string") fail(`${spec.file}: export target missing from manifest`);
    await stat(path.join(packageDir, target)).catch(() => fail(`${spec.file}: export target absent: ${target}`));
  }
  for (const file of files.filter((file) => /package\/dist\/.*\.(?:js|d\.ts)$/.test(file))) {
    const text = await readFile(path.join(extractDir, file), "utf8");
    if (/packages[\\/].*[\\/]src|\.\.\/\.\.\/src|@weaver\/[^"']+\/src|docs\/references|Zynra/i.test(text)) fail(`${spec.file}: source/reference path leaked in ${file}`);
    if (file.endsWith(".js") && /(?:from\s+|import\()["'][^"']*(?:packages[\\/].*[\\/]src|\.\.\/\.\.\/src)/.test(text)) fail(`${spec.file}: runtime source import leaked in ${file}`);
    if (/(?:NPM_TOKEN|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|password\s*[:=]\s*["'][^"']+)/i.test(text)) fail(`${spec.file}: credential-like material found in ${file}`);
  }

  run("pnpm", ["pack", "--pack-destination", secondPackRoot], { cwd: path.join(root, "packages", spec.dir) });
  const secondArchive = path.join(secondPackRoot, spec.file);
  const secondFiles = tarList(secondArchive);
  if (JSON.stringify(files) !== JSON.stringify(secondFiles)) fail(`${spec.file}: repack file list changed`);
  const secondExtract = path.join(temp, `second-${spec.dir}`);
  await mkdir(secondExtract);
  runTar(["-xzf", secondArchive, "-C", secondExtract, "package/package.json"]);
  const secondManifest = await readFile(path.join(secondExtract, "package", "package.json"), "utf8");
  if (manifestText !== secondManifest) fail(`${spec.file}: repack manifest changed`);
}

const artifactFiles = (await readdir(path.join(root, "artifacts"))).filter((file) => file.endsWith(".tgz")).sort();
if (JSON.stringify(artifactFiles) !== JSON.stringify(specs.map((spec) => spec.file).sort())) fail(`Expected exactly three artifacts; found ${artifactFiles.join(", ")}`);

const consumer = path.join(temp, "consumer");
await mkdir(consumer);
for (const file of ["consumer.ts", "smoke.mjs", "tsconfig.json"]) await cp(path.join(root, "integration", "package-consumer", file), path.join(consumer, file));
for (const spec of specs) await cp(path.join(root, "artifacts", spec.file), path.join(consumer, spec.file));
const fixtureManifest = parseJson(await readFile(path.join(root, "integration", "package-consumer", "package.json"), "utf8"), "package consumer fixture package.json");
for (const spec of specs) fixtureManifest.dependencies[spec.name] = `file:./${spec.file}`;
await writeFile(path.join(consumer, "package.json"), `${JSON.stringify(fixtureManifest, null, 2)}\n`);
run("pnpm", ["install", "--ignore-workspace"], { cwd: consumer, stdio: "pipe" });
run("pnpm", ["run", "typecheck"], { cwd: consumer, stdio: "pipe" });
run("pnpm", ["run", "smoke"], { cwd: consumer, stdio: "pipe" });
const installedCore = parseJson(await readFile(path.join(consumer, "node_modules", "@weaver", "core", "package.json"), "utf8"), "installed Core package.json");
if (installedCore.version !== version) fail(`Consumer installed Core ${installedCore.version}`);
const storeEntries = await readdir(path.join(consumer, "node_modules", ".pnpm"));
const coreCopies = storeEntries.filter((entry) => entry.startsWith(`@weaver+core@`));
if (coreCopies.length !== 1) fail(`Expected one Core package instance, found ${coreCopies.length}`);
for (const dependency of ["client", "server"]) {
  if (!storeEntries.some((entry) => entry.startsWith(`@modelcontextprotocol+${dependency}@2.0.0`))) fail(`MCP runtime dependency missing: @modelcontextprotocol/${dependency}`);
}
console.log(`Verified ${specs.length} tarballs and isolated consumer at ${temp}`);
