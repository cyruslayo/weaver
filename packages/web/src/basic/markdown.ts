function appendText(document: Document, parent: Node, text: string): void {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) parent.appendChild(document.createElement("br"));
    if (line.length > 0) parent.appendChild(document.createTextNode(line));
  });
}

/** Task 34's deliberately non-recursive inline Markdown scanner. */
export function renderBasicInlineMarkdown(document: Document, text: string): readonly Node[] {
  const output = document.createDocumentFragment();
  let literal = "";
  let marker: "**" | "__" | "*" | "_" | "`" | undefined;
  let formatted = "";

  const flushLiteral = (): void => {
    appendText(document, output, literal);
    literal = "";
  };
  const closeFormatting = (): void => {
    const element = document.createElement(marker === "`" ? "code" : marker === "**" || marker === "__" ? "strong" : "em");
    appendText(document, element, formatted);
    output.appendChild(element);
    marker = undefined;
    formatted = "";
  };

  for (let index = 0; index < text.length;) {
    const target = marker === undefined ? "literal" : "formatted";
    if (text[index] === "\\" && index + 1 < text.length && "*_`\\".includes(text[index + 1]!)) {
      if (target === "literal") literal += text[index + 1]; else formatted += text[index + 1];
      index += 2;
      continue;
    }
    if (marker !== undefined) {
      if (text.startsWith(marker, index)) {
        const markerLength = marker.length;
        closeFormatting();
        index += markerLength;
      } else {
        formatted += text[index];
        index++;
      }
      continue;
    }
    const candidate = text.startsWith("**", index) ? "**"
      : text.startsWith("__", index) ? "__"
      : text[index] === "*" ? "*"
      : text[index] === "_" ? "_"
      : text[index] === "`" ? "`"
      : undefined;
    if (candidate === undefined) {
      literal += text[index];
      index++;
      continue;
    }
    flushLiteral();
    marker = candidate;
    index += candidate.length;
  }
  if (marker !== undefined) literal += marker + formatted;
  flushLiteral();
  return [...output.childNodes];
}

/** ATX headings `#` through `#####` at the start of a line; deeper levels stay literal text. */
const headingLine = /^(#{1,5})[ \t]+(\S.*?)[ \t\r]*$/;
type HeadingLevel = 1 | 2 | 3 | 4 | 5;
const headingFontSizes: Record<HeadingLevel, string> = { 1: "2.5em", 2: "2em", 3: "1.75em", 4: "1.5em", 5: "1.25em" };

export interface BasicMarkdownBlocks {
  readonly hasHeadings: boolean;
  readonly nodes: readonly Node[];
}

/**
 * Renders the block-level Markdown subset: ATX headings become native `h1`..`h5`
 * elements and every other run of lines becomes inline content. Without any
 * heading the output is exactly the inline scanner's output.
 */
export function renderBasicMarkdownBlocks(document: Document, text: string): BasicMarkdownBlocks {
  const blocks: Array<{ level: HeadingLevel | undefined; text: string }> = [];
  for (const line of text.split("\n")) {
    const match = headingLine.exec(line);
    if (match !== null) {
      blocks.push({ level: match[1]!.length as HeadingLevel, text: match[2]! });
      continue;
    }
    const last = blocks.at(-1);
    if (last !== undefined && last.level === undefined) last.text += `\n${line}`;
    else blocks.push({ level: undefined, text: line });
  }
  if (blocks.every((block) => block.level === undefined)) {
    return { hasHeadings: false, nodes: renderBasicInlineMarkdown(document, text) };
  }
  const nodes: Node[] = [];
  for (const block of blocks) {
    if (block.level === undefined) {
      if (block.text === "") continue;
      const paragraph = document.createElement("p");
      paragraph.append(...renderBasicInlineMarkdown(document, block.text));
      nodes.push(paragraph);
      continue;
    }
    const heading = document.createElement(`h${block.level}`);
    heading.style.fontSize = headingFontSizes[block.level];
    heading.style.fontWeight = "700";
    heading.style.lineHeight = "1.2";
    heading.append(...renderBasicInlineMarkdown(document, block.text));
    nodes.push(heading);
  }
  return { hasHeadings: true, nodes };
}
