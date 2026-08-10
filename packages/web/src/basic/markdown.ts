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
