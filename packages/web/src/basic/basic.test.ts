import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { RendererRegistry, type WebComponentInteractions, type WebComponentRenderInput, type WebComponentRenderer } from "../renderers/index.js";
import { createBasicCatalogRendererRegistrations } from "./createBasicCatalogRendererRegistrations.js";
import type { BasicIconResolver } from "./icon.js";
import type { BasicResourcePolicy } from "./media.js";

function setup(component: string, overrides: Partial<WebComponentRenderInput> = {}, resourcePolicy?: BasicResourcePolicy, iconResolver?: BasicIconResolver) {
  const window = new Window();
  const document = window.document as unknown as Document;
  const calls: string[] = [];
  const registration = createBasicCatalogRendererRegistrations({ catalogId: "test-basic", resourcePolicy, iconResolver })
    .find((candidate) => candidate.component === component);
  assert.ok(registration);
  const input = {
    document,
    surfaceId: "surface-test",
    catalogId: "test-basic",
    instance: { sourceComponentId: "root", component, scopePath: "/", definition: {}, properties: {}, relationships: [] },
    properties: {}, relationships: [],
    interactions: { registerControl: () => {}, getLocalState: (_key, fallback) => structuredClone(fallback), setLocalState: () => ({ ok: false, error: { code: "STALE_RENDER_INTERACTION" as const } }), writeInput: () => ({ ok: false, error: { code: "STALE_RENDER_INTERACTION" as const } }), dispatchAction: (property: string) => { calls.push(property); return { ok: false, error: { code: "STALE_RENDER_INTERACTION" as const } }; } },
    ...overrides,
  } as WebComponentRenderInput;
  return { document, calls, node: registration.render(input) as HTMLElement };
}

const child = (document: Document, text: string) => { const node = document.createElement("span"); node.textContent = text; return node; };

test("factory registers exactly the foundation components under the supplied catalog ID", () => {
  const registrations = createBasicCatalogRendererRegistrations({ catalogId: "not-an-official-url" });
  assert.deepEqual(registrations.map(({ component }) => component), ["Text", "Image", "Icon", "Video", "AudioPlayer", "Divider", "Row", "Column", "List", "Card", "Tabs", "Modal", "Button", "TextField", "CheckBox", "Slider", "ChoicePicker", "DateTimeInput"]);
  assert.ok(registrations.every(({ catalogId }) => catalogId === "not-an-official-url"));
});

test("Basic registrations compose with application registrations", () => {
  const application: WebComponentRenderer = ({ document }) => document.createElement("main");
  const registry = new RendererRegistry([...createBasicCatalogRendererRegistrations({ catalogId: "basic" }), { catalogId: "app", component: "Shell", render: application }]);
  assert.ok(registry.get("basic", "Text"));
  assert.equal(registry.get("app", "Shell"), application);
});

