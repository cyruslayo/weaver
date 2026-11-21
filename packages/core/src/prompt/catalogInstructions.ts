const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const ATX_HEADING = /^( {0,3})(#{1,6})(?=[ \t]|$)/;

/**
 * Presentation only: moves ATX headings in catalog instructions one level
 * deeper, so they nest under the "Catalog instructions" section heading. Lines
 * inside fenced code blocks are left alone, and a `######` heading stays as it
 * is because Markdown has no deeper level. The text is otherwise unchanged,
 * and nothing is truncated or rewritten. It does not change the meaning of the
 * instructions, which the model reads as Markdown.
 */
export function demoteCatalogInstructionHeadings(markdown: string): string {
  let fence: { char: string; length: number } | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      if (fence !== undefined) {
        const close = FENCE_CLOSE.exec(line);
        if (close && close[1]![0] === fence.char && close[1]!.length >= fence.length) fence = undefined;
        return line;
      }
      const open = FENCE_OPEN.exec(line);
      if (open) {
        fence = { char: open[1]![0]!, length: open[1]!.length };
        return line;
      }
      const heading = ATX_HEADING.exec(line);
      if (heading && heading[2]!.length < 6) {
        return `${heading[1]}#${line.slice(heading[1]!.length)}`;
      }
      return line;
    })
    .join("\n");
}
