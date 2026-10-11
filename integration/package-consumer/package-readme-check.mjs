// Runs the package README examples that can run without a host. The verifier writes them into the
// consumer's doc-snippets folder from packages/*/README.md (packageReadmeSnippets in doc-snippets.mjs).
//
// Usage (from the consumer folder): node --experimental-strip-types --no-warnings package-readme-check.mjs doc-snippets
//
// - pkg-core-readme-0.ts is the Worker example: its default export's fetch is called with a Request.
// - pkg-web-readme-0.ts is the browser example: it runs under happy-dom with an element whose id is "app".
// - pkg-mcp-readme-0.ts needs a connected MCP client, so the verifier only typechecks it.
// Each failure is printed with the snippet name, and the process exits 1.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const dir = path.resolve(process.argv[2] ?? "doc-snippets");
const load = (name) => import(pathToFileURL(path.join(dir, name)).href);

const window = new Window({ url: "https://package-readme.example/" });
const app = window.document.createElement("div");
app.id = "app";
window.document.body.append(app);
globalThis.document = window.document;

const steps = [
  ["pkg-core-readme-0.ts", async () => {
    const worker = await load("pkg-core-readme-0.ts");
    const response = await worker.default.fetch(new Request("https://worker.example/?name=Ada"));
    const body = JSON.stringify(await response.json());
    if (response.status !== 200 || !body.includes("Hello, Ada")) throw new Error(`status ${response.status}, body ${body}`);
  }],
  ["pkg-web-readme-0.ts", async () => {
    await load("pkg-web-readme-0.ts");
    if (!app.textContent.includes("Hello from Weaver")) throw new Error("the text was not rendered into #app");
  }],
];

let failures = 0;
for (const [name, run] of steps) {
  try {
    await run();
    console.log(`Package README example ok: ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`Package README example FAILED: ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failures > 0) process.exitCode = 1;
