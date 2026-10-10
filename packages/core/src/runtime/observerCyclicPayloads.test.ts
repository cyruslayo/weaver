import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { before, test } from "node:test";

/*
 * The observer copies caller payloads. Before the guard, a cyclic payload made
 * the copy loop without end, so an observed runtime ran out of memory. These
 * tests run the scenario in a child process with a small heap and a hard
 * timeout, so a regression fails fast and never hangs the suite.
 */

const CHILD = `
const core = await import(process.argv[1]);
const CAT = core.A2UI_V091_BASIC_CATALOG_ID;
const now = () => new Date("2026-01-01T00:00:00.000Z");

function run(withObserver) {
  const events = [];
  const created = core.createWeaverRuntime({
    catalogs: [core.createBasicCatalogV091Registration()],
    now,
    ...(withObserver ? { observer: (event) => events.push(event) } : {}),
  });
  if (!created.ok) throw new Error("runtime was not created");
  const runtime = created.value;
  runtime.process({ version: "v0.9.1", createSurface: { surfaceId: "s", catalogId: CAT } });
  runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: "s", components: [
    { id: "root", component: "Column", children: ["btn", "field"] },
    { id: "btn", component: "Button", child: "label", action: { event: { name: "go", context: {} } } },
    { id: "label", component: "Text", text: "Go" },
    { id: "field", component: "TextField", label: "Name", value: { path: "/name" } },
  ] } });
  const cyclic = {};
  cyclic.self = cyclic;
  const out = {};
  out.processCyclic = runtime.process(cyclic);
  out.dispatchUnknownCyclic = runtime.dispatchAction({ surfaceId: "missing", sourceComponentId: "btn", scopePath: "/", actionProperty: "action", extra: cyclic });
  out.dispatchOkCyclic = runtime.dispatchAction({ surfaceId: "s", sourceComponentId: "btn", scopePath: "/", actionProperty: "action", extra: cyclic });
  out.dispatchOkJsonExtra = runtime.dispatchAction({ surfaceId: "s", sourceComponentId: "btn", scopePath: "/", actionProperty: "action", extra: { a: 1 } });
  out.writeCyclic = runtime.writeInput({ surfaceId: "s", sourceComponentId: "field", scopePath: "/", property: "value", value: cyclic });
  out.writeOk = runtime.writeInput({ surfaceId: "s", sourceComponentId: "field", scopePath: "/", property: "value", value: "Ada" });
  return { out, events };
}

const without = run(false);
const observed = run(true);
process.stdout.write(JSON.stringify({ without: without.out, observed: observed.out, events: observed.events }));
`;

interface ChildReport {
  without: Record<string, unknown>;
  observed: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
}

function runChild(): ChildReport {
  const moduleUrl = new URL("../index.js", import.meta.url).href;
  const started = Date.now();
  const child = spawnSync(
    process.execPath,
    ["--max-old-space-size=128", "--input-type=module", "-e", CHILD, moduleUrl],
    { encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024 * 1024 },
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(2);
  if (child.error !== undefined || child.status !== 0) {
    const reason = child.error?.message ?? `exit status ${child.status}, signal ${child.signal}`;
    assert.fail(
      `observer child process did not finish in ${seconds} s (${reason}). ` +
        "A cyclic payload was copied by the observer without a JSON-safety check.",
    );
  }
  return JSON.parse(child.stdout) as ChildReport;
}

let report: ChildReport;
before(() => {
  report = runChild();
});

test("an observed runtime returns exactly what an unobserved runtime returns for cyclic payloads", () => {
  assert.equal(JSON.stringify(report.observed), JSON.stringify(report.without));
  assert.equal((report.without.dispatchUnknownCyclic as { ok: boolean }).ok, false);
  assert.equal((report.without.dispatchOkCyclic as { ok: boolean }).ok, true);
});

test("a cyclic message input is delivered as the unserializable marker", () => {
  const event = report.events.find((candidate) => candidate.kind === "message" && (candidate.result as { ok: boolean }).ok === false);
  assert.deepEqual(event?.input, { unserializable: true });
});

test("a cyclic input value is delivered as the unserializable marker", () => {
  const event = report.events.find((candidate) => candidate.kind === "input" && (candidate.result as { ok: boolean }).ok === false);
  assert.deepEqual((event?.request as { value: unknown }).value, { unserializable: true });
});

test("a cyclic action request is delivered reduced to its four typed fields, on failure and on success", () => {
  const actions = report.events.filter((candidate) => candidate.kind === "action");
  assert.equal(actions.length, 3, "one action event for each dispatch");
  for (const event of actions.slice(0, 2)) {
    assert.deepEqual(Object.keys(event.request as object).sort(), ["actionProperty", "scopePath", "sourceComponentId", "surfaceId"]);
    assert.equal((event.request as { sourceComponentId: string }).sourceComponentId, "btn");
  }
  assert.equal((actions[0]!.result as { ok: boolean }).ok, false);
  assert.equal((actions[1]!.result as { ok: boolean }).ok, true);
});

test("a JSON-safe action request is still delivered whole, as a copy", () => {
  const actions = report.events.filter((candidate) => candidate.kind === "action");
  assert.deepEqual(actions[2]!.request, { surfaceId: "s", sourceComponentId: "btn", scopePath: "/", actionProperty: "action", extra: { a: 1 } });
});

test("a JSON-safe write is still delivered with its value", () => {
  const event = report.events.filter((candidate) => candidate.kind === "input").at(-1)!;
  assert.equal((event.request as { value: unknown }).value, "Ada");
});
