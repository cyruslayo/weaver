// Extracts the TypeScript examples that the Prompt generation and Debugging docs
// show, so the packed-package check compiles and runs the text that readers copy.
// The docs stay the single source: nothing is copied into this folder by hand.
//
// Sources:
// - README.md: the ts block in the "### Prompt generation" section, which must
//   sit before "### Core only (any platform)".
// - docs/prompt-generation.md: every ts block in the file.
// - docs/debugging.md: every ts block in the file.
// - docs/custom-catalogs.md: every ts block that is NOT preceded by a
//   `<!-- from: path -->` line. A marked block quotes cookbook source, which
//   imports cookbook files and cannot compile here. The cookbook test
//   examples/cookbook/src/custom-catalog/customCatalogDoc.test.ts checks each
//   marked block as a verbatim substring of the file it cites.
// If the README section moves or loses its block, or a doc has fewer blocks
// than expected, extraction throws. A changed or broken example then fails
// `pnpm verify:packages` with the file name and the compiler or runtime output.
// Snippet names say where they came from: docs-prompt-generation-N.ts,
// docs-debugging-N.ts and docs-custom-catalogs-N.ts are the Nth runnable ts
// block of that doc, counting from 0.

import { readFile } from "node:fs/promises";
import path from "node:path";

/** Reads a UTF-8 text file with LF line endings. A CRLF checkout (core.autocrlf=true) must extract the same blocks. */
const readText = async (file) => (await readFile(file, "utf8")).replace(/\r\n/g, "\n");

const README_SECTION_START = "### Prompt generation";
const README_SECTION_END = "### Core only (any platform)";
const DOC_MIN_EXAMPLES = 3;
const DEBUGGING_MIN_EXAMPLES = 6;
const CUSTOM_CATALOGS_MIN_EXAMPLES = 1;
/** A ts block marked as quoting cookbook source. It is removed before extraction. */
const FROM_MARKED_BLOCK = /^<!-- from: \S+ -->\n```ts\n[\s\S]*?^```$/gm;

/** The bodies of the fenced ```ts blocks in `text`, in order. */
function tsBlocks(text) {
  return [...text.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
}

/**
 * @param {string} root repository root
 * @returns {Promise<{ name: string, source: string }[]>}
 */
export async function docSnippets(root) {
  const readme = await readText(path.join(root, "README.md"));
  const start = readme.indexOf(README_SECTION_START);
  const end = readme.indexOf(README_SECTION_END);
  if (start < 0 || end < start) {
    throw new Error(`README.md must contain "${README_SECTION_START}" before "${README_SECTION_END}"`);
  }
  const readmeBlocks = tsBlocks(readme.slice(start, end));
  if (readmeBlocks.length !== 1) {
    throw new Error(`README.md "${README_SECTION_START}" must contain exactly one ts block, found ${readmeBlocks.length}`);
  }

  const doc = await readText(path.join(root, "docs", "prompt-generation.md"));
  const docBlocks = tsBlocks(doc);
  if (docBlocks.length < DOC_MIN_EXAMPLES) {
    throw new Error(`docs/prompt-generation.md must contain at least ${DOC_MIN_EXAMPLES} ts blocks, found ${docBlocks.length}`);
  }

  const debugging = await readText(path.join(root, "docs", "debugging.md"));
  const debuggingBlocks = tsBlocks(debugging);
  if (debuggingBlocks.length < DEBUGGING_MIN_EXAMPLES) {
    throw new Error(`docs/debugging.md must contain at least ${DEBUGGING_MIN_EXAMPLES} ts blocks, found ${debuggingBlocks.length}`);
  }

  const customCatalogs = await readText(path.join(root, "docs", "custom-catalogs.md"));
  const customCatalogsBlocks = tsBlocks(customCatalogs.replace(FROM_MARKED_BLOCK, ""));
  if (customCatalogsBlocks.length < CUSTOM_CATALOGS_MIN_EXAMPLES) {
    throw new Error(`docs/custom-catalogs.md must contain at least ${CUSTOM_CATALOGS_MIN_EXAMPLES} runnable ts block, found ${customCatalogsBlocks.length}`);
  }

  return [
    ...readmeBlocks.map((source, index) => ({ name: `readme-prompt-generation-${index}.ts`, source })),
    ...docBlocks.map((source, index) => ({ name: `docs-prompt-generation-${index}.ts`, source })),
    ...debuggingBlocks.map((source, index) => ({ name: `docs-debugging-${index}.ts`, source })),
    ...customCatalogsBlocks.map((source, index) => ({ name: `docs-custom-catalogs-${index}.ts`, source })),
  ];
}