test("Icon renders explicit paths with inert native SVG DOM and fixed geometry", () => {
  const hostile = `M0 0 <script onclick="bad()">`;
  const svg = setup("Icon", { properties: { name: { svgPath: hostile } } }).node as unknown as SVGSVGElement;
  const path = svg.querySelector("path")!;
  assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(path.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(path.getAttribute("d"), hostile); assert.equal(path.getAttribute("fill"), "currentColor");
  assert.equal(svg.getAttribute("viewBox"), "0 0 24 24"); assert.equal(svg.getAttribute("width"), "24"); assert.equal(svg.getAttribute("height"), "24");
  assert.equal(svg.getAttribute("aria-hidden"), "true"); assert.equal(svg.getAttribute("focusable"), "false");
  assert.equal(svg.querySelector("script") === null, true, "no script in svg"); assert.equal(path.hasAttribute("onclick"), false);
});

test("Icon resolves names through its local host resolver and fails soft", () => {
  const requests: unknown[] = [];
  const resolver: BasicIconResolver = (request) => { requests.push(request); return request.name === "home" ? "M2 2" : undefined; };
  const named = setup("Icon", { properties: { name: "home" } }, undefined, resolver).node;
  assert.equal(named.querySelector("path")?.getAttribute("d"), "M2 2"); assert.deepEqual(requests, [{ name: "home" }]);
  const direct = setup("Icon", { properties: { name: { svgPath: "M3 3" } } }, undefined, resolver).node;
  assert.equal(direct.querySelector("path")?.getAttribute("d"), "M3 3"); assert.equal(requests.length, 1);
  for (const unresolved of [setup("Icon", { properties: { name: "home" } }).node, setup("Icon", { properties: { name: "unknown" } }, undefined, resolver).node, setup("Icon", { properties: { name: undefined } }).node]) {
    assert.equal(unresolved.getAttribute("data-a2ui-icon-state"), "unresolved"); assert.equal(unresolved.querySelector("path") === null, true, "no path");
  }
});

test("media defaults to deny and allows, rewrites, and identifies hydrated non-empty URLs", () => {
  for (const [component, selector] of [["Image", "img"], ["Video", "video"], ["AudioPlayer", "audio"]] as const) {
    const blocked = setup(component, { properties: { url: "https://agent.example/media" } }).node.querySelector(selector) ?? setup(component, { properties: { url: "https://agent.example/media" } }).node;
    assert.equal(blocked.hasAttribute("src"), false);
  }
  const requests: unknown[] = [];
  const policy: BasicResourcePolicy = (request) => { requests.push(request); return request.kind === "image" ? "/proxy/media/123" : request.url; };
  const image = setup("Image", { properties: { url: "https://agent.example/image.png" } }, policy).node;
  const video = setup("Video", { properties: { url: "/video.mp4" } }, policy).node as HTMLVideoElement;
  const audioFigure = setup("AudioPlayer", { properties: { url: "/audio.mp3" } }, policy).node;
  assert.equal(image.getAttribute("src"), "/proxy/media/123");
  assert.equal(video.getAttribute("src"), "/video.mp4");
  assert.equal(audioFigure.querySelector("audio")?.getAttribute("src"), "/audio.mp3");
  assert.deepEqual(requests, [{ kind: "image", url: "https://agent.example/image.png" }, { kind: "video", url: "/video.mp4" }, { kind: "audio", url: "/audio.mp3" }]);
});

test("media skips unavailable URLs and denied or empty rewrites", () => {
  let calls = 0;
  const policy: BasicResourcePolicy = () => { calls++; return undefined; };
  assert.equal(setup("Image", { properties: { url: "" } }, policy).node.hasAttribute("src"), false);
  assert.equal(setup("Video", { properties: { url: "  " } }, policy).node.hasAttribute("src"), false);
  assert.equal(calls, 0);
  assert.equal(setup("Image", { properties: { url: "/denied" } }, policy).node.getAttribute("data-a2ui-resource-state"), "blocked");
  assert.equal(calls, 1);
});

test("media URL rule rejects unsafe schemes and protocol-relative paths before the host policy runs", () => {
  const rejected = [
    "javascript:alert(1)", "JAVASCRIPT:alert(1)", "file:///etc/passwd", "content://app/x", "blob:https://example.com/x",
    "ftp://example.com/x", "ht\ttps://host/x", "https:host/x", "https:/host/x", "https://", "https:///path",
    "https:\\\\host/x", "//evil.example/x", "\t//evil.example/x", "/\\evil.example/x", "\\\\evil.example/x", "\\/evil.example/x",
  ];
  for (const component of ["Image", "Video", "AudioPlayer"] as const) {
    for (const url of rejected) {
      let calls = 0;
      const node = setup(component, { properties: { url } }, () => { calls++; return url; }).node;
      assert.equal(node.querySelector("[data-a2ui-resource-state]")?.getAttribute("data-a2ui-resource-state") ?? node.getAttribute("data-a2ui-resource-state"), "rejected", `${component} ${JSON.stringify(url)}`);
      assert.equal(calls, 0, `${component} ${JSON.stringify(url)} never reaches the policy`);
      assert.equal(node.querySelector("[src]") === null && !node.hasAttribute("src"), true, `${component} ${JSON.stringify(url)} renders no src`);
    }
  }
});

test("media URL rule accepts trimmed http(s) with a host, data URLs, and same-host relative paths", () => {
  const eligible: Array<[string, string]> = [
    ["https://cdn.example/a.png", "https://cdn.example/a.png"],
    ["  https://cdn.example/a.png \n", "https://cdn.example/a.png"],
    ["HTTPS://Cdn.Example/A.png", "HTTPS://Cdn.Example/A.png"],
    ["http://127.0.0.1:8080/x", "http://127.0.0.1:8080/x"],
    ["data:image/png;base64,AAAA", "data:image/png;base64,AAAA"],
    ["/assets/a.png", "/assets/a.png"],
    ["assets/a.png", "assets/a.png"],
    ["./a.png", "./a.png"],
  ];
  for (const [url, expected] of eligible) {
    const seen: string[] = [];
    const node = setup("Image", { properties: { url } }, (request) => { seen.push(request.url); return request.url; }).node;
    assert.deepEqual(seen, [expected], url);
    assert.equal(node.getAttribute("src"), expected, url);
  }
});

test("media URL rule trims control characters and never replaces the host policy", () => {
  const policy: BasicResourcePolicy = () => undefined;
  const node = setup("Video", { properties: { url: "https://cdn.example/v.mp4" } }, policy).node;
  assert.equal(node.getAttribute("data-a2ui-resource-state"), "blocked");
  assert.equal(setup("AudioPlayer", { properties: { url: "\u0000\u0001  " } }).node.querySelector("audio")?.getAttribute("data-a2ui-resource-state"), "unavailable");
  // A host policy may approve even a non-spec string, but only the policy's output is loaded.
  assert.equal(setup("Image", { properties: { url: "/a.png" } }, () => "/proxy/a.png").node.getAttribute("src"), "/proxy/a.png");
});

test("Video posterUrl is deny-by-default, uses the image policy, and follows the same URL rule", () => {
  const blocked = setup("Video", { properties: { url: "/v.mp4", posterUrl: "/poster.png" } }).node as HTMLVideoElement;
  assert.equal(blocked.hasAttribute("poster"), false);
  assert.equal(blocked.getAttribute("data-a2ui-poster-state"), "blocked");
  assert.equal(blocked.getAttribute("data-a2ui-resource-state"), "blocked");

  const requests: unknown[] = [];
  const policy: BasicResourcePolicy = (request) => { requests.push(request); return request.kind === "image" ? "/proxy/poster.png" : request.url; };
  const approved = setup("Video", { properties: { url: "/v.mp4", posterUrl: "  /poster.png  " } }, policy).node as HTMLVideoElement;
  assert.equal(approved.getAttribute("poster"), "/proxy/poster.png");
  assert.equal(approved.getAttribute("src"), "/v.mp4");
  assert.deepEqual(requests, [{ kind: "video", url: "/v.mp4" }, { kind: "image", url: "/poster.png" }]);

  for (const posterUrl of ["javascript:alert(1)", "//evil.example/p.png", "https:host/p.png", "", undefined, 42]) {
    let calls = 0;
    const video = setup("Video", { properties: { url: "/v.mp4", posterUrl } }, (request) => { if (request.kind === "image") calls++; return "/p.png"; }).node as HTMLVideoElement;
    assert.equal(video.hasAttribute("poster"), false, String(posterUrl));
    assert.equal(calls, 0, `${String(posterUrl)} never reaches the policy`);
  }
  const absent = setup("Video", { properties: { url: "/v.mp4" } }, policy).node as HTMLVideoElement;
  assert.equal(absent.getAttribute("data-a2ui-poster-state"), "unavailable");
  assert.equal(setup("AudioPlayer", { properties: { url: "/a.mp3", posterUrl: "/p.png" } }, policy).node.querySelector("audio")?.hasAttribute("poster"), false);
});

test("Image maps native accessibility, fit, and variant behavior", () => {
  const fits = { contain: "contain", cover: "cover", fill: "fill", none: "none", scaleDown: "scale-down" };
  for (const [fit, css] of Object.entries(fits)) assert.equal(setup("Image", { properties: { fit } }).node.style.objectFit, css);
  const unsafe = setup("Image", { properties: { description: "<script>x</script>", fit: "bad", variant: "avatar" } }).node as HTMLImageElement;
  assert.equal(unsafe.tagName, "IMG"); assert.equal(unsafe.alt, "<script>x</script>"); assert.equal(unsafe.querySelector("script") === null, true, "no script");
  assert.equal(unsafe.style.objectFit, "fill"); assert.equal(unsafe.getAttribute("data-a2ui-variant"), "avatar"); assert.equal(unsafe.style.borderRadius, "50%");
  assert.equal((setup("Image").node as HTMLImageElement).alt, "");
  for (const variant of ["icon", "avatar", "smallFeature", "mediumFeature", "largeFeature", "header"]) assert.equal(setup("Image", { properties: { variant } }).node.getAttribute("data-a2ui-variant"), variant);
});

test("Image variants retain explicit geometry even when resources are denied", () => {
  const expected = {
    icon: ["24px", "24px", "100%", ""], avatar: ["40px", "40px", "100%", ""],
    smallFeature: ["100px", "100px", "100%", ""], mediumFeature: ["100%", "", "300px", ""],
    largeFeature: ["100%", "", "100%", "400px"], header: ["100%", "200px", "100%", ""],
  } as const;
  for (const [variant, geometry] of Object.entries(expected)) {
    const image = setup("Image", { properties: { variant, url: "/denied" } }).node;
    assert.deepEqual([image.style.width, image.style.height, image.style.maxWidth, image.style.maxHeight], geometry);
    assert.equal(image.hasAttribute("src"), false); assert.equal(image.style.display, "block"); assert.match(image.getAttribute("style") ?? "", /margin: var\(--a2ui-space, 8px\)/);
  }
  assert.equal(setup("Image", { properties: { variant: "avatar" } }).node.style.borderRadius, "50%");
});

test("Video and AudioPlayer use native controls without autoplay and safe captions", () => {
  const video = setup("Video").node as HTMLVideoElement;
  assert.equal(video.tagName, "VIDEO"); assert.equal(video.controls, true); assert.equal(video.autoplay, false);
  const figure = setup("AudioPlayer", { properties: { description: "<script>alert(1)</script>" } }).node;
  const audio = figure.querySelector("audio")!;
  assert.equal(audio.controls, true); assert.equal(audio.autoplay, false); assert.equal(figure.querySelector("figcaption")?.textContent, "<script>alert(1)</script>"); assert.equal(figure.querySelector("script") === null, true, "no script in figure");
  assert.equal(setup("AudioPlayer").node.querySelector("figcaption") === null, true, "no figcaption");
});

test("Text selects native semantic elements; only caption and body variants exist", () => {
  assert.equal(setup("Text", { properties: { text: "x", variant: "caption" } }).node.tagName, "SMALL");
  assert.equal(setup("Text", { properties: { text: "x", variant: "body" } }).node.tagName, "P");
  assert.equal(setup("Text", { properties: { text: "x" } }).node.tagName, "P");
  // Removed v0.9.1 heading variants fall back to body instead of selecting a heading element.
  for (const variant of ["h1", "h2", "h3", "h4", "h5", "unknown"]) assert.equal(setup("Text", { properties: { text: "x", variant } }).node.tagName, "P", variant);
});

test("Text Markdown headings render as native h1..h5 elements inside a div root", () => {
  const node = setup("Text", { properties: { text: "# One\n## Two\n### Three\n#### Four\n##### Five\nbody **strong**" } }).node;
  assert.equal(node.tagName, "DIV");
  assert.deepEqual([...node.children].map((item) => item.tagName), ["H1", "H2", "H3", "H4", "H5", "P"]);
  assert.deepEqual([...node.querySelectorAll("h1,h2,h3,h4,h5")].map((item) => (item as HTMLElement).style.fontSize), ["2.5em", "2em", "1.75em", "1.5em", "1.25em"]);
  assert.equal(node.querySelector("h1")?.textContent, "One");
  assert.equal(node.querySelector("p strong")?.textContent, "strong");
  assert.equal(node.querySelector("h2")?.style.fontWeight, "700");
});

test("Text Markdown heading syntax is strict: six hashes, missing space, and empty headings stay literal", () => {
  for (const text of ["###### six", "#nospace", "#", "# ", "    # indented"]) {
    const node = setup("Text", { properties: { text } }).node;
    assert.equal(node.tagName, "P", text);
    assert.equal(node.querySelector("h1,h2,h3,h4,h5,h6") === null, true, text);
    assert.equal(node.textContent, text, text);
  }
  const mixed = setup("Text", { properties: { text: "# Title\n" } }).node;
  assert.equal(mixed.querySelector("h1")?.textContent, "Title");
  assert.equal(setup("Text", { properties: { text: "# Windows\r\nbody" } }).node.querySelector("h1")?.textContent, "Windows");
});

test("Text variants own deterministic typography, margin, and inherited color", () => {
  const sizes = { caption: "0.8em", body: "1em" };
  for (const [variant, size] of Object.entries(sizes)) {
    const node = setup("Text", { properties: { variant, text: "x" } }).node;
    assert.equal(node.style.fontSize, size); assert.match(node.getAttribute("style") ?? "", /margin: var\(--a2ui-space, 8px\)/); assert.equal(node.style.color, "");
  }
  const caption = setup("Text", { properties: { variant: "caption", text: "x" } }).node;
  assert.equal(caption.style.fontStyle, "italic"); assert.equal(caption.style.fontWeight, "normal");
});

test("Text safely renders the supported inline Markdown subset", () => {
  const node = setup("Text", { properties: { text: "Hello **strong** __also__ *em* _too_ `code`\nnext" } }).node;
  assert.deepEqual([...node.querySelectorAll("strong")].map((item) => item.textContent), ["strong", "also"]);
  assert.deepEqual([...node.querySelectorAll("em")].map((item) => item.textContent), ["em", "too"]);
  assert.equal(node.querySelector("code")?.textContent, "code");
  assert.equal(node.querySelectorAll("br").length, 1);
});

test("Text Markdown treats HTML, links, images, code contents, and headings as inert text", () => {
  const source = "# Heading <b>bold?</b> <script>alert(1)</script> [click](javascript:alert(1)) ![x](https://example.com/x.png) `<script>x</script>`";
  const node = setup("Text", { properties: { text: source } }).node;
  assert.equal(node.querySelector("h1")?.textContent, source.slice("# ".length).replaceAll("`", ""));
  for (const selector of ["b", "script", "a", "img"]) assert.equal(node.querySelector(selector) === null, true, `no ${selector}`);
  assert.equal(node.querySelector("code")?.textContent, "<script>x</script>");
  const paragraph = setup("Text", { properties: { text: "<b>bold</b> [link](https://x.example) ![img](https://x.example/i.png)" } }).node;
  for (const selector of ["b", "a", "img"]) assert.equal(paragraph.querySelector(selector) === null, true, `no ${selector} in paragraph`);
  assert.equal(paragraph.textContent, "<b>bold</b> [link](https://x.example) ![img](https://x.example/i.png)");
});

test("Text Markdown preserves escapes, malformed markers, variants, and missing text", () => {
  assert.equal(setup("Text", { properties: { text: String.raw`\*literal* \_literal_ \`literal\` \\` } }).node.textContent, "*literal* _literal_ `literal` \\");
  for (const text of ["**hello", "`code", "text_"]) assert.equal(setup("Text", { properties: { text } }).node.textContent, text);
  assert.equal(setup("Text", { properties: { variant: "h2", text: "Hello **world**" } }).node.querySelector("strong")?.textContent, "world");
  assert.equal(setup("Text", { properties: { variant: "h2", text: "Hello **world**" } }).node.tagName, "P");
  assert.equal(setup("Text", { properties: { variant: "caption", text: "*small*" } }).node.tagName, "SMALL");
  assert.equal(setup("Text", { properties: { text: undefined } }).node.textContent, "");
  assert.equal(setup("Text", { properties: { text: null } }).node.textContent, "");
});

test("Row and Column preserve children and apply mapped layout defaults", () => {
  for (const [component, direction] of [["Row", "row"], ["Column", "column"]] as const) {
    const base = setup(component); const children = [child(base.document, "a"), child(base.document, "b")];
    const rendered = setup(component, { relationships: [{ kind: "list", property: "children", location: [{ kind: "property", name: "children" }], children }] }).node;
    assert.equal(rendered.textContent, "ab"); assert.equal(rendered.style.display, "flex"); assert.equal(rendered.style.flexDirection, direction);
    assert.equal(rendered.style.justifyContent, "flex-start"); assert.equal(rendered.style.alignItems, "stretch");
    const mapped = setup(component, { properties: { justify: "spaceBetween", align: "end" } }).node;
    assert.equal(mapped.style.justifyContent, "space-between"); assert.equal(mapped.style.alignItems, "flex-end");
  }
});

test("Row and Column implement main-axis stretch with explicit weights taking precedence", () => {
  for (const component of ["Row", "Column"] as const) {
    const base = setup(component);
    const children = ["weighted", "zero", "fraction", "unweighted", "negative"].map((text) => child(base.document, text));
    const rendered = setup(component, { properties: { justify: "stretch" }, relationships: [{
      kind: "list", property: "children", location: [{ kind: "property", name: "children" }], children,
      childProperties: [{ weight: 2 }, { weight: 0 }, { weight: 1.5 }, {}, { weight: -2 }],
    }] }).node;
    assert.equal(rendered.style.justifyContent, "flex-start");
    assert.deepEqual([...rendered.children].map((node) => (node as HTMLElement).style.flexGrow), ["2", "0", "1.5", "1", "1"]);
  }
});

test("Row and Column preserve all non-stretch justify mappings and cross-axis stretch", () => {
  const mappings = { start: "flex-start", center: "center", end: "flex-end", spaceBetween: "space-between", spaceAround: "space-around", spaceEvenly: "space-evenly" };
  for (const component of ["Row", "Column"] as const) for (const [justify, expected] of Object.entries(mappings)) {
    const node = setup(component, { properties: { justify, align: "stretch" } }).node;
    assert.equal(node.style.justifyContent, expected); assert.equal(node.style.alignItems, "stretch");
  }
});

test("Row and Column apply only usable direct-child weights", () => {
  for (const component of ["Row", "Column"] as const) {
    const base = setup(component);
    const children = ["zero", "fraction", "omitted", "negative"].map((text) => child(base.document, text));
    const rendered = setup(component, { relationships: [{
      kind: "list", property: "children", location: [{ kind: "property", name: "children" }], children,
      childComponents: ["Text", "Text", "Text", "Text"],
      childProperties: [{ weight: 0 }, { weight: 1.5 }, {}, { weight: -2 }],
    }] }).node;
    assert.deepEqual([...rendered.children].map((node) => (node as HTMLElement).style.flexGrow), ["0", "1.5", "", ""]);
  }
});

test("Row weights a direct Card but not nested children, while non-layout parents ignore weight", () => {
  const base = setup("Row");
  const nestedText = child(base.document, "nested");
  const card = setup("Card", { relationships: [{
    kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: nestedText,
    childComponent: "Text", childProperties: { weight: 5 },
  }] }).node;
  const row = setup("Row", { relationships: [{
    kind: "list", property: "children", location: [{ kind: "property", name: "children" }], children: [card],
    childComponents: ["Card"], childProperties: [{ weight: 5 }],
  }] }).node;
  assert.equal(card.style.flexGrow, "5"); assert.equal(nestedText.style.flexGrow, ""); assert.ok(row.firstChild === card, "card is the first child");

  const listChild = child(base.document, "list");
  const list = setup("List", { relationships: [{
    kind: "list", property: "children", location: [{ kind: "property", name: "children" }], children: [listChild],
    childComponents: ["Text"], childProperties: [{ weight: 3 }],
  }] }).node;
  assert.equal(listChild.style.flexGrow, "");
});

test("Row ignores weight for non-Element custom renderer nodes", () => {
  const base = setup("Row"); const text = base.document.createTextNode("plain");
  const row = setup("Row", { relationships: [{
    kind: "list", property: "children", location: [{ kind: "property", name: "children" }], children: [text],
    childComponents: ["Custom"], childProperties: [{ weight: 2 }],
  }] }).node;
  assert.equal(row.textContent, "plain");
});

test("List wraps ordered static/template children with directional native scrolling", () => {
  const base = setup("List"); const children = [child(base.document, "a"), child(base.document, "b")];
  for (const kind of ["list", "template"] as const) {
    const horizontal = setup("List", { properties: { direction: "horizontal", align: "center" }, relationships: [{ kind, property: "children", location: [{ kind: "property", name: "children" }], children }] }).node;
    assert.equal(horizontal.getAttribute("role"), "list"); assert.equal(horizontal.style.flexDirection, "row"); assert.equal(horizontal.style.alignItems, "center");
    assert.equal(horizontal.style.overflowX, "auto"); assert.equal(horizontal.style.overflowY, "hidden"); assert.equal(horizontal.style.flexWrap, "nowrap");
    assert.deepEqual([...horizontal.children].map((item) => [item.getAttribute("role"), item.textContent, (item as HTMLElement).style.flexShrink, (item as HTMLElement).style.maxWidth]), [["listitem", "a", "0", "100%"], ["listitem", "b", "0", "100%"]]);
  }
  const vertical = setup("List", { relationships: [{ kind: "list", property: "children", location: [{ kind: "property", name: "children" }], children }] }).node;
  assert.equal(vertical.style.overflowY, "auto"); assert.equal(vertical.style.overflowX, "hidden");
  assert.equal(vertical.style.minHeight, "0"); assert.equal(vertical.style.minWidth, "0"); assert.equal((vertical.firstElementChild as HTMLElement).style.flexShrink, "");
  assert.equal(setup("List").node.children.length, 0);
});

test("Card appends one resolved child and tolerates a missing child", () => {
  const base = setup("Card"); const content = child(base.document, "content");
  assert.equal(setup("Card", { relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: content }] }).node.textContent, "content");
  assert.equal(setup("Card").node.childNodes.length, 0);
});

