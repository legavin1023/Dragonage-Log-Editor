import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
const source = await readFile(
  new URL("../src/lib/tistoryExport.js", import.meta.url),
  "utf8"
);
const { exportTistory, splitSelectors } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("selector commas inside functions, strings and escaped names stay intact", () => {
  assert.deepEqual(
    splitSelectors('.a:is(.x,.y), [title="a,b"], .escaped\\,name, body'),
    [".a:is(.x,.y)", '[title="a,b"]', ".escaped\\,name", "body"]
  );
});

test("real log becomes a fragment, preserves every message and portrait, leaves input untouched", async () => {
  const html = await readFile(
    new URL("../public/sample-log.html", import.meta.url),
    "utf8"
  );
  const original = new JSDOM(html);
  const doc = original.window.document;
  const groups = doc.querySelectorAll(".chatlog__message-group");
  groups[0].setAttribute("data-log-editor-selected", "true");
  groups[0].setAttribute("data-log-editor-tab", "true");
  groups[0].tabIndex = 0;
  const editorStyle = doc.createElement("style");
  editorStyle.dataset.logEditorStyle = "true";
  editorStyle.textContent =
    ".chatlog__message-group { cursor: pointer; outline: 3px solid orange; }";
  doc.head.append(editorStyle);
  const before = doc.documentElement.outerHTML;
  const result = exportTistory(doc);
  assert.equal(doc.documentElement.outerHTML, before);
  assert.ok(
    !/<(?:html|head|body|meta|script|link)\b|<!doctype|@font-face|data:font|data-log-editor-|cursor:\s*pointer|outline:/i.test(
      result.html
    )
  );
  const exported = new JSDOM(result.html);
  const exportedDoc = exported.window.document;
  assert.equal(
    exportedDoc.querySelectorAll(".chatlog__message-group").length,
    groups.length
  );
  assert.equal(
    exportedDoc.querySelectorAll(".chatlog__content")[10].textContent,
    doc.querySelectorAll(".chatlog__content")[10].textContent
  );
  assert.ok(result.html.includes("data:image/webp;base64,"));
  assert.ok(result.html.includes("@media"));
  assert.equal(result.unreadableStyles, 0);
  assert.ok(
    result.html.length < html.length,
    "embedded fonts should be removed"
  );
  assert.notEqual(
    exportedDoc.body.lastElementChild.className,
    new JSDOM(exportTistory(doc).html).window.document.body.lastElementChild
      .className
  );
  original.window.close();
  exported.window.close();
});

test("export styles cannot change the surrounding blog or another export", () => {
  const log = new JSDOM(
    `<style>html,body{margin:0;background:red}p,.preamble{color:red}body .content{border:3px solid red}@media(max-width:650px){body,.preamble{padding:0}}@supports(display:grid){p{display:grid}}</style><div class="preamble">Title</div><div class="chatlog__message-group"><div class="content"><p>Log</p></div></div>`
  );
  const output = exportTistory(log.window.document).html;
  const host = new JSDOM(
    `<html><head><style>body{margin:23px;background:blue}p,.preamble{color:green}</style></head><body><p id="outside">Blog text</p><div class="preamble" id="outside-title">Blog title</div>${output}</body></html>`
  );
  const doc = host.window.document;
  const computed = (node) => host.window.getComputedStyle(node);
  assert.equal(computed(doc.body).margin, "23px");
  assert.equal(computed(doc.body).backgroundColor, "rgb(0, 0, 255)");
  assert.equal(computed(doc.querySelector("#outside")).color, "rgb(0, 128, 0)");
  assert.equal(
    computed(doc.querySelector("#outside-title")).color,
    "rgb(0, 128, 0)"
  );
  const root = doc.body.lastElementChild;
  const verifyRules = (rules) =>
    [...rules].forEach((rule) => {
      if (rule.selectorText)
        splitSelectors(rule.selectorText).forEach((s) =>
          assert.ok(s.startsWith(`.${root.className}`), s)
        );
      if (rule.cssRules) verifyRules(rule.cssRules);
    });
  verifyRules(doc.styleSheets[1].cssRules);
  log.window.close();
  host.window.close();
});

test("GM plain text and line breaks survive, inaccessible styles produce a warning", () => {
  const log = new JSDOM(
    '<link rel="stylesheet" href="https://example.invalid/style.css"><div class="chatlog__message-group" data-gm-entry="true"><div class="preserve-whitespace" style="white-space:pre-wrap"></div></div>'
  );
  const text = "첫 줄 <script>alert(1)</script>\n두 번째 줄 & 끝";
  log.window.document.querySelector(".preserve-whitespace").textContent = text;
  const result = exportTistory(log.window.document);
  const output = new JSDOM(result.html);
  assert.equal(
    output.window.document.querySelector(".preserve-whitespace").textContent,
    text
  );
  assert.equal(
    output.window.document.querySelector(".preserve-whitespace").style
      .whiteSpace,
    "pre-wrap"
  );
  assert.equal(output.window.document.querySelectorAll("script").length, 0);
  assert.equal(result.unreadableStyles, 1);
  log.window.close();
  output.window.close();
});
