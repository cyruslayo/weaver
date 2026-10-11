// Proves docSnippets reads CRLF Markdown (a core.autocrlf=true checkout) exactly as it reads LF.
// Run by the root `test` script: node --test integration/package-consumer/doc-snippets.test.mjs

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { docSnippets } from "./doc-snippets.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCES = ["README.md", "docs/prompt-generation.md", "docs/debugging.md", "docs/custom-catalogs.md"];
const toCrlf = (text) => text.replace(/\r?\n/g, "\r\n");

/** A temp repository root holding the four Markdown sources, with the given text for each file. */
async function fixtureRoot(texts) {
  const root = await mkdtemp(path.join(os.tmpdir(), "doc-snippets-test-"));
  for (const file of SOURCES) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), texts[file]);
  }
  return root;
}

async function realTexts(transform) {
  const texts = {};
  for (const file of SOURCES) texts[file] = transform(await readFile(path.join(REPO_ROOT, file), "utf8"));
  return texts;
}

test("CRLF Markdown yields the same ts blocks as LF Markdown", async (t) => {
  const lfRoot = await fixtureRoot(await realTexts((text) => text));
  const crlfRoot = await fixtureRoot(await realTexts(toCrlf));
  t.after(() => Promise.all([rm(lfRoot, { recursive: true, force: true }), rm(crlfRoot, { recursive: true, force: true })]));

  const lf = await docSnippets(lfRoot);
  const crlf = await docSnippets(crlfRoot);
  assert.ok(lf.length > 0, "the LF fixture must yield snippets");
  assert.deepEqual(crlf, lf);
});

test("a CRLF custom-catalogs doc drops the from-marked block and keeps the runnable one", async (t) => {
  const texts = await realTexts((text) => text);
  texts["docs/custom-catalogs.md"] = toCrlf([
    "# Custom catalogs",
    "",
    "<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->",
    "```ts",
    "const quoted = 1;",
    "```",
    "",
    "```ts",
    "const runnable = 2;",
    "```",
    "",
  ].join("\n"));
  const root = await fixtureRoot(texts);
  t.after(() => rm(root, { recursive: true, force: true }));

  const customCatalogs = (await docSnippets(root)).filter((snippet) => snippet.name.startsWith("docs-custom-catalogs-"));
  assert.deepEqual(customCatalogs, [{ name: "docs-custom-catalogs-0.ts", source: "const runnable = 2;\n" }]);
});
