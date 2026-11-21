import {
  createA2UIV10Producer,
  createA2UIV10StreamIngestion,
  createWeaverTraceRecorder,
  type A2UIComponent,
  type A2UIAgentMessage,
  type WeaverTrace,
  type WeaverActionResult,
  type WeaverInputResult,
} from "@cylayo/weaver-core";
import { createInspectorWebRuntime } from "./runtime-factory.js";

/** Where the committed sample lives, relative to this package. */
export const INSPECTOR_SAMPLE_PATH = "samples/reference-request.weaver-trace.json";
export const SAMPLE_SURFACE_ID = "reference-request";

// Fixed clock values make the committed sample byte-for-byte reproducible.
const BASE_TIME_MS = Date.UTC(2026, 9, 10, 9, 0, 0);

function requestComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["heading", "title", "priority", "submit", "status"] },
    { id: "heading", component: "Text", text: "# Model Draft Request" },
    { id: "title", component: "TextField", label: "Request title", value: { "@path": "/draft/title" } },
    {
      id: "priority",
      component: "ChoicePicker",
      label: "Priority",
      variant: "mutuallyExclusive",
      displayStyle: "chips",
      options: [
        { label: "Normal", value: "normal" },
        { label: "High", value: "high" },
        { label: "Urgent", value: "urgent" },
      ],
      value: { "@path": "/draft/priority" },
    },
    {
      id: "submit",
      component: "Button",
      variant: "primary",
      child: "submit_label",
      action: {
        event: {
          name: "reference.createRequest",
          context: { title: { "@path": "/draft/title" }, priority: { "@path": "/draft/priority" } },
        },
      },
    },
    { id: "submit_label", component: "Text", text: "Create request" },
    { id: "status", component: "Text", text: { "@path": "/result/status" } },
  ];
}

function mustApply(result: WeaverInputResult): void {
  if (!result.ok) throw new Error(`Sample input was rejected: ${result.error.code}`);
}

/**
 * Records a deterministic session with the same runtime configuration the
 * inspector uses. The flow is a reference-app style request: a surface is
 * created, a torn frame and an invalid message arrive, the user types and picks
 * a priority, submits, and the host answers with the next data model. The last
 * action targets a component that does not exist, so the trace also holds an
 * error outcome.
 */
export function createInspectorSampleTrace(): WeaverTrace {
  let ticks = 0;
  const recorder = createWeaverTraceRecorder({
    now: () => {
      ticks += 1;
      return new Date(BASE_TIME_MS + ticks * 1000);
    },
  });
  const created = createInspectorWebRuntime({
    observer: recorder.observer,
    now: () => new Date(BASE_TIME_MS),
  });
  if (!created.ok) throw new Error(`Sample runtime configuration failed: ${created.error.code}`);
  const { runtime, catalogId } = created.value;
  const ingestion = createA2UIV10StreamIngestion({ runtime });
  const producer = createA2UIV10Producer();

  // Frames pass through the same ingestion path as a real stream.
  const pushFrame = (frame: string): void => {
    recorder.recordIngestion(ingestion.push(frame), frame);
  };
  const send = (messages: readonly A2UIAgentMessage[]): void => {
    for (const message of messages) pushFrame(`${JSON.stringify(message)}\n`);
  };

  send([
    producer.createSurface({ surfaceId: SAMPLE_SURFACE_ID, catalogId, sendDataModel: true }),
    producer.updateDataModel({
      surfaceId: SAMPLE_SURFACE_ID,
      value: {
        draft: { title: "", priority: ["normal"] },
        result: { count: 0, status: "Ready for a request", countLabel: "Submitted: 0" },
      },
    }),
    producer.updateComponents({ surfaceId: SAMPLE_SURFACE_ID, components: requestComponents() }),
  ]);

  // A torn frame. It never reaches the runtime, so the surface must not change.
  pushFrame('{"version":"1.0","updateDataModel":{"surfaceId":"reference-request"\n');

  // A well-formed message that the runtime rejects: its catalog is not registered.
  pushFrame(
    `${JSON.stringify({
      version: "1.0",
      createSurface: {
        surfaceId: "preview",
        catalogId: "https://example.test/catalogs/unregistered.json",
        sendDataModel: false,
      },
    })}\n`,
  );

  mustApply(
    runtime.writeInput({
      surfaceId: SAMPLE_SURFACE_ID,
      sourceComponentId: "title",
      scopePath: "/",
      property: "value",
      value: "Ship the inspector",
    }),
  );
  mustApply(
    runtime.writeInput({
      surfaceId: SAMPLE_SURFACE_ID,
      sourceComponentId: "priority",
      scopePath: "/",
      property: "value",
      value: ["high"],
    }),
  );

  const submit: WeaverActionResult = runtime.dispatchAction({
    surfaceId: SAMPLE_SURFACE_ID,
    sourceComponentId: "submit",
    scopePath: "/",
    actionProperty: "action",
  });
  if (!submit.ok || submit.value.kind !== "serverEvent")
    throw new Error("Sample submit did not produce a server event");
  const context = submit.value.message.action.context as Record<string, unknown>;
  const title = typeof context.title === "string" ? context.title : "";

  // The host answers the event with the next data model, as an agent would.
  send([
    producer.updateDataModel({
      surfaceId: SAMPLE_SURFACE_ID,
      value: {
        draft: { title: "", priority: ["normal"] },
        result: { count: 1, status: `Created: ${title}`, countLabel: "Submitted: 1" },
      },
    }),
  ]);

  // A stale control that no longer exists in the surface, so this action is rejected.
  runtime.dispatchAction({
    surfaceId: SAMPLE_SURFACE_ID,
    sourceComponentId: "removed-button",
    scopePath: "/",
    actionProperty: "action",
  });

  return recorder.getTrace();
}

