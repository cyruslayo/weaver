import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { A2UI_V091_BASIC_CATALOG_ID } from "../basic-catalog/index.js";
import type { FunctionRegistration } from "../functions/index.js";
import {
  BASIC_PROMPT_FIXTURE_FILES,
  basicPromptFixtureConfigs,
  type BasicPromptFixtureMode,
} from "./basicPromptFixtures.test-helper.js";
import { generateA2UIV091Prompt } from "./index.js";

// This test runs from dist/prompt/, so the package root is two levels up.
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

/** Stand-in for the web openUrl registration. Core cannot import @cylayo/weaver-web. */
const openUrlStandIn: FunctionRegistration = {
  catalogId: A2UI_V091_BASIC_CATALOG_ID,
  name: "openUrl",
  effect: "action",
  implementation: () => undefined,
};

const BASIC_FUNCTIONS = [
  "required", "regex", "length", "numeric", "email", "formatString",
  "formatNumber", "formatCurrency", "formatDate", "pluralize", "openUrl",
  "and", "or", "not",
];

function fixturePath(mode: BasicPromptFixtureMode): string {
  return path.join(packageRoot, "src", "prompt", "fixtures", BASIC_PROMPT_FIXTURE_FILES[mode]);
}

function generated(mode: BasicPromptFixtureMode): string {
  const result = generateA2UIV091Prompt(basicPromptFixtureConfigs([openUrlStandIn])[mode]);
  assert.equal(result.ok, true, `prompt generation failed: ${JSON.stringify(result.ok ? null : result.error)}`);
  if (!result.ok) throw new Error("unreachable");
  return result.value.text;
}

for (const mode of ["create", "edit"] as const) {
  test(`the ${mode} fixture is byte-for-byte the generated Basic Catalog prompt`, () => {
    const onDisk = readFileSync(fixturePath(mode), "utf8");
    assert.equal(
      onDisk,
      `${generated(mode)}\n`,
      "stale fixture: run `node scripts/generate-prompt-fixtures.mjs`",
    );
  });
}

test("the fixtures list all 14 Basic functions and the sample action", () => {
  const text = readFileSync(fixturePath("create"), "utf8");
  for (const name of BASIC_FUNCTIONS) {
    assert.ok(text.includes(`- \`${name}\` returns `), `${name} is listed`);
  }
  assert.ok(text.includes("- `submit_signup`: Submit the sign-up form."));
});

test("the fixtures carry no JSON-Schema noise such as $ref, $defs or upstream schema file names", () => {
  for (const mode of ["create", "edit"] as const) {
    const text = readFileSync(fixturePath(mode), "utf8");
    for (const token of ["$ref", "$defs", "$id", "$schema", "basic_functions.json", "common_types.json", "#/"]) {
      assert.ok(!text.includes(token), `${mode} fixture contains ${token}`);
    }
  }
});

test("only the edit fixture has the edit-mode section", () => {
  // Anchored to a line start: the shipped example heading "### Edit mode: ..." also contains the substring.
  const section = /^## Edit mode$/m;
  assert.match(readFileSync(fixturePath("edit"), "utf8"), section);
  assert.doesNotMatch(readFileSync(fixturePath("create"), "utf8"), section);
});
