import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { before, test } from "node:test";

/*
 * A host localFunction result is copied by the dispatcher after the function
 * evaluator has checked it. These tests run host results through the public
 * runtime API in a child process with a small heap and a hard timeout, so a
 * regression fails fast and never hangs the suite. Each scenario below is a
 * host result; the cyclic ones must be rejected before any copy.
 */

const CHILD = `
const core = await import(process.argv[1]);
const NOW = new Date("2026-01-01T00:00:00.000Z");
const ref = (name) => ({ $ref: "common_types.json#/$defs/" + name });
const fnSchema = (name, returnType) => ({
  type: "object",
  properties: { call: { const: name }, args: { type: "object" }, returnType: { const: returnType } },
  required: ["call", "args"],
  additionalProperties: false,
});
const cyclicObject = () => { const value = {}; value.self = value; return value; };
const cyclicArray = () => { const value = []; value.push(value); return value; };
const SCENARIOS = {
  cyclicAny: { returnType: "any", implementation: cyclicObject },
  cyclicArray: { returnType: "any", implementation: cyclicArray },
  cyclicVoid: { returnType: "void", implementation: cyclicObject },
  bigint: { returnType: "any", implementation: () => 1n },
  fn: { returnType: "any", implementation: () => () => 1 },
  map: { returnType: "any", implementation: () => new Map([["a", 1]]) },
  nan: { returnType: "any", implementation: () => Number.NaN },
  infinity: { returnType: "any", implementation: () => Number.POSITIVE_INFINITY },
  undefinedProperty: { returnType: "any", implementation: () => ({ a: undefined }) },
  deepAcyclic: { returnType: "any", implementation: () => { let value = { leaf: true }; for (let i = 0; i < 100000; i += 1) value = { next: value }; return value; } },
  voidUndefined: { returnType: "void", implementation: () => undefined },
  plainObject: { returnType: "any", implementation: () => ({ owned: true }) },
};
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  catalogId: "test",
  components: {
    Column: { type: "object", properties: { id: { type: "string" }, component: { const: "Column" }, children: ref("ChildList") }, required: ["id", "component"], additionalProperties: false },
    Button: { type: "object", properties: { id: { type: "string" }, component: { const: "Button" }, action: ref("Action") }, required: ["id", "component"], additionalProperties: false },
  },
  functions: Object.fromEntries(Object.entries(SCENARIOS).map(([name, scenario]) => [name, fnSchema(name, scenario.returnType)])),
  $defs: { theme: { type: "object" }, common: { $id: "common_types.json", $defs: {
    ChildList: { oneOf: [
      { type: "array", items: { type: "string" } },
      { type: "object", properties: { path: { type: "string" }, componentId: { type: "string" } }, required: ["path", "componentId"], additionalProperties: false },
    ] },
    Action: { oneOf: [
      { type: "object", properties: { functionCall: { type: "object" } }, required: ["functionCall"], additionalProperties: false },
      { type: "object", properties: { event: { type: "object" } }, required: ["event"], additionalProperties: false },
    ] },
  } } },
};

function errorCodes(error) {
  const codes = [];
  let cursor = error;
  while (cursor !== null && typeof cursor === "object") {
    if (typeof cursor.code === "string") codes.push(cursor.code);
    cursor = cursor.cause;
  }
  return codes;
}

function dispatch(runtime, name) {
  try {
    const result = runtime.dispatchAction({ surfaceId: "s", sourceComponentId: "btn-" + name, scopePath: "/", actionProperty: "action" });
    if (!result.ok) return { ok: false, codes: errorCodes(result.error) };
    const value = result.value.value;
    let nextDepth = 0;
    let cursor = value;
    while (cursor !== null && typeof cursor === "object" && "next" in cursor) {
      cursor = cursor.next;
      nextDepth += 1;
    }
    return { ok: true, kind: result.value.kind, hasValue: value !== undefined, owned: value !== undefined && value.owned === true, nextDepth };
  } catch (error) {
    return { thrown: String(error && error.message) };
  }
}

function build(withObserver) {
  const events = [];
  const created = core.createWeaverRuntime({
    catalogs: [{ catalogId: "test", schema }],
    functions: Object.entries(SCENARIOS).map(([name, scenario]) => ({ catalogId: "test", name, effect: "action", implementation: scenario.implementation })),
    now: () => NOW,
    ...(withObserver ? { observer: (event) => events.push(event) } : {}),
  });
  if (!created.ok) throw new Error("runtime was not created");
  const runtime = created.value;
  runtime.process({ version: "v0.9.1", createSurface: { surfaceId: "s", catalogId: "test" } });
  runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: "s", components: [
    { id: "root", component: "Column", children: Object.keys(SCENARIOS).map((name) => "btn-" + name) },
    ...Object.keys(SCENARIOS).map((name) => ({ id: "btn-" + name, component: "Button", action: { functionCall: { call: name, args: {} } } })),
  ] } });
  const out = {};
  for (const name of Object.keys(SCENARIOS)) out[name] = dispatch(runtime, name);
  return { out, events };
}

const without = build(false);
const observed = build(true);
process.stdout.write(JSON.stringify({
  without: without.out,
  observed: observed.out,
  events: observed.events.map((event) => ({ kind: event.kind, ok: event.result.ok })),
}));
`;

interface Outcome {
  ok?: boolean;
  codes?: string[];
  kind?: string;
  hasValue?: boolean;
  owned?: boolean;
  nextDepth?: number;
  thrown?: string;
}

interface ChildReport {
  without: Record<string, Outcome>;
  observed: Record<string, Outcome>;
  events: Array<{ kind: string; ok: boolean }>;
}

const REJECTED = ["ACTION_DISPATCH_FAILED", "LOCAL_FUNCTION_FAILED", "FUNCTION_RETURN_TYPE_MISMATCH"];

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
      `localFunction child process did not finish in ${seconds} s (${reason}). ` +
        "A host localFunction result was cloned without a JSON-safety check.",
    );
  }
  return JSON.parse(child.stdout) as ChildReport;
}

let report: ChildReport;
before(() => {
  report = runChild();
});

test("an observed and an unobserved runtime give the same outcome for every host result", () => {
  assert.deepEqual(report.observed, report.without);
});

test("a cyclic host result is rejected with a typed error before any copy, with or without an observer", () => {
  for (const name of ["cyclicAny", "cyclicArray", "cyclicVoid"]) {
    assert.deepEqual(report.without[name], { ok: false, codes: REJECTED }, name);
    assert.deepEqual(report.observed[name], { ok: false, codes: REJECTED }, name);
  }
});

test("other non-JSON host results are rejected with the same typed error", () => {
  for (const name of ["bigint", "fn", "map", "nan", "infinity", "undefinedProperty"]) {
    assert.deepEqual(report.without[name], { ok: false, codes: REJECTED }, name);
  }
});

test("JSON-safe host results are still returned, as copies, including a very deep acyclic value", () => {
  assert.deepEqual(report.without.plainObject, { ok: true, kind: "localFunction", hasValue: true, owned: true, nextDepth: 0 });
  assert.deepEqual(report.without.voidUndefined, { ok: true, kind: "localFunction", hasValue: false, owned: false, nextDepth: 0 });
  assert.deepEqual(report.without.deepAcyclic, { ok: true, kind: "localFunction", hasValue: true, owned: false, nextDepth: 100000 });
});

test("the observer records each action once, with the same ok flag as the caller", () => {
  const actions = report.events.filter((event) => event.kind === "action");
  assert.equal(actions.length, Object.keys(report.without).length);
  assert.equal(actions.filter((event) => !event.ok).length, 9);
});
