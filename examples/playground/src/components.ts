import { WEAVER_CORE_VERSION } from "@cylayo/weaver-core";
import { benchMessages, BENCH_SURFACE_ID } from "./bench.js";
import { createInspectorWebRuntime } from "./runtime-factory.js";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Playground root element was not found");
app.dataset.coreVersion = WEAVER_CORE_VERSION;
const debug = document.createElement("pre");
debug.textContent = "Outbound events appear here.";

const created = createInspectorWebRuntime({
  attributionName: "Playground Agent",
  onServerEvent: (event) => {
    debug.textContent = JSON.stringify(event, null, 2);
  },
});
if (!created.ok) throw new Error("Playground Web runtime configuration failed");
const web = created.value;

for (const message of benchMessages(web.catalogId)) {
  const processed = web.runtime.process(message);
  if (!processed.ok) throw new Error(`Bench message was rejected: ${processed.error.code}`);
}

const mounted = web.mount({ surfaceId: BENCH_SURFACE_ID, target: app });
if (!mounted.ok) throw new Error(`Playground mount failed: ${mounted.error.code}`);
app.append(debug);