test("Basic leaf spacing excludes structural containers and outlined roots own one margin", () => {
  for (const component of ["Row", "Column", "List"]) { const node = setup(component).node; assert.equal(node.style.margin, ""); assert.equal(node.style.padding, ""); }
  for (const component of ["Text", "Image", "Icon", "Video", "AudioPlayer", "Divider", "Slider", "Card", "Button", "TextField", "CheckBox", "ChoicePicker", "DateTimeInput"]) {
    assert.match(setup(component).node.getAttribute("style") ?? "", /margin: var\(--a2ui-space, 8px\)/, component);
  }
  const field = setup("TextField").node;
  for (const child of field.children) assert.doesNotMatch(child.getAttribute("style") ?? "", /margin: var\(--a2ui-space/);
});

test("Card uses a transparent repeatable boundary without overwriting weight", () => {
  const inner = setup("Card").node; const outer = setup("Card", { relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: inner }] }).node;
  for (const card of [outer, inner]) { const style = card.getAttribute("style") ?? ""; assert.match(style, /--a2ui-color-outline/); assert.match(style, /--a2ui-radius/); assert.equal(card.style.padding, "16px"); assert.equal(card.style.background, "transparent"); assert.match(style, /--a2ui-card-shadow/); }
  outer.style.flexGrow = "2"; assert.equal(outer.style.flexGrow, "2");
});

