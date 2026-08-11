import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = new URL("../", import.meta.url);
const sourceRoot = new URL("src/", packageRoot);
const repoRoot = new URL("../../", packageRoot);
const productionFiles = (root: URL, excludedDirectories: readonly string[] = []): string[] => {
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return excludedDirectories.includes(entry.name) ? [] : walk(path);
    return extname(path) === ".ts" && !path.endsWith(".test.ts") ? [path] : [];
  });
  return walk(fileURLToPath(root));
};
const genericCore = productionFiles(sourceRoot, ["basic-functions"]);
const text = (path: string) => readFileSync(path, "utf8");

test("generic Core has no Basic component branching or Web imports", () => {
  const names = "Text|Image|Icon|Video|AudioPlayer|Row|Column|List|Card|Tabs|Modal|Divider|Button|TextField|CheckBox|ChoicePicker|Slider|DateTimeInput";
  const coupling = new RegExp(`(?:component\\s*={2,3}|component\\s*!={1,2}|case\\s+|get\\s*\\(|set\\s*\\(|has\\s*\\()\\s*["'](?:${names})["']`);
  for (const path of genericCore) {
    const source = text(path);
    assert.doesNotMatch(source, coupling, relative(fileURLToPath(sourceRoot), path));
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()["'][^"']*(?:@weaver\/web|packages\/web|web\/src\/basic)[^"']*["']/, relative(fileURLToPath(sourceRoot), path));
  }
});

test("generic Core is browser-global and DOM-type independent", () => {
  const forbidden = /\b(?:window|document)\s*\.|\bHTMLElement\b|\bNode\s*(?:<|\||&|\[|;|,|\))/;
  for (const path of genericCore) {
    const source = text(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(source, forbidden, relative(fileURLToPath(sourceRoot), path));
  }
  const config = JSON.parse(readFileSync(new URL("tsconfig.json", packageRoot), "utf8")) as { compilerOptions?: { lib?: string[] } };
  assert.notEqual(config.compilerOptions?.lib?.some((lib) => /^dom(?:\.|$)/i.test(lib)), true);
});

test("production boundaries retain source-level security invariants", () => {
  const webRoot = new URL("packages/web/src/", repoRoot);
  const coreRoot = new URL("packages/core/src/", repoRoot);
  const web = productionFiles(webRoot);
  const core = productionFiles(coreRoot);
  const sinks = /\.(?:innerHTML|outerHTML)\b|\binsertAdjacentHTML\b|\bDOMParser\b|\bcreateContextualFragment\b|\bdocument\.write\b/;
  const dynamicCode = /\beval\s*\(|\bnew\s+Function\b/;
  for (const path of web) assert.doesNotMatch(text(path), sinks, relative(fileURLToPath(repoRoot), path));
  for (const path of [...core, ...web]) assert.doesNotMatch(text(path), dynamicCode, relative(fileURLToPath(repoRoot), path));
  for (const path of [...core, ...web]) assert.doesNotMatch(text(path), /(?:new\s+)?RegExp\s*\(\s*(?:agentPattern|pattern)\b/, relative(fileURLToPath(repoRoot), path));
});

test("package publication and dependency boundaries remain narrow", () => {
  for (const name of ["core", "web", "mcp"]) {
    const manifest = JSON.parse(readFileSync(new URL(`packages/${name}/package.json`, repoRoot), "utf8")) as { files?: string[]; exports?: Record<string, unknown>; dependencies?: Record<string, string> };
    assert.deepEqual(manifest.files, ["dist", "!dist/**/*.test.*", "!dist/**/*.test-helper.*"]);
    assert.deepEqual(Object.keys(manifest.exports ?? {}), ["."]);
    for (const dependency of Object.keys(manifest.dependencies ?? {})) assert.doesNotMatch(dependency, /react|vue|sanitize|markdown|date|regex|css|express/i);
  }
});