/** The second committed sample: a long unbroken label in a Row, to check layout in the stage. */
export const ROW_LAYOUT_SAMPLE_PATH = "samples/row-layout.weaver-trace.json";
export const ROW_LAYOUT_SURFACE_ID = "row-layout";
const ROW_BASE_TIME_MS = Date.UTC(2026, 9, 11, 9, 0, 0);
const UNBROKEN_TEXT =
  "Unbroken012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789";

function rowLayoutComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["heading", "row", "status"] },
    { id: "heading", component: "Text", text: "# Row layout check" },
    { id: "row", component: "Row", children: ["card", "field"] },
    { id: "card", component: "Card", child: "card_text" },
    { id: "card_text", component: "Text", text: UNBROKEN_TEXT },
    { id: "field", component: "TextField", label: "Long value", value: { "@path": "/draft/title" } },
    { id: "status", component: "Text", text: { "@path": "/result/status" } },
  ];
}

/** Records the row-layout sample with the same runtime configuration and clock scheme as the request sample. */
export function createRowLayoutSampleTrace(): WeaverTrace {
  let ticks = 0;
  const recorder = createWeaverTraceRecorder({
    now: () => {
      ticks += 1;
      return new Date(ROW_BASE_TIME_MS + ticks * 1000);
    },
  });
  const created = createInspectorWebRuntime({
    observer: recorder.observer,
    now: () => new Date(ROW_BASE_TIME_MS),
  });
  if (!created.ok) throw new Error(`Sample runtime configuration failed: ${created.error.code}`);
  const { runtime, catalogId } = created.value;
  const ingestion = createA2UIV10StreamIngestion({ runtime });
  const producer = createA2UIV10Producer();

  const pushFrame = (frame: string): void => {
    recorder.recordIngestion(ingestion.push(frame), frame);
  };
  for (const message of [
    producer.createSurface({ surfaceId: ROW_LAYOUT_SURFACE_ID, catalogId, sendDataModel: true }),
    producer.updateDataModel({
      surfaceId: ROW_LAYOUT_SURFACE_ID,
      value: { draft: { title: "" }, result: { status: "Ready" } },
    }),
    producer.updateComponents({ surfaceId: ROW_LAYOUT_SURFACE_ID, components: rowLayoutComponents() }),
  ] satisfies A2UIAgentMessage[]) {
    pushFrame(`${JSON.stringify(message)}\n`);
  }

  mustApply(
    runtime.writeInput({
      surfaceId: ROW_LAYOUT_SURFACE_ID,
      sourceComponentId: "field",
      scopePath: "/",
      property: "value",
      value: UNBROKEN_TEXT,
    }),
  );
  return recorder.getTrace();
}

/** The committed file format: two-space JSON with a final newline. */
export function serializeInspectorSample(trace: WeaverTrace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}
