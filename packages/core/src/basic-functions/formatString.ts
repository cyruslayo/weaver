import type { JsonValue } from "../protocol/index.js";
import type { FunctionCall, FunctionExecutionContext } from "../functions/index.js";

class ExpressionParser {
  #index = 0;
  constructor(private readonly source: string) {}

  parse(): JsonValue | FunctionCall {
    const value = this.#expression();
    this.#space();
    if (this.#index !== this.source.length) throw new Error("Unexpected interpolation input");
    return value;
  }

  #expression(): JsonValue | FunctionCall {
    this.#space();
    if (this.source.startsWith("${", this.#index)) {
      const end = findInterpolationEnd(this.source, this.#index + 2);
      const value = new ExpressionParser(this.source.slice(this.#index + 2, end)).parse();
      this.#index = end + 1;
      return value;
    }
    const character = this.source[this.#index];
    if (character === "'" || character === '"') return this.#string(character);
    const remaining = this.source.slice(this.#index);
    for (const [word, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (remaining.startsWith(word) && this.#boundary(this.#index + word.length)) { this.#index += word.length; return value; }
    }
    const number = remaining.match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u)?.[0];
    if (number !== undefined && this.#boundary(this.#index + number.length)) { this.#index += number.length; return Number(number); }
    const start = this.#index;
    while (this.#index < this.source.length && !/[\s():,]/.test(this.source[this.#index]!)) this.#index++;
    const name = this.source.slice(start, this.#index);
    if (name === "") throw new Error("Expected expression");
    this.#space();
    if (this.source[this.#index] === "(") return this.#call(name);
    return { path: name };
  }

  #call(name: string): FunctionCall {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid function name");
    this.#index++;
    const args: Record<string, JsonValue> = {};
    this.#space();
    if (this.source[this.#index] === ")") { this.#index++; return { call: name, args }; }
    while (true) {
      this.#space();
      const match = this.source.slice(this.#index).match(/^[A-Za-z_][A-Za-z0-9_]*/u);
      if (match === null) throw new Error("Missing function argument name");
      const argumentName = match[0];
      this.#index += argumentName.length;
      this.#space();
      if (this.source[this.#index] !== ":") throw new Error("Missing function argument colon");
      this.#index++;
      args[argumentName] = this.#expression() as JsonValue;
      this.#space();
      if (this.source[this.#index] === ")") { this.#index++; break; }
      if (this.source[this.#index] !== ",") throw new Error("Expected comma or closing parenthesis");
      this.#index++;
    }
    return { call: name, args };
  }

  #string(quote: string): string {
    this.#index++;
    let output = "";
    while (this.#index < this.source.length) {
      const character = this.source[this.#index++]!;
      if (character === quote) return output;
      if (character === "\\") {
        if (this.#index >= this.source.length) throw new Error("Unterminated string escape");
        const escaped = this.source[this.#index++]!;
        if (escaped !== quote && escaped !== "\\") throw new Error("Unsupported string escape");
        output += escaped;
      } else output += character;
    }
    throw new Error("Unterminated string");
  }

  #space(): void { while (/\s/.test(this.source[this.#index] ?? "")) this.#index++; }
  #boundary(index: number): boolean { return index === this.source.length || /[\s,)]/.test(this.source[index]!); }
}

function findInterpolationEnd(source: string, start: number): number {
  let parentheses = 0;
  let interpolation = 0;
  let quote: string | undefined;
  for (let index = start; index < source.length; index++) {
    const character = source[index]!;
    if (quote !== undefined) {
      if (character === "\\") index++;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (source.startsWith("${", index)) { interpolation++; index++; continue; }
    if (character === "(" ) parentheses++;
    else if (character === ")") { if (parentheses === 0) throw new Error("Invalid nesting"); parentheses--; }
    else if (character === "}") {
      if (interpolation > 0) interpolation--;
      else if (parentheses === 0) return index;
    }
  }
  throw new Error("Unterminated interpolation");
}

function stringify(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (value === null || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function evaluateExpression(expression: JsonValue | FunctionCall, context: FunctionExecutionContext): unknown {
  if (expression !== null && typeof expression === "object" && !Array.isArray(expression)) {
    if ("call" in expression) {
      const result = context.evaluateFunctionCall(expression as FunctionCall);
      if (!result.ok) context.propagateFunctionFailure(result.error);
      return result.value;
    }
    if ("path" in expression && typeof expression.path === "string") {
      const result = context.dataContext.get(expression.path);
      if (!result.ok) throw new Error("Unable to resolve interpolation path");
      return result.value;
    }
  }
  return expression;
}

export function formatString(args: Readonly<Record<string, unknown>>, context: FunctionExecutionContext): string {
  const template = typeof args.template === "string" ? args.template : args.value;
  if (typeof template !== "string") throw new Error("formatString template must be a string");
  let output = "";
  for (let index = 0; index < template.length;) {
    if (template.startsWith("\\${", index)) { output += "${"; index += 3; continue; }
    if (!template.startsWith("${", index)) { output += template[index++]; continue; }
    const end = findInterpolationEnd(template, index + 2);
    const expression = new ExpressionParser(template.slice(index + 2, end)).parse();
    output += stringify(evaluateExpression(expression, context));
    index = end + 1;
  }
  return output;
}
