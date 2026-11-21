/**
 * Static checks for the A2UI v1.0 regex dialect (a2ui_protocol.md, "The regex
 * function"; basic_catalog_implementation_guide.md, "regex").
 *
 * This module parses and vets a pattern; it never executes one. Matching is
 * delegated to a host-supplied matcher, so Core never compiles agent-controlled
 * patterns. Errors are reported as EXPRESSION_ERROR.
 */

/** Pattern length cap, in code points. */
export const REGEX_MAX_PATTERN_CODE_POINTS = 256;
/** Values longer than this do not match; regex returns valid: false without an error. */
export const REGEX_MAX_VALUE_CODE_POINTS = 4096;

export type RegexDialectResult = { ok: true } | { ok: false; message: string };

type Range = readonly [number, number];
type CharSet = Range[];

const MAX_CODE_POINT = 0x10ffff;

type Node =
  | { kind: "set"; set: CharSet }
  | { kind: "assert" }
  | { kind: "look"; alternatives: Node[][] }
  | { kind: "group"; alternatives: Node[][] }
  | { kind: "repeat"; atom: Node; min: number; max: number };

class DialectFailure {
  constructor(readonly message: string) {}
}

function normalize(ranges: readonly Range[]): CharSet {
  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  const merged: [number, number][] = [];
  for (const [low, high] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && low <= last[1] + 1) last[1] = Math.max(last[1], high);
    else merged.push([low, high]);
  }
  return merged;
}

function complement(set: CharSet): CharSet {
  const result: [number, number][] = [];
  let next = 0;
  for (const [low, high] of set) {
    if (low > next) result.push([next, low - 1]);
    next = high + 1;
  }
  if (next <= MAX_CODE_POINT) result.push([next, MAX_CODE_POINT]);
  return result;
}

function intersects(left: readonly Range[], right: readonly Range[]): boolean {
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i]!;
    const b = right[j]!;
    if (Math.max(a[0], b[0]) <= Math.min(a[1], b[1])) return true;
    if (a[1] < b[1]) i += 1;
    else j += 1;
  }
  return false;
}

// ECMAScript class escapes and dot, expressed as exact code point sets.
const DIGIT: CharSet = [[0x30, 0x39]];
const WORD: CharSet = normalize([[0x30, 0x39], [0x41, 0x5a], [0x5f, 0x5f], [0x61, 0x7a]]);
const SPACE: CharSet = normalize([
  [0x09, 0x0d], [0x20, 0x20], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a],
  [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000], [0xfeff, 0xfeff],
]);
const DOT: CharSet = complement(normalize([[0x0a, 0x0a], [0x0d, 0x0d], [0x2028, 0x2029]]));

const SYNTAX_CHARACTERS = new Set("^$\\.*+?()[]{}|/".split("").map((character) => character.codePointAt(0)!));

function isDigit(code: number | undefined): boolean {
  return code !== undefined && code >= 0x30 && code <= 0x39;
}

function hexValue(code: number | undefined): number | undefined {
  if (code === undefined) return undefined;
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return undefined;
}

type ClassEscape = { kind: "set"; set: CharSet } | { kind: "char"; code: number } | { kind: "assert" };

class DialectParser {
  #index = 0;

  constructor(private readonly codes: readonly number[]) {}

  parse(): Node[][] {
    const alternatives = this.#alternation();
    if (this.#index !== this.codes.length) this.#fail("unbalanced ')' in pattern");
    return alternatives;
  }

  #fail(message: string): never {
    throw new DialectFailure(message);
  }

  #peek(offset = 0): number | undefined {
    return this.codes[this.#index + offset];
  }

  #alternation(): Node[][] {
    const alternatives: Node[][] = [this.#sequence()];
    while (this.#peek() === 0x7c) {
      this.#index += 1;
      alternatives.push(this.#sequence());
    }
    return alternatives;
  }

  #sequence(): Node[] {
    const items: Node[] = [];
    while (this.#index < this.codes.length && this.#peek() !== 0x7c && this.#peek() !== 0x29) {
      items.push(this.#term());
    }
    return items;
  }

  #term(): Node {
    const atom = this.#atom();
    const quantifierStart = this.#peek();
    const isQuantifier = quantifierStart === 0x2a || quantifierStart === 0x2b || quantifierStart === 0x3f || quantifierStart === 0x7b;
    if (atom.kind === "assert" || atom.kind === "look") {
      if (isQuantifier) this.#fail("a quantifier cannot apply to an assertion in the A2UI regex dialect");
      return atom;
    }
    if (!isQuantifier) return atom;
    const bounds = this.#quantifier();
    return { kind: "repeat", atom, min: bounds.min, max: bounds.max };
  }