test("Tabs maps repeated structural child locations and exposes accessible positional headers", () => {
  const base = setup("Tabs");
  const first = child(base.document, "first");
  const second = child(base.document, "second");
  const rendered = setup("Tabs", {
    properties: { tabs: [{ title: "Overview" }, { title: undefined }, { title: null }] },
    relationships: [
      { kind: "single", property: "child", location: [{ kind: "property", name: "tabs" }, { kind: "arrayIndex", index: 1 }, { kind: "property", name: "child" }], child: second },
      { kind: "single", property: "child", location: [{ kind: "property", name: "tabs" }, { kind: "arrayIndex", index: 0 }, { kind: "property", name: "child" }], child: first },
    ],
  }).node;
  const buttons = [...rendered.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panel = rendered.querySelector<HTMLElement>('[role="tabpanel"]')!;
  assert.deepEqual(buttons.map((button) => button.textContent), ["Overview", "", ""]);
  assert.deepEqual(buttons.map((button) => [button.type, button.getAttribute("aria-selected"), button.tabIndex]), [["button", "true", 0], ["button", "false", -1], ["button", "false", -1]]);
  assert.equal(rendered.querySelector('[role="tablist"]')?.children.length, 3);
  assert.equal(panel.textContent, "first");
  assert.equal(buttons[0]?.getAttribute("aria-controls"), panel.id);
  assert.equal(panel.getAttribute("aria-labelledby"), buttons[0]?.id);
  assert.match(buttons[0]?.getAttribute("style") ?? "", /--a2ui-color-primary/);
  assert.equal(buttons[1]?.hasAttribute("style"), false);
  assert.equal(rendered.textContent?.includes("second"), false);
  assert.equal([...buttons, panel].some((element) => element.id.includes("root") || element.id.includes("/")), false);
});

test("Modal renders direct trigger/content branches, intercepts trigger actions, and supplies fallback keyboard semantics", () => {
  const base = setup("Modal");
  const button = base.document.createElement("button"); button.type = "button"; button.textContent = "Open";
  let childActions = 0; button.addEventListener("click", () => childActions++);
  const state: unknown[] = []; const controls: Array<[Element, string]> = [];
  const modalInteractions = (open: unknown): WebComponentInteractions => ({
    registerControl: (element: Element, key: string) => { controls.push([element, key]); },
    getLocalState: <T>(_key: string, _fallback: T) => open as T,
    setLocalState: (_key: string, value: unknown) => { state.push(value); return { ok: true as const }; },
    writeInput: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }),
    dispatchAction: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }),
  });
  const closed = setup("Modal", { relationships: [
    { kind: "single", property: "trigger", location: [{ kind: "property", name: "trigger" }], child: button },
    { kind: "single", property: "content", location: [{ kind: "property", name: "content" }], child: child(base.document, "Hidden") },
  ], interactions: modalInteractions(false) }).node;
  assert.equal(closed.textContent, "Open"); assert.equal(closed.textContent?.includes("Hidden"), false);
  button.click(); assert.deepEqual(state, [true]); assert.equal(childActions, 0); assert.equal(controls.at(-1)?.[1], "modal-focus");

  state.length = 0;
  const textTrigger = child(base.document, "Details");
  const fallback = setup("Modal", { relationships: [{ kind: "single", property: "trigger", location: [{ kind: "property", name: "trigger" }], child: textTrigger }], interactions: modalInteractions(false) }).node;
  const wrapper = fallback.querySelector<HTMLElement>('[role="button"]')!;
  assert.equal(wrapper.tabIndex, 0); fireKey(wrapper, "keydown", "Enter"); assert.deepEqual(state, [true]);
  state.length = 0; fireKey(wrapper, "keydown", " "); fireKey(wrapper, "keyup", " "); assert.deepEqual(state, [true]);
  assert.equal(setup("Modal", { interactions: modalInteractions(true) }).node.childNodes.length, 0, "missing trigger stays empty");
});

