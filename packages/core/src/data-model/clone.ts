import type { JsonObject, JsonValue } from "../protocol/index.js";

interface ArrayFrame {
  source: JsonValue[];
  target: JsonValue[];
  index: number;
}

interface ObjectFrame {
  source: JsonObject;
  target: JsonObject;
  keys: string[];
  index: number;
}

type CloneFrame = ArrayFrame | ObjectFrame;

function setObjectValue(
  target: JsonObject,
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

/** Clones JSON data iteratively so payload nesting cannot exhaust the JS stack. */
export function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const root: JsonValue[] | JsonObject = Array.isArray(value) ? [] : {};
  const frames: CloneFrame[] = Array.isArray(value)
    ? [{ source: value, target: root as JsonValue[], index: 0 }]
    : [
        {
          source: value,
          target: root as JsonObject,
          keys: Object.keys(value),
          index: 0,
        },
      ];

  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    let key: number | string;
    let child: JsonValue;
    if (Array.isArray(frame.source)) {
      if (frame.index === frame.source.length) {
        frames.pop();
        continue;
      }
      key = frame.index;
      child = frame.source[frame.index]!;
      frame.index += 1;
    } else {
      if (!("keys" in frame)) throw new Error("Invalid clone frame");
      if (frame.index === frame.keys.length) {
        frames.pop();
        continue;
      }
      key = frame.keys[frame.index]!;
      child = frame.source[key]!;
      frame.index += 1;
    }

    if (child !== null && typeof child === "object") {
      const childClone: JsonValue[] | JsonObject = Array.isArray(child)
        ? []
        : {};
      if (Array.isArray(frame.target)) frame.target[key as number] = childClone;
      else setObjectValue(frame.target, key as string, childClone);
      frames.push(
        Array.isArray(child)
          ? { source: child, target: childClone as JsonValue[], index: 0 }
          : {
              source: child,
              target: childClone as JsonObject,
              keys: Object.keys(child),
              index: 0,
            },
      );
    } else if (Array.isArray(frame.target)) {
      frame.target[key as number] = child;
    } else {
      setObjectValue(frame.target, key as string, child);
    }
  }

  return root as T;
}

export function equalJson(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
): boolean {
  const pairs: { left: JsonValue | undefined; right: JsonValue | undefined }[] =
    [{ left, right }];
  while (pairs.length > 0) {
    const pair = pairs.pop()!;
    if (pair.left === pair.right) continue;
    if (
      pair.left === null ||
      pair.right === null ||
      typeof pair.left !== "object" ||
      typeof pair.right !== "object"
    )
      return false;
    if (Array.isArray(pair.left) !== Array.isArray(pair.right)) return false;
    if (Array.isArray(pair.left)) {
      if (pair.left.length !== (pair.right as JsonValue[]).length) return false;
      for (let index = 0; index < pair.left.length; index += 1)
        pairs.push({
          left: pair.left[index],
          right: (pair.right as JsonValue[])[index],
        });
      continue;
    }
    const leftKeys = Object.keys(pair.left);
    const rightKeys = Object.keys(pair.right as JsonObject);
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      if (leftKeys[index] !== rightKeys[index]) return false;
      const key = leftKeys[index]!;
      pairs.push({
        left: pair.left[key],
        right: (pair.right as JsonObject)[key],
      });
    }
  }
  return true;
}
