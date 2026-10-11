// Runs the three README Quick Start examples. The verifier writes them into the consumer's
// doc-snippets folder from README.md (see quickstartSnippets in doc-snippets.mjs), next to this file.
//
// Usage (from the consumer folder): node --experimental-strip-types --no-warnings quickstart-check.mjs doc-snippets
//
// - Browser example: runs against happy-dom with an element whose id is "app", so it checks that the
//   text was rendered into the page.
// - Worker example: its default export's fetch is called with a Request, and the response is checked.
// - Deterministic example: loads and checks itself (it throws when the canned response is not applied).
// Each failure is printed with the snippet name, and the process exits 1.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const dir = path.resolve(process.argv[2] ?? "doc-snippets");
const load = (name) => import(pathToFileURL(path.join(dir, name)).href);

const window = new Window({ url: "https://quickstart.example/" });
const app = window.document.createElement("div");
app.id = "app";
window.document.body.append(app);
globalThis.document = window.document;

const steps = [
  ["quickstart-browser.ts", async () => {
    await load("quickstart-browser.ts");
    if (!app.textContent.includes("Hello from Weaver")) throw new Error("the text was not rendered into #app");
  }],
  ["quickstart-worker.ts", async () => {
    const worker = await load("quickstart-worker.ts");
    const response = await worker.default.fetch(new Request("https://worker.example/?name=Ada"));
    const body = JSON.stringify(await response.json());
    if (response.status !== 200 || !body.includes("Hello, Ada")) throw new Error(`status ${response.status}, body ${body}`);
  }],
  ["quickstart-deterministic.ts", async () => {
    await load("quickstart-deterministic.ts");
  }],
];

let failures = 0;
for (const [name, run] of steps) {
  try {
    await run();
    console.log(`Quick Start ok: ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`Quick Start FAILED: ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failures > 0) process.exitCode = 1;