test("open Modal has accessible dialog, local dismissal, content isolation, and focus wrapping", () => {
  const base = setup("Modal"); const content = base.document.createElement("section");
  const input = base.document.createElement("input"); const action = base.document.createElement("button"); action.textContent = "Act"; content.append(input, action);
  const states: unknown[] = []; const controls: Array<[Element, string]> = [];
  const node = setup("Modal", { relationships: [
    { kind: "single", property: "trigger", location: [{ kind: "property", name: "trigger" }], child: child(base.document, "Trigger") },
    { kind: "single", property: "content", location: [{ kind: "property", name: "content" }], child: content },
  ], interactions: {
    registerControl: (element: Element, key: string) => { controls.push([element, key]); }, getLocalState: <T>(_key: string, _fallback: T) => true as T,
    setLocalState: (_key: string, value: unknown) => { states.push(value); return { ok: true as const }; },
    writeInput: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }), dispatchAction: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }),
  } }).node;
  const backdrop = node.querySelector<HTMLElement>('[data-a2ui-modal-backdrop]')!;
  const dialog = node.querySelector<HTMLElement>('[role="dialog"]')!; const close = dialog.querySelector<HTMLButtonElement>('button')!;
  assert.equal(dialog.getAttribute("aria-modal"), "true"); assert.equal(dialog.getAttribute("aria-label"), "Modal dialog"); assert.equal(close.type, "button"); assert.equal(close.getAttribute("aria-label"), "Close");
  assert.equal(node.textContent?.includes("Trigger"), false); assert.equal(node.textContent?.includes("Act"), true); assert.equal(controls.at(-1)?.[1], "modal-focus");
  states.length = 0; content.click(); assert.deepEqual(states, []); backdrop.click(); assert.deepEqual(states, [false]);
  states.length = 0; close.click(); assert.deepEqual(states, [false]); states.length = 0; input.focus(); fireKey(dialog, "keydown", "Escape"); assert.deepEqual(states, [false]);
});

