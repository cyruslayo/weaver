import assert from "node:assert/strict";
import { test } from "node:test";
import { createCodeSnippet, escapeTemplateLiteral } from "./code-snippet.js";

/**
 * Reads back the template literal that the snippet declares. The test evaluates only the
 * escaped literal body, to check the escaping round-trips. The product code never evaluates.
 */
function readTemplateLiteral(body: string): string {
  return new Function(`return \`${body}\`;`)() as string;
}

const TRICKY = "line one `tick` and ${interpolated} and \\ backslash\r\nline two \\${escaped}";

test("escapeTemplateLiteral reads back unchanged inside a template literal", () => {
  assert.equal(readTemplateLiteral(escapeTemplateLiteral(TRICKY)), TRICKY);
  assert.equal(readTemplateLiteral(escapeTemplateLiteral("")), "");
});

test("escapeTemplateLiteral escapes the characters a template literal would read", () => {
  const escaped = escapeTemplateLiteral("`${a}`\\\r");
  assert.equal(escaped.includes("\r"), false);
  assert.equal(escaped, "\\`\\${a}\\`\\\\\\r");
});

test("the snippet embeds the JSONL as one template literal that reads back exactly", () => {
  const opener = "const jsonl = `";
  const closer = "`;\n\nconst created";
  const snippet = createCodeSnippet(TRICKY);
  const start = snippet.indexOf(opener);
  const end = snippet.indexOf(closer);
  assert.ok(start >= 0 && end > start, "the jsonl declaration is present");
  // Raw newlines stay inside the literal, so the JSONL reads the way it was written.
  const body = snippet.slice(start + opener.length, end);
  assert.equal(readTemplateLiteral(body), TRICKY);
});

test("the snippet uses the runtime and ingestion the Playground documents", () => {
  const snippet = createCodeSnippet("{}");
  assert.match(snippet, /import \{ createBasicWebRuntime \} from "@cylayo\/weaver-web";/);
  assert.match(snippet, /import \{ createA2UIV091StreamIngestion \} from "@cylayo\/weaver-core";/);
  assert.match(snippet, /surfaceId: "main"/);
  assert.match(snippet, /resourcePolicy: \(\) => undefined/);
});

test("the surface id and attribution name are written as JSON string literals", () => {
  const snippet = createCodeSnippet("{}", { surfaceId: 'quote"id', attributionName: "Name" });
  assert.match(snippet, /surfaceId: "quote\\"id"/);
  assert.match(snippet, /displayName: "Name"/);
});
