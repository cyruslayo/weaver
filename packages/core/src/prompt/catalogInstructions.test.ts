import assert from "node:assert/strict";
import { test } from "node:test";

import { demoteCatalogInstructionHeadings } from "./catalogInstructions.js";

test("ATX headings move one level deeper", () => {
  assert.equal(demoteCatalogInstructionHeadings("## Guide\n# Top\n### Deep"), "### Guide\n## Top\n#### Deep");
});

test("a ###### heading stays at six hashes", () => {
  assert.equal(demoteCatalogInstructionHeadings("###### Smallest"), "###### Smallest");
});

test("a heading inside a backtick fence is untouched", () => {
  const input = "## Before\n```md\n## Inside\n```\n## After";
  assert.equal(demoteCatalogInstructionHeadings(input), "### Before\n```md\n## Inside\n```\n### After");
});

test("a heading inside a tilde fence is untouched, and a shorter fence does not close a longer one", () => {
  const input = "~~~~\n```\n## Inside\n~~~\n## Still inside\n~~~~\n## Outside";
  assert.equal(demoteCatalogInstructionHeadings(input), "~~~~\n```\n## Inside\n~~~\n## Still inside\n~~~~\n### Outside");
});

test("text without headings is returned unchanged, and a hash without a space is not a heading", () => {
  assert.equal(demoteCatalogInstructionHeadings("#hashtag and plain text"), "#hashtag and plain text");
});