test("Divider uses explicit one-pixel full-span geometry and separator semantics", () => {
  const horizontal = setup("Divider", { properties: { axis: "horizontal" } }).node;
  assert.equal(horizontal.tagName, "HR"); assert.match(horizontal.getAttribute("style") ?? "", /border-block-start: 1px solid var\(--a2ui-color-outline/); assert.equal(horizontal.style.width, "auto");
  const vertical = setup("Divider", { properties: { axis: "vertical" } }).node;
  assert.equal(vertical.tagName, "DIV"); assert.equal(vertical.getAttribute("role"), "separator"); assert.equal(vertical.getAttribute("aria-orientation"), "vertical");
  assert.equal(vertical.style.alignSelf, "stretch"); assert.equal(vertical.style.width, "0px"); assert.match(vertical.getAttribute("style") ?? "", /border-inline-start: 1px solid var\(--a2ui-color-outline/);
});

test("Button appends child, emits one action, and exposes only safe variant hooks", () => {
  const base = setup("Button"); const label = child(base.document, "Go");
  const rendered = setup("Button", { properties: { variant: "primary" }, relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: label }] });
  assert.equal(rendered.node.tagName, "BUTTON"); assert.equal((rendered.node as HTMLButtonElement).type, "button"); assert.equal(rendered.node.textContent, "Go");
  assert.equal(rendered.node.getAttribute("data-a2ui-variant"), "primary");
  assert.match(rendered.node.getAttribute("style") ?? "", /background-color: var\(--a2ui-color-primary, #0969da\)/);
  assert.match(rendered.node.getAttribute("style") ?? "", /color: var\(--a2ui-color-on-primary, white\)/);
  rendered.node.click(); assert.deepEqual(rendered.calls, ["action"]);
  const fallback = setup("Button", { properties: { variant: "anything" } }).node;
  assert.equal(fallback.getAttribute("data-a2ui-variant"), "default"); assert.match(fallback.getAttribute("style") ?? "", /--a2ui-color-control/);
  assert.equal(setup("Button", { properties: { variant: "borderless" } }).node.style.backgroundColor, "transparent");
});

test("Button variants have closed visual treatments and preserve child color inheritance", () => {
  const base = setup("Button");
  for (const variant of ["default", "primary", "borderless"] as const) {
    const text = setup("Text", { properties: { text: "Go" } }).node;
    const button = setup("Button", { properties: { variant }, relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: text }] }).node;
    const style = button.getAttribute("style") ?? ""; assert.match(style, /--a2ui-space/); assert.match(style, /--a2ui-radius/); assert.equal(text.style.color, "");
    if (variant === "primary") { assert.match(style, /--a2ui-color-primary/); assert.match(style, /--a2ui-color-on-primary/); }
    if (variant === "borderless") { assert.equal(button.style.backgroundColor, "transparent"); assert.match(button.style.border, /transparent/); }
  }
});

// WVR-058: WCAG 2.x contrast computed from real renderer output. happy-dom does not resolve var(), so the
// fallback is read explicitly from the rendered style and must be a plain #RRGGBB or "white" literal.
const relativeLuminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrastRatio = (first: string, second: string): number => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
};
const literalColour = (value: string): string => {
  const colour = value.trim().toLowerCase();
  if (colour === "white") return "#ffffff";
  if (/^#[0-9a-f]{3}$/.test(colour)) return `#${[...colour.slice(1)].map((digit) => digit + digit).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(colour)) return colour;
  throw new Error(`unresolvable colour literal: ${value}`);
};
const varFallback = (css: string, variable: string): string => {
  const match = new RegExp(`var\\(${variable}, ([^)]+)\\)`).exec(css);
  assert.ok(match !== null, `no var(${variable}) with a fallback in ${css}`);
  return literalColour(match![1]!);
};

test("primary Button text meets WCAG AA 4.5:1 with the default fallback, enabled and focused (WVR-058)", () => {
  const label = child(setup("Button").document, "Go");
  const { document, node } = setup("Button", { properties: { variant: "primary" }, relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: label }] });
  document.body.append(node);
  const button = node as HTMLButtonElement;
  const style = button.getAttribute("style") ?? "";
  const background = varFallback(style, "--a2ui-color-primary");
  const text = varFallback(style, "--a2ui-color-on-primary");
  assert.equal(button.disabled, false);
  const enabledRatio = contrastRatio(text, background);
  assert.ok(enabledRatio >= 4.5, `enabled primary Button contrast ${enabledRatio.toFixed(4)} is below 4.5`);
  button.focus();
  assert.equal(document.activeElement === button, true);
  const focusedRatio = contrastRatio(text, background);
  assert.ok(focusedRatio >= 4.5, `focused primary Button contrast ${focusedRatio.toFixed(4)} is below 4.5`);
});

test("selected Tabs label meets 4.5:1 and its underline meets 3:1 against white (WVR-058)", () => {
  const first = child(setup("Tabs").document, "first");
  const node = setup("Tabs", {
    properties: { tabs: [{ title: "Overview" }] },
    relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "tabs" }, { kind: "arrayIndex", index: 0 }, { kind: "property", name: "child" }], child: first }],
  }).node;
  const selected = node.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  assert.equal(selected !== null, true);
  const style = selected?.getAttribute("style") ?? "";
  const labelRatio = contrastRatio(varFallback(style, "--a2ui-color-primary"), "#ffffff");
  const underlineRatio = contrastRatio(varFallback(style.slice(style.indexOf("border-block-end")), "--a2ui-color-primary"), "#ffffff");
  assert.ok(labelRatio >= 4.5, `Tabs label contrast ${labelRatio.toFixed(4)} is below 4.5`);
  assert.ok(underlineRatio >= 3, `Tabs underline contrast ${underlineRatio.toFixed(4)} is below 3`);
});