  #quantifier(): { min: number; max: number } {
    const code = this.#peek();
    let bounds: { min: number; max: number };
    if (code === 0x2a) {
      this.#index += 1;
      bounds = { min: 0, max: Infinity };
    } else if (code === 0x2b) {
      this.#index += 1;
      bounds = { min: 1, max: Infinity };
    } else if (code === 0x3f) {
      this.#index += 1;
      bounds = { min: 0, max: 1 };
    } else {
      bounds = this.#braces();
    }
    if (this.#peek() === 0x3f) this.#index += 1; // lazy modifier
    return bounds;
  }

  #braces(): { min: number; max: number } {
    this.#index += 1; // '{'
    const min = this.#digits();
    if (min === undefined) this.#fail("invalid quantifier in the A2UI regex dialect");
    let max = min;
    if (this.#peek() === 0x2c) {
      this.#index += 1;
      max = this.#digits() ?? Infinity;
    }
    if (this.#peek() !== 0x7d) this.#fail("unterminated quantifier in the A2UI regex dialect");
    this.#index += 1;
    if (max < min) this.#fail("quantifier range is out of order");
    return { min, max };
  }

  #digits(): number | undefined {
    let text = "";
    while (isDigit(this.#peek())) {
      text += String.fromCodePoint(this.#peek()!);
      this.#index += 1;
    }
    return text === "" ? undefined : Number(text);
  }

  #atom(): Node {
    const code = this.#peek();
    if (code === undefined) this.#fail("unexpected end of pattern");
    switch (code) {
      case 0x5e: // ^
      case 0x24: // $
        this.#index += 1;
        return { kind: "assert" };
      case 0x2e: // .
        this.#index += 1;
        return { kind: "set", set: DOT };
      case 0x28: // (
        return this.#group();
      case 0x5b: // [
        return { kind: "set", set: this.#class() };
      case 0x5c: {
        const escape = this.#escape(false);
        if (escape.kind === "assert") return { kind: "assert" };
        if (escape.kind === "set") return { kind: "set", set: escape.set };
        return { kind: "set", set: [[escape.code, escape.code]] };
      }
      case 0x2a: // *
      case 0x2b: // +
      case 0x3f: // ?
        this.#fail("nothing to repeat in the A2UI regex dialect");
        return { kind: "assert" };
      case 0x7b: // {
      case 0x7d: // }
      case 0x5d: // ]
        this.#fail("unescaped syntax character in the A2UI regex dialect");
        return { kind: "assert" };
      default:
        this.#index += 1;
        return { kind: "set", set: [[code, code]] };
    }
  }

  #group(): Node {
    this.#index += 1; // (
    if (this.#peek() === 0x3f) {
      const next = this.#peek(1);
      if (next === 0x3a) {
        this.#index += 2;
        return this.#closeGroup("group");
      }
      if (next === 0x3d || next === 0x21) {
        this.#index += 2;
        return this.#closeGroup("look");
      }
      this.#fail("lookbehind, named groups and inline flags are not allowed in the A2UI regex dialect");
    }
    return this.#closeGroup("group");
  }

  #closeGroup(kind: "group" | "look"): Node {
    const alternatives = this.#alternation();
    if (this.#peek() !== 0x29) this.#fail("unterminated group in the A2UI regex dialect");
    this.#index += 1;
    return { kind, alternatives };
  }

