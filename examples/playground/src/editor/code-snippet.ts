/**
 * Builds the "Copy as code" TypeScript snippet. The JSONL goes into a template literal,
 * so every character that a template literal would read is escaped: backslash,
 * backtick, the `${` opener, and carriage return (a template literal would normalize it).
 */

export interface CodeSnippetOptions {
  readonly surfaceId?: string;
  readonly attributionName?: string;
}

/** Escapes text so that it reads back unchanged inside a template literal. */
export function escapeTemplateLiteral(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\r/g, "\\r");
}

export function createCodeSnippet(jsonl: string, options: CodeSnippetOptions = {}): string {
  const surfaceId = options.surfaceId ?? "main";
  const attributionName = options.attributionName ?? "Playground Agent";
  return [
    'import { createA2UIV091StreamIngestion } from "@cylayo/weaver-core";',
    'import { createBasicWebRuntime } from "@cylayo/weaver-web";',
    "",
    "// The JSONL below is data from an agent, not code. Weaver validates each frame.",
    `const jsonl = \`${escapeTemplateLiteral(jsonl)}\`;`,
    "",
    "const created = createBasicWebRuntime({",
    "  basic: {",
    "    // Media is denied by default. Approve only URLs your application trusts.",
    "    resourcePolicy: () => undefined,",
    "  },",
    "  rendering: {",
    `    attributionProvider: () => ({ displayName: ${JSON.stringify(attributionName)} }),`,
    "    onServerEvent: (event) => console.log('Action', event.message.action.name),",
    "  },",
    "});",
    "if (!created.ok) throw new Error(`Web runtime configuration failed: ${created.error.code}`);",
    "const web = created.value;",
    "",
    "const ingestion = createA2UIV091StreamIngestion({ runtime: web.runtime });",
    "for (const event of [...ingestion.push(jsonl), ...ingestion.finish()]) {",
    "  if (!event.ok) console.error('Rejected frame', event.frame, event.error.code);",
    "}",
    "",
    "const mounted = web.mount({",
    `  surfaceId: ${JSON.stringify(surfaceId)},`,
    "  target: document.getElementById('app')!,",
    "});",
    "if (!mounted.ok) throw new Error(`Mount failed: ${mounted.error.code}`);",
    "",
  ].join("\n");
}