test("checked CheckBox, Slider and ChoicePicker accents meet 3:1 non-text contrast against white (WVR-058)", () => {
  const checkBox = setup("CheckBox", { properties: { label: "Ready", value: true } }).node.querySelector<HTMLInputElement>("input");
  const slider = setup("Slider", { properties: { max: 10, value: 2.5 } }).node.querySelector<HTMLInputElement>("input");
  const chips = setup("ChoicePicker", { properties: { options: [{ label: "A", value: "a" }], value: ["a"], displayStyle: "chips" } }).node.querySelector<HTMLElement>("label");
  assert.equal(checkBox !== null && slider !== null && chips !== null, true);
  const ratios = [
    contrastRatio(varFallback(checkBox?.style.accentColor ?? "", "--a2ui-color-primary"), "#ffffff"),
    contrastRatio(varFallback(slider?.style.accentColor ?? "", "--a2ui-color-primary"), "#ffffff"),
    contrastRatio(varFallback(chips?.getAttribute("style") ?? "", "--a2ui-color-primary"), "#ffffff"),
  ];
  for (const ratio of ratios) assert.ok(ratio >= 3, `non-text accent contrast ${ratio.toFixed(4)} is below 3`);
});


test("Basic inputs use native controls and normalized writes", () => {
  const cases = [
    ["TextField", { label: "Name", value: "42.5", variant: "number" }, "input", "input"],
    ["CheckBox", { label: "Ready", value: true }, "input", "change"],
    ["Slider", { max: 10, value: 2.5 }, "input", "input"],
  ] as const;
  for (const [component, properties, selector, event] of cases) {
    const writes: unknown[] = [];
    const rendered = setup(component, { properties, interactions: interactions(writes) }).node;
    const control = rendered.querySelector(selector) as HTMLInputElement;
    if (component === "TextField") { assert.equal(control.type, "number"); control.value = "7.5"; }
    if (component === "CheckBox") { assert.equal(control.checked, true); assert.equal(control.style.accentColor, "var(--a2ui-color-primary, #0969da)"); control.checked = false; }
    if (component === "Slider") { assert.equal(control.style.accentColor, "var(--a2ui-color-primary, #0969da)"); assert.equal(control.min, "0"); assert.equal(control.max, "10"); assert.equal(control.step, "any"); control.value = "4.25"; }
    fire(control, event);
    assert.deepEqual(writes[0], ["value", component === "CheckBox" ? false : component === "Slider" ? 4.25 : "7.5"]);
  }
  assert.equal((setup("Slider", { properties: { max: 10 } }).node.querySelector("input") as HTMLInputElement).disabled, true);
});

test("TextField renders placeholder, disables an unresolved required value, and writes bound text", () => {
  const writes: unknown[] = [];
  const bound = setup("TextField", { properties: { label: "Name", value: "Ada", placeholder: "Enter name" }, interactions: interactions(writes) }).node.querySelector("input")!;
  assert.equal(bound.placeholder, "Enter name"); assert.equal(bound.disabled, false); assert.equal(bound.value, "Ada");
  const unresolved = setup("TextField", { properties: { label: "Name" } }).node.querySelector("input")!;
  assert.equal(unresolved.disabled, true); assert.equal(unresolved.hasAttribute("placeholder"), false);
});

test("Slider steps divide the range into equal intervals and snap written values", () => {
  const writes: unknown[] = [];
  const stepped = setup("Slider", { properties: { min: 0, max: 10, steps: 4, value: 2.5 }, interactions: interactions(writes) }).node.querySelector("input") as HTMLInputElement;
  assert.equal(stepped.step, "2.5");
  stepped.value = "4.2"; fire(stepped, "input");
  assert.deepEqual(writes, [["value", 5]]);
  stepped.value = "10"; fire(stepped, "input");
  assert.deepEqual(writes.at(-1), ["value", 10]);
  for (const steps of [0, 1.5, "4", -1, undefined]) {
    assert.equal((setup("Slider", { properties: { min: 0, max: 10, value: 1, steps } }).node.querySelector("input") as HTMLInputElement).step, "any", String(steps));
  }
  const offset = setup("Slider", { properties: { min: 1, max: 2, steps: 3, value: 1 }, interactions: interactions(writes) }).node.querySelector("input") as HTMLInputElement;
  assert.equal(offset.step, String(1 / 3));
  offset.value = "1.4"; fire(offset, "input");
  assert.deepEqual(writes.at(-1), ["value", 1.3333333333]);
});

test("Basic inputs render Core check messages by severity; advisory checks never block", () => {
  const advisory = { sourceComponentId: "root", scopePath: "/", checkable: true, status: "valid" as const, checks: [{ index: 0, status: "advisory" as const, severity: "warning" as const, message: "Consider a longer name", issues: [] }] };
  const advisoryNode = setup("TextField", { properties: { value: "A" }, checks: advisory }).node;
  assert.equal(advisoryNode.getAttribute("data-a2ui-validation-state"), "valid");
  const input = advisoryNode.querySelector("input")!;
  assert.notEqual(input.getAttribute("aria-invalid"), "true"); assert.equal(input.disabled, false);
  const note = advisoryNode.querySelector('[data-a2ui-check-status="advisory"]')!;
  assert.equal(note.textContent, "Consider a longer name"); assert.equal(note.getAttribute("data-a2ui-check-severity"), "warning");
  assert.equal(input.getAttribute("aria-describedby"), note.id);

  const failed = { sourceComponentId: "root", scopePath: "/", checkable: true, status: "invalid" as const, checks: [
    { index: 0, status: "failed" as const, severity: "error" as const, message: "Required", issues: [] },
    { index: 1, status: "advisory" as const, severity: "info" as const, message: "Tip", issues: [] },
  ] };
  const blocked = setup("CheckBox", { properties: { label: "Accept", value: false }, checks: failed }).node;
  assert.equal(blocked.getAttribute("data-a2ui-validation-state"), "invalid");
  const box = blocked.querySelector("input")!;
  assert.equal(box.getAttribute("aria-invalid"), "true");
  assert.equal(blocked.querySelector('[data-a2ui-check-status="failed"]')?.textContent, "Required");
  assert.equal(blocked.querySelector('[data-a2ui-check-status="advisory"]')?.getAttribute("data-a2ui-check-severity"), "info");
  assert.equal(box.getAttribute("aria-describedby")?.split(" ").length, 2);

  const pending = setup("TextField", { properties: { value: "" }, checks: { sourceComponentId: "root", scopePath: "/", checkable: true, status: "pending" as const, checks: [] } }).node;
  assert.equal(pending.getAttribute("data-a2ui-validation-state"), "pending");
  assert.notEqual(pending.querySelector("input")?.getAttribute("aria-invalid"), "true");
  assert.equal(pending.querySelector("[data-a2ui-check-status]"), null);
});