  #escape(inClass: boolean): ClassEscape {
    this.#index += 1; // backslash
    const code = this.#peek();
    if (code === undefined) this.#fail("trailing backslash in the A2UI regex dialect");
    this.#index += 1;
    switch (code) {
      case 0x64: return { kind: "set", set: DIGIT }; // d
      case 0x44: return { kind: "set", set: complement(DIGIT) }; // D
      case 0x77: return { kind: "set", set: WORD }; // w
      case 0x57: return { kind: "set", set: complement(WORD) }; // W
      case 0x73: return { kind: "set", set: SPACE }; // s
      case 0x53: return { kind: "set", set: complement(SPACE) }; // S
      case 0x62: // b
        return inClass ? { kind: "char", code: 0x08 } : { kind: "assert" };
      case 0x42: // B
        if (inClass) this.#fail("\\B is not allowed inside a class");
        return { kind: "assert" };
      case 0x74: return { kind: "char", code: 0x09 }; // t
      case 0x6e: return { kind: "char", code: 0x0a }; // n
      case 0x76: return { kind: "char", code: 0x0b }; // v
      case 0x66: return { kind: "char", code: 0x0c }; // f
      case 0x72: return { kind: "char", code: 0x0d }; // r
      case 0x30: // 0
        if (isDigit(this.#peek())) this.#fail("legacy octal escapes are not allowed in the A2UI regex dialect");
        return { kind: "char", code: 0 };
      case 0x78: { // x
        const high = hexValue(this.#peek());
        const low = hexValue(this.#peek(1));
        if (high === undefined || low === undefined) this.#fail("invalid \\x escape");
        this.#index += 2;
        return { kind: "char", code: high * 16 + low };
      }
      case 0x75: // u
        return { kind: "char", code: this.#unicodeEscape() };
      case 0x63: case 0x70: case 0x50: case 0x6b: // c p P k
        this.#fail("this escape is not allowed in the A2UI regex dialect");
        return { kind: "assert" };
      default:
        if (code >= 0x31 && code <= 0x39) this.#fail("backreferences are not allowed in the A2UI regex dialect");
        if (SYNTAX_CHARACTERS.has(code) || (inClass && code === 0x2d)) return { kind: "char", code };
        this.#fail("identity escape is not allowed in the A2UI regex dialect");
        return { kind: "assert" };
    }
  }

  #unicodeEscape(): number {
    if (this.#peek() === 0x7b) {
      this.#index += 1;
      let value = 0;
      let digits = 0;
      while (hexValue(this.#peek()) !== undefined) {
        value = value * 16 + hexValue(this.#peek())!;
        digits += 1;
        if (value > MAX_CODE_POINT) this.#fail("code point escape is out of range");
        this.#index += 1;
      }
      if (digits === 0 || this.#peek() !== 0x7d) this.#fail("invalid \\u{...} escape");
      this.#index += 1;
      return value;
    }
    const readFour = (): number | undefined => {
      let value = 0;
      for (let offset = 0; offset < 4; offset += 1) {
        const digit = hexValue(this.#peek(offset));
        if (digit === undefined) return undefined;
        value = value * 16 + digit;
      }
      return value;
    };
    const first = readFour();
    if (first === undefined) this.#fail("invalid \\u escape");
    this.#index += 4;
    // A surrogate pair written as two escapes is one code point in Unicode mode.
    if (first >= 0xd800 && first <= 0xdbff && this.#peek() === 0x5c && this.#peek(1) === 0x75) {
      this.#index += 2;
      const second = readFour();
      if (second === undefined) this.#fail("invalid \\u escape");
      if (second >= 0xdc00 && second <= 0xdfff) {
        this.#index += 4;
        return (first - 0xd800) * 0x400 + (second - 0xdc00) + 0x10000;
      }
      this.#index -= 2;
    }
    return first;
  }

  #class(): CharSet {
    this.#index += 1; // [
    let negated = false;
    if (this.#peek() === 0x5e) {
      negated = true;
      this.#index += 1;
    }
    const ranges: Range[] = [];
    while (true) {
      if (this.#peek() === undefined) this.#fail("unterminated character class in the A2UI regex dialect");
      if (this.#peek() === 0x5d) {
        this.#index += 1;
        break;
      }
      const start = this.#classAtom();
      if (this.#peek() === 0x2d && this.#peek(1) !== undefined && this.#peek(1) !== 0x5d) {
        this.#index += 1;
        const end = this.#classAtom();
        if (start.kind === "set" || end.kind === "set") this.#fail("a class escape cannot be a range endpoint");
        if (start.code > end.code) this.#fail("character class range is out of order");
        ranges.push([start.code, end.code]);
      } else if (start.kind === "set") {
        ranges.push(...start.set);
      } else {
        ranges.push([start.code, start.code]);
      }
    }
    const set = normalize(ranges);
    return negated ? complement(set) : set;
  }

  #classAtom(): { kind: "set"; set: CharSet; code: number } | { kind: "char"; code: number } {
    if (this.#peek() === 0x5c) {
      const escape = this.#escape(true);
      if (escape.kind === "set") return { kind: "set", set: escape.set, code: 0 };
      if (escape.kind === "char") return { kind: "char", code: escape.code };
      this.#fail("assertion escapes are not allowed inside a class");
    }
    const code = this.#peek()!;
    this.#index += 1;
    return { kind: "char", code };
  }
}

function nullable(node: Node): boolean {
  switch (node.kind) {
    case "set":
      return false;
    case "assert":
    case "look":
      return true;
    case "group":
      return node.alternatives.some((sequence) => sequence.every(nullable));
    case "repeat":
      return node.min === 0 || nullable(node.atom);
  }
}

function hasUnboundedQuantifier(node: Node): boolean {
  switch (node.kind) {
    case "set":
    case "assert":
      return false;
    case "look":
    case "group":
      return node.alternatives.some((sequence) => sequence.some(hasUnboundedQuantifier));
    case "repeat":
      return node.max === Infinity || hasUnboundedQuantifier(node.atom);
  }
}

function firstSet(node: Node): CharSet {
  switch (node.kind) {
    case "set":
      return node.set;
    case "assert":
    case "look":
      return [];
    case "repeat":
      return firstSet(node.atom);
    case "group":
      return normalize(node.alternatives.flatMap(firstSetOfSequence));
  }
}

function firstSetOfSequence(sequence: readonly Node[]): CharSet {
  const collected: Range[] = [];
  for (const item of sequence) {
    collected.push(...firstSet(item));
    if (!nullable(item)) break;
  }
  return normalize(collected);
}

/** Every character a node can consume, used as the overlap set for adjacency checks. */
function characterSet(node: Node): CharSet {
  switch (node.kind) {
    case "set":
      return node.set;
    case "assert":
    case "look":
      return [];
    case "repeat":
      return characterSet(node.atom);
    case "group":
      return normalize(node.alternatives.flat().flatMap((item) => characterSet(item)));
  }
}

/** Unwraps groups that contain exactly one item, so a group around one quantified atom counts as that atom. */
function unwrapSingleItemGroup(node: Node): Node {
  let current = node;
  while (current.kind === "group" && current.alternatives.length === 1 && current.alternatives[0]!.length === 1) {
    current = current.alternatives[0]![0]!;
  }
  return current;
}

/** The branches of an alternation that an unbounded quantifier repeats, after unwrapping. */
function alternationBranches(node: Node): Node[][] {
  const unwrapped = unwrapSingleItemGroup(node);
  return unwrapped.kind === "group" && unwrapped.alternatives.length > 1 ? unwrapped.alternatives : [];
}

function checkSequence(sequence: readonly Node[]): void {
  const items = sequence.map(unwrapSingleItemGroup);
  for (let index = 0; index < items.length; index += 1) {
    const operand = items[index]!;
    if (operand.kind !== "repeat" || operand.max !== Infinity) continue;
    const operandSet = characterSet(operand.atom);
    for (let next = index + 1; next < items.length; next += 1) {
      const candidate = items[next]!;
      if (candidate.kind === "repeat" && candidate.max === Infinity && intersects(operandSet, characterSet(candidate.atom))) {
        throw new DialectFailure("overlapping unbounded quantifiers are adjacent in the A2UI regex dialect");
      }
      if (!nullable(candidate)) break;
    }
  }
  for (const item of sequence) checkNode(item);
}

function checkAlternatives(alternatives: readonly (readonly Node[])[]): void {
  for (const sequence of alternatives) checkSequence(sequence);
}

function checkNode(node: Node): void {
  switch (node.kind) {
    case "set":
    case "assert":
      return;
    case "look":
    case "group":
      checkAlternatives(node.alternatives);
      return;
    case "repeat": {
      if (node.max > 1 && hasUnboundedQuantifier(node.atom)) {
        throw new DialectFailure("a repeated subexpression contains an unbounded quantifier in the A2UI regex dialect");
      }
      if (node.max === Infinity) {
        const branches = alternationBranches(node.atom);
        for (let left = 0; left < branches.length; left += 1) {
          for (let right = left + 1; right < branches.length; right += 1) {
            if (intersects(firstSetOfSequence(branches[left]!), firstSetOfSequence(branches[right]!))) {
              throw new DialectFailure("an unbounded quantifier repeats an alternation whose branches can start with the same character");
            }
          }
        }
      }
      checkNode(node.atom);
    }
  }
}

/**
 * Validates a pattern against the A2UI v1.0 regex dialect and its safety rules.
 * It does not match anything; a valid result means the host matcher may run.
 */
export function checkA2UIRegexPattern(pattern: string): RegexDialectResult {
  const codes = Array.from(pattern, (character) => character.codePointAt(0)!);
  if (codes.length > REGEX_MAX_PATTERN_CODE_POINTS) {
    return { ok: false, message: `regex pattern exceeds ${REGEX_MAX_PATTERN_CODE_POINTS} code points` };
  }
  try {
    const alternatives = new DialectParser(codes).parse();
    checkAlternatives(alternatives);
    return { ok: true };
  } catch (error) {
    if (error instanceof DialectFailure) return { ok: false, message: error.message };
    throw error;
  }
}

/** Code point count, as the regex caps are stated. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}
