import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/*
 * Keeps docs/custom-catalogs.md honest about the cookbook. A ts block that starts with
 * `<!-- from: path -->` quotes cookbook source, and it must be a verbatim substring of the file it
 * cites. The doc's other ts blocks use only published APIs. integration/package-consumer/doc-snippets.mjs
 * compiles and runs them against the packed packages in `pnpm verify:packages`.
 *
 * To change a quoted block, change the cookbook file or the doc so that they match exactly.
 */

// This file runs from examples/cookbook/dist/custom-catalog, so four levels up is the repository root.
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DOC = "docs/custom-catalogs.md";
const MIN_QUOTED_BLOCKS = 10;
const QUOTED_BLOCK = /^<!-- from: (\S+) -->\n```ts\n([\s\S]*?)^```$/gm;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

test("the custom catalog doc quotes the expected number of cookbook blocks", () => {
  const doc = readFileSync(path.join(REPO_ROOT, DOC), "utf8");
  const quoted = [...doc.matchAll(QUOTED_BLOCK)];
  assert.ok(
    quoted.length >= MIN_QUOTED_BLOCKS,
    `${DOC} must quote at least ${MIN_QUOTED_BLOCKS} cookbook blocks with "<!-- from: path -->", found ${quoted.length}`,
  );
});

test("every block marked from: is a verbatim substring of the cookbook file it cites", () => {
  const doc = readFileSync(path.join(REPO_ROOT, DOC), "utf8");
  for (const match of doc.matchAll(QUOTED_BLOCK)) {
    const source = match[1]!;
    const code = match[2]!;
    const where = `${DOC}:${lineOf(doc, match.index ?? 0)}`;
    assert.ok(
      source.startsWith("examples/cookbook/"),
      `${where} cites ${source}. A quoted block must cite a file under examples/cookbook/.`,
    );
    const file = path.join(REPO_ROOT, source);
    assert.ok(existsSync(file), `${where} cites ${source}, which does not exist.`);
    const text = readFileSync(file, "utf8");
    const missing = code.split("\n").find((line) => line.length > 0 && !text.includes(line));
    assert.ok(
      text.includes(code),
      `${where} quotes ${source}, but the block is not a verbatim substring of that file. ` +
        `First line not found in ${source}: ${JSON.stringify(missing ?? code)}. ` +
        "Copy the cookbook code exactly, or update the citation.",
    );
  }
});