test("Button disables only on a blocking invalid check; pending and error are left to Core's action gate", () => {
  const base = setup("Button");
  const withChild = (status: "valid" | "invalid" | "pending" | "error") => setup("Button", {
    checks: { sourceComponentId: "root", scopePath: "/", checkable: true, status, checks: [] },
    relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: child(base.document, "Go") }],
  }).node as HTMLButtonElement;
  assert.equal(withChild("invalid").disabled, true);
  assert.equal(withChild("pending").disabled, false);
  assert.equal(withChild("error").disabled, false);
  assert.equal(withChild("valid").disabled, false);
  assert.equal((setup("Button").node as HTMLButtonElement).disabled, true, "a progressively empty button stays disabled");
});

test("TextField defers writes until IME composition ends", () => {
  const writes: unknown[] = [];
  const control = setup("TextField", { properties: { label: undefined, value: "" }, interactions: interactions(writes) }).node.querySelector("input")!;
  fire(control, "compositionstart"); control.value = "に"; fire(control, "input"); control.value = "日本"; fire(control, "input"); fire(control, "compositionend");
  assert.deepEqual(writes, [["value", "日本"]]);
});

test("ChoicePicker filters labels ephemerally and writes string arrays", () => {
  const writes: unknown[] = [];
  const node = setup("ChoicePicker", { properties: { value: ["a"], filterable: true, displayStyle: "chips", options: [{ label: "Alpha", value: "a" }, { label: undefined, value: "b" }, { label: "Beta", value: "c" }] }, interactions: interactions(writes) }).node;
  assert.equal(node.getAttribute("data-a2ui-display-style"), "chips");
  const filter = node.querySelector('input[type="search"]') as HTMLInputElement; filter.value = "BET"; fire(filter, "input");
  assert.deepEqual([...node.querySelectorAll('[data-a2ui-choice-options] > label:has(input[type="radio"])')].map((row) => (row as HTMLElement).hidden), [true, true, false]); assert.deepEqual(writes, []);
  const radio = node.querySelectorAll('input[type="radio"]')[2] as HTMLInputElement;
  assert.equal(radio.style.accentColor, "var(--a2ui-color-primary, #0969da)");
  radio.checked = true; fire(radio, "change"); assert.deepEqual(writes, [["value", ["c"]]]);
});

test("ChoicePicker gives native list and chip styles distinct safe presentation", () => {
  const properties = { options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], value: ["a"] };
  const list = setup("ChoicePicker", { properties }).node;
  assert.match(list.querySelector("fieldset")!.getAttribute("style") ?? "", /--a2ui-color-outline/);
  assert.equal(list.querySelectorAll('input[type="radio"]').length, 2);
  const chips = setup("ChoicePicker", { properties: { ...properties, displayStyle: "chips" } }).node;
  const options = chips.querySelector<HTMLElement>("[data-a2ui-choice-options]")!;
  assert.equal(options.style.display, "flex"); assert.equal(options.style.flexWrap, "wrap");
  const labels = [...options.querySelectorAll<HTMLElement>("label")];
  assert.match(labels[0]!.getAttribute("style") ?? "", /--a2ui-color-primary/); assert.match(labels[1]!.getAttribute("style") ?? "", /--a2ui-color-outline/);
  assert.equal(labels.every((label) => label.querySelector("input") !== null), true);
});

test("DateTimeInput applies safe native date/time policy", () => {
  const writes: unknown[] = [];
  const date = setup("DateTimeInput", { properties: { enableDate: true, value: "2026-08-09", min: "2026-01-01", max: "bad" }, interactions: interactions(writes) }).node.querySelector("input") as HTMLInputElement;
  assert.equal(date.type, "date"); assert.equal(date.value, "2026-08-09"); assert.equal(date.min, "2026-01-01"); assert.equal(date.hasAttribute("max"), false);
  date.value = "2026-08-10"; fire(date, "change"); assert.deepEqual(writes, [["value", "2026-08-10"]]);
  const invalid = setup("DateTimeInput", { properties: { enableDate: true, enableTime: true, value: "bad" } }).node.querySelector("input") as HTMLInputElement; assert.equal(invalid.value, "");
  const disabled = setup("DateTimeInput", { properties: { value: "opaque" } }).node.querySelector("input") as HTMLInputElement; assert.equal(disabled.disabled, true); assert.equal(disabled.value, "opaque");
});

test("invalid inputs associate every failed message with their bound native controls", () => {
  const checks = { sourceComponentId: "internal-id", scopePath: "/private/path", checkable: true, status: "invalid" as const, checks: [{ index: 0, status: "failed" as const, severity: "error" as const, message: "Required", issues: [] }, { index: 1, status: "failed" as const, severity: "error" as const, message: "Too short", issues: [] }] };
  for (const component of ["TextField", "CheckBox", "Slider", "ChoicePicker", "DateTimeInput"] as const) {
    const properties = component === "ChoicePicker" ? { filterable: true, options: [{ label: "A", value: "a" }], value: [] }
      : component === "DateTimeInput" ? { enableDate: true, enableTime: true, value: "" }
      : component === "Slider" ? { value: 1 } : component === "TextField" ? { value: "" } : {};

    const node = setup(component, { properties, checks }).node;
    const controls = [...node.querySelectorAll<HTMLInputElement>(component === "ChoicePicker" ? 'input[type="radio"]' : "input,textarea")].filter((control) => control.type !== "search");
    assert.ok(controls.length > 0);
    for (const control of controls) {
      assert.equal(control.disabled, false); assert.equal(control.getAttribute("aria-invalid"), "true");
      const ids = control.getAttribute("aria-describedby")?.split(" ") ?? [];
      assert.equal(ids.length, 2); ids.forEach((id) => { assert.equal(node.querySelector(`#${id}`)?.textContent === "Required" || node.querySelector(`#${id}`)?.textContent === "Too short", true); assert.doesNotMatch(id, /internal-id|private|path/); });
    }
    assert.equal(node.querySelector('input[type="search"]')?.hasAttribute("aria-describedby") ?? false, false);
  }
});

function interactions(writes: unknown[]) { return { registerControl: () => {}, getLocalState: <T>(_key: string, fallback: T) => structuredClone(fallback), setLocalState: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }), writeInput: (property: string, value: unknown) => { writes.push([property, value]); return { ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }; }, dispatchAction: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }) }; }
function fire(node: Element, type: string): void { node.dispatchEvent(new node.ownerDocument.defaultView!.Event(type, { bubbles: true })); }
function fireKey(node: Element, type: "keydown" | "keyup", key: string, shiftKey = false): void { node.dispatchEvent(new node.ownerDocument.defaultView!.KeyboardEvent(type, { bubbles: true, key, shiftKey })); }
