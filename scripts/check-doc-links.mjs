// Checks every relative Markdown link in the tracked .md files: the target file or
// directory must exist, and a #fragment must match a heading in that file, using
// GitHub's slug rules. External links (http, https, mailto) and links inside fenced
// code blocks are skipped. Prints one line per link and exits 1 if any link is broken.
//
// Usage: node scripts/check-doc-links.mjs [file.md ...]
// With no arguments, every git-tracked .md file in the repository is checked.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** GitHub's heading slug: lowercase, inline markup removed, punctuation dropped, spaces to hyphens. */
function slugOf(heading) {
  return heading
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** The set of anchors a Markdown file defines, with GitHub's -1, -2 suffixes for repeats. */
function anchorsOf(text) {
  const seen = new Map();
  const anchors = new Set();
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = slugOf(match[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/** Each link with its 1-based line number, skipping fenced code and inline code. */
function linksOf(text) {
  const links = [];
  let inFence = false;
  text.split("\n").forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const visible = line.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
    for (const match of visible.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ line: index + 1, target: match[2] });
    }
  });
  return links;
}

const explicit = process.argv.slice(2);
const files = explicit.length > 0
  ? explicit.map((file) => path.resolve(root, file))
  : execFileSync("git", ["ls-files", "-z", "*.md"], { cwd: root, encoding: "utf8" })
      .split("\0")
      .filter(Boolean)
      .map((file) => path.join(root, file));

const anchorCache = new Map();
const anchorsFor = (file) => {
  if (!anchorCache.has(file)) anchorCache.set(file, anchorsOf(readFileSync(file, "utf8")));
  return anchorCache.get(file);
};

let checked = 0;
let broken = 0;
for (const file of files) {
  const rel = path.relative(root, file);
  for (const { line, target } of linksOf(readFileSync(file, "utf8"))) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#$)/i.test(target)) continue;
    const [pathPart = "", fragment] = target.split("#", 2);
    const decoded = decodeURI(pathPart);
    const resolved = decoded === "" ? file : path.resolve(path.dirname(file), decoded);
    const where = `${rel}:${line}`;
    checked += 1;
    if (!existsSync(resolved)) {
      broken += 1;
      console.log(`BROKEN  ${where}  ${target}  (no such file or directory)`);
      continue;
    }
    if (fragment === undefined || fragment === "") {
      console.log(`OK      ${where}  ${target}`);
      continue;
    }
    if (statSync(resolved).isDirectory() || !resolved.endsWith(".md")) {
      console.log(`OK      ${where}  ${target}  (fragment not checked: not a Markdown file)`);
      continue;
    }
    if (!anchorsFor(resolved).has(fragment)) {
      broken += 1;
      console.log(`BROKEN  ${where}  ${target}  (no heading with anchor #${fragment})`);
      continue;
    }
    console.log(`OK      ${where}  ${target}  (anchor #${fragment} found)`);
  }
}
console.log(`\nChecked ${checked} relative links in ${files.length} Markdown files: ${checked - broken} OK, ${broken} broken.`);
process.exitCode = broken === 0 ? 0 : 1;
