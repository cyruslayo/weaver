import {
  createA2UIV091StreamIngestion,
  type A2UIServerMessage,
  type WeaverRuntime,
} from "@weaver/core";

export interface AgentStream {
  send(messages: readonly A2UIServerMessage[]): void;
  finish(): void;
  reset(): void;
}

/** Serializes one producer message as one JSONL frame. */
export function encodeA2UIMessage(message: A2UIServerMessage): string {
  return `${JSON.stringify(message)}\n`;
}

/** In-process equivalent of an agent stream; validation remains owned by Core ingestion. */
export function createAgentStream(runtime: WeaverRuntime): AgentStream {
  const ingestion = createA2UIV091StreamIngestion({ runtime });

  const apply = (events: ReturnType<typeof ingestion.push>): void => {
    for (const event of events) {
      if (!event.ok) {
        throw new Error(
          `Reference agent stream failed at frame ${event.frame}: ${event.error.code}`,
        );
      }
    }
  };

  return {
    send: (messages) => {
      for (const message of messages)
        apply(ingestion.push(encodeA2UIMessage(message)));
    },
    finish: () => apply(ingestion.finish()),
    reset: () => ingestion.reset(),
  };
}
