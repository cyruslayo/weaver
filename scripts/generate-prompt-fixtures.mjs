#!/usr/bin/env node

// Golden model-prompt fixtures for the canonical A2UI v0.9.1 Basic Catalog.
//
// It generates the prompts from the same config the Core test uses
// (packages/core/src/prompt/basicPromptFixtures.test-helper.ts) and writes:
//
//   packages/core/src/prompt/fixtures/basic-catalog.create.prompt.txt
//   packages/core/src/prompt/fixtures/basic-catalog.edit.prompt.txt
//
// Run with --check to fail when the committed fixtures are stale. Any change to
// the Basic catalog, its descriptions, its functions, the examples or the prompt
// generator then shows up as a fixture diff in review.
//
// Why this script builds Core and Web itself: it imports their compiled `dist`
// output, and `dist` is not rebuilt by editing a source file. Without a build
// step, `--check` could pass on a stale prompt after a Basic description changed.
// `check:generated` runs before `typecheck` and `build` in CI, so reordering the
// steps would not fix it. Building here keeps the check self-contained. Web is
// built too, because the openUrl registration comes from `@cylayo/weaver-web`.
//
// The cookbook form prompt (examples/cookbook/src/screens/form/prompt.txt) is not
// generated here. It uses the cookbook's own functions and actions, and its
// existing test (`prompt.txt is the generated prompt for this screen`) already
// fails when the file is stale.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.join(root, "packages", "core");
const webDir = path.join(root, "packages", "web");
const fixturesDir = path.join(coreDir, "src", "prompt", "fixtures");
const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");

// Build Core first. Web's dist imports @cylayo/weaver-core.
for (const dir of [coreDir, webDir]) {
  execFileSync(process.execPath, [tsc, "-p", path.join(dir, "tsconfig.json")], { stdio: "inherit" });
}

const { generateA2UIV091Prompt, A2UI_V091_BASIC_CATALOG_ID } = await import(
  pathToFileURL(path.join(coreDir, "dist", "index.js")).href
);
const { createBasicCatalogBrowserFunctionImplementations } = await import(
  pathToFileURL(path.join(webDir, "dist", "index.js")).href
);
const { basicPromptFixtureConfigs, BASIC_PROMPT_FIXTURE_FILES } = await import(
  pathToFileURL(path.join(coreDir, "dist", "prompt", "basicPromptFixtures.test-helper.js")).href
);

const configs = basicPromptFixtureConfigs(
  createBasicCatalogBrowserFunctionImplementations({ catalogId: A2UI_V091_BASIC_CATALOG_ID }),
);

/** Each fixture is the generated text plus one trailing newline. */
const fixtures = new Map();
for (const [mode, file] of Object.entries(BASIC_PROMPT_FIXTURE_FILES)) {
  const result = generateA2UIV091Prompt(configs[mode]);
  if (!result.ok) {
    process.stderr.write(`Basic prompt fixture "${mode}" failed to generate: ${result.error.code}: ${result.error.message}\n`);
    process.exit(1);
  }
  fixtures.set(path.join(fixturesDir, file), `${result.value.text}\n`);
}

if (process.argv.includes("--check")) {
  const stale = [...fixtures].filter(([file, expected]) => {
    try {
      return readFileSync(file, "utf8").replace(/\r\n/g, "\n") !== expected;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    const names = stale.map(([file]) => path.relative(root, file)).join(", ");
    process.stderr.write(`Basic prompt fixtures are stale: ${names}; run scripts/generate-prompt-fixtures.mjs\n`);
    process.exit(1);
  }
  process.stdout.write("Basic prompt fixtures are up to date.\n");
} else {
  mkdirSync(fixturesDir, { recursive: true });
  for (const [file, text] of fixtures) {
    writeFileSync(file, text);
    process.stdout.write(`Wrote ${path.relative(root, file)}\n`);
  }
}
