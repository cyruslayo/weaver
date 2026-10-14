/**
 * The A2UI helpers the demo shares: one producer, the JSONL line for a message, and a short
 * description of a reply for the "How Weaver built this" panel.
 */
import { createA2UIV091Producer, type A2UIServerMessage } from "@cylayo/weaver-core";

export const producer = createA2UIV091Producer();

export interface ReplyStats {
  /** How many messages the reply holds. */
  count: number;
  /** The distinct lifecycle messages, in order: createSurface, updateComponents, updateDataModel. */
  operations: string[];
  /** The distinct component types the reply's updateComponents messages use, in order. */
  components: string[];
}

/** Describes a reply from the messages themselves, so the panel reports what was really sent. */
export function describeReply(messages: readonly A2UIServerMessage[]): ReplyStats {
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
