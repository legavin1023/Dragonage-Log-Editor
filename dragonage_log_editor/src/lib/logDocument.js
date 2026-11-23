export const GROUP = ".chatlog__message-group";
export function parseLog(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll(
      "script, iframe, object, embed, base, form, meta[http-equiv='refresh' i]"
    )
    .forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((n) =>
    [...n.attributes].forEach(({ name, value }) => {
      if (
        /^on/i.test(name) ||
        name === "srcdoc" ||
        (/^(href|src|action|xlink:href)$/i.test(name) &&
          /^\s*(javascript|vbscript):/i.test(value))
      )
        n.removeAttribute(name);
    })
  );
  if (!doc.querySelector(GROUP))
    throw new Error("chatlog__message-group가 있는 HTML 로그를 선택해 주세요.");
  return doc;
}
export function getAuthors(doc) {
  return [
    ...new Set(
      [...doc.querySelectorAll(`${GROUP} .chatlog__author-name`)].map((n) =>
        n.textContent.trim()
      )
    ),
  ];
}
export function createGmMessage(doc, author, text) {
  const template = [...doc.querySelectorAll(GROUP)].find(
    (g) =>
      g.querySelector(".chatlog__author-name")?.textContent.trim() === author
  );
  const group = doc.createElement("article");
  group.className = "chatlog__message-group";
  group.dataset.gmEntry = "true";
  group.setAttribute(
    "style",
    template?.getAttribute("style") ||
      "background:#352b35;border:3px solid #bc9256;color:#f3e9da"
  );
  const avatar = template?.querySelector(".chatlog__author-avatar-container");
  if (avatar) group.append(avatar.cloneNode(true));
  const messages = doc.createElement("div");
  messages.className = "chatlog__messages";
  const name = doc.createElement("span");
  name.className = "chatlog__author-name";
  name.textContent = author;
  messages.append(name);
  const message = doc.createElement("div");
  message.className = "chatlog__message";
  const content = doc.createElement("div");
  content.className = "chatlog__content";
  const body = doc.createElement("div");
  body.className = "preserve-whitespace";
  body.style.whiteSpace = "pre-wrap";
  body.textContent = text;
  content.append(body);
  message.append(content);
  messages.append(message);
  group.append(messages);
  return group;
}
export function serializeLog(doc) {
  const copy = doc.documentElement.cloneNode(true);
  copy.querySelectorAll("[data-log-editor-style]").forEach((n) => n.remove());
  copy
    .querySelectorAll("[data-log-editor-selected]")
    .forEach((n) => n.removeAttribute("data-log-editor-selected"));
  copy.querySelectorAll("[data-log-editor-tab]").forEach((n) => {
    n.removeAttribute("tabindex");
    n.removeAttribute("data-log-editor-tab");
  });
  return "<!DOCTYPE html>\n" + copy.outerHTML;
}
