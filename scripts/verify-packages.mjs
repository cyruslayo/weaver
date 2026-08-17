import { cp, mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "0.1.2";
const specs = [
  { dir: "core", name: "@weaver/core", file: `weaver-core-${version}.tgz` },
  { dir: "web", name: "@weaver/web", file: `weaver-web-${version}.tgz` },
  { dir: "mcp", name: "@weaver/mcp", file: `weaver-mcp-${version}.tgz` },
];
const fail = (message) => { throw new Error(message); };
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32", ...options });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result.stdout;
};
const tarList = (archive) => run("tar", ["-tzf", archive]).trim().split(/\r?\n/).sort();
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
  const forbiddenFile = files.find((file) => /(^|\/)(src|tests?|fixtures|coverage|node_modules|docs\/references|playground)(\/|$)|\.test(?:-helper)?\.|pnpm-lock\.yaml|tsconfig\.json$/i.test(file));
  if (forbiddenFile) fail(`${spec.file}: unexpected file ${forbiddenFile}`);

  const extractDir = path.join(extractedRoot, spec.dir);
  await mkdir(extractDir);
  run("tar", ["-xzf", archive, "-C", extractDir]);
  const packageDir = path.join(extractDir, "package");
  const manifestText = await readFile(path.join(packageDir, "package.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  if (manifest.name !== spec.name || manifest.version !== version) fail(`${spec.file}: incorrect packed identity`);
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
  run("tar", ["-xzf", secondArchive, "-C", secondExtract, "package/package.json"]);
  const secondManifest = await readFile(path.join(secondExtract, "package", "package.json"), "utf8");
  if (manifestText !== secondManifest) fail(`${spec.file}: repack manifest changed`);
}

const artifactFiles = (await readdir(path.join(root, "artifacts"))).filter((file) => file.endsWith(".tgz")).sort();
if (JSON.stringify(artifactFiles) !== JSON.stringify(specs.map((spec) => spec.file).sort())) fail(`Expected exactly three artifacts; found ${artifactFiles.join(", ")}`);

const consumer = path.join(temp, "consumer");
await mkdir(consumer);
for (const file of ["consumer.ts", "smoke.mjs", "tsconfig.json"]) await cp(path.join(root, "integration", "package-consumer", file), path.join(consumer, file));
for (const spec of specs) await cp(path.join(root, "artifacts", spec.file), path.join(consumer, spec.file));
const fixtureManifest = JSON.parse(await readFile(path.join(root, "integration", "package-consumer", "package.json"), "utf8"));
for (const spec of specs) fixtureManifest.dependencies[spec.name] = `file:./${spec.file}`;
await writeFile(path.join(consumer, "package.json"), `${JSON.stringify(fixtureManifest, null, 2)}\n`);
run("pnpm", ["install", "--ignore-workspace"], { cwd: consumer, stdio: "pipe" });
run("pnpm", ["run", "typecheck"], { cwd: consumer, stdio: "pipe" });
run("pnpm", ["run", "smoke"], { cwd: consumer, stdio: "pipe" });
const installedCore = JSON.parse(await readFile(path.join(consumer, "node_modules", "@weaver", "core", "package.json"), "utf8"));
if (installedCore.version !== version) fail(`Consumer installed Core ${installedCore.version}`);
const storeEntries = await readdir(path.join(consumer, "node_modules", ".pnpm"));
const coreCopies = storeEntries.filter((entry) => entry.startsWith(`@weaver+core@`));
if (coreCopies.length !== 1) fail(`Expected one Core package instance, found ${coreCopies.length}`);
for (const dependency of ["client", "server"]) {
  if (!storeEntries.some((entry) => entry.startsWith(`@modelcontextprotocol+${dependency}@2.0.0`))) fail(`MCP runtime dependency missing: @modelcontextprotocol/${dependency}`);
}
console.log(`Verified ${specs.length} tarballs and isolated consumer at ${temp}`);
