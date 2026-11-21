/**
 * The A2UI helpers the demo shares: one producer, the JSONL line for a message, and a short
 * description of a reply for the "How Weaver built this" panel.
 */
import { createA2UIV10Producer, type A2UIAgentMessage, type JsonObject } from "@cylayo/weaver-core";

export const producer = createA2UIV10Producer();

/** A data binding in A2UI v1.0 form: `{"@path": ...}`. A plain `{path}` object would be a literal. */
export function bind(path: string): JsonObject {
  return { "@path": path };
}

/**
 * Heading text for a Text component. A2UI v1.0 Text has only the caption and body variants, so a
 * heading is Markdown the agent writes. A bound heading reads its string from the data model.
 */
export function heading(level: 2 | 3, text: string): string {
  return `${"#".repeat(level)} ${text}`;
}

export interface ReplyStats {
  /** How many messages the reply holds. */
  count: number;
  /** The distinct lifecycle messages, in order: createSurface, updateComponents, updateDataModel. */
  operations: string[];
  /** The distinct component types the reply's updateComponents messages use, in order. */
  components: string[];
}

/** Describes a reply from the messages themselves, so the panel reports what was really sent. */
export function describeReply(messages: readonly A2UIAgentMessage[]): ReplyStats {
  const operations: string[] = [];
  const components: string[] = [];
  for (const message of messages) {
    const operation = Object.keys(message).find((key) => key !== "version") ?? "";
    if (!operations.includes(operation)) operations.push(operation);
    if (!("updateComponents" in message)) continue;
    for (const component of message.updateComponents.components) {
      if (!components.includes(component.component)) components.push(component.component);
    }
  }
  return { count: messages.length, operations, components };
}
