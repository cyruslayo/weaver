import { WEAVER_CORE_VERSION } from "@weaver/core";
import { createWebRuntime } from "@weaver/web";

const runtime = createWebRuntime();
const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("Playground root element was not found");
}

app.innerHTML = `
  <h1>Weaver Playground</h1>
  <p>Core runtime: ${runtime.status}</p>
`;

app.dataset.coreVersion = WEAVER_CORE_VERSION;
