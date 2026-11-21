import { JsonlDecoder } from "../transport/jsonl/index.js";
import type { WeaverRuntime } from "../runtime/index.js";
import type { A2UIV10StreamIngestion, A2UIV10StreamIngestionConfig, A2UIV10StreamIngestionEvent } from "./types.js";

export function createA2UIV10StreamIngestion(
  config: A2UIV10StreamIngestionConfig,
): A2UIV10StreamIngestion {
  const runtime = config.runtime;
  const decoder = new JsonlDecoder({ maxFrameCharacters: config.maxFrameCharacters });

  return {
    push(chunk) {
      if (typeof chunk !== "string") throw new TypeError("stream ingestion chunks must be strings");
      return decoder.push(chunk).map((event) => event.ok
        ? applyFrame(runtime, event.frame, event.value)
        : { ok: false, frame: event.error.frame, error: event.error });
    },
    finish() {
      return decoder.finish().map((event) => event.ok
        ? applyFrame(runtime, event.frame, event.value)
        : { ok: false, frame: event.error.frame, error: event.error });
    },
    reset() {
      decoder.reset();
    },
  };
}

function applyFrame(
  runtime: WeaverRuntime,
  frame: number,
  value: unknown,
): A2UIV10StreamIngestionEvent {
  const result = runtime.process(value);
  return result.ok
    ? { ok: true, frame, value: result.value }
    : { ok: false, frame, error: result.error };
}
