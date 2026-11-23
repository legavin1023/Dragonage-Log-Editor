export function splitSelectors(selector) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

function scopeSelector(selector, scope) {
  // Document roots become the exported container; ordinary selectors stay descendants.
  const roots = /^(?:(?:html|body|:root)(?=[\s>]|$)\s*(?:>\s*)?)+/i;
  const tail = selector.replace(roots, "");
  if (tail !== selector) return tail ? `${scope} ${tail}` : scope;
  return `${scope} ${selector}`;
}

function scopeRules(rules, scope) {
  return [...rules]
    .map((rule) => {
      if (rule.type === 1) {
        const selectors = splitSelectors(rule.selectorText).map((s) =>
          scopeSelector(s, scope)
        );
        return `${selectors.join(",")} {${rule.style.cssText}}`;
      }
      // Media and supports conditions retain responsive/print rules, without global CSS.
      if (rule.type === 4 || rule.type === 12) {
        const name = rule.type === 4 ? "media" : "supports";
        return `@${name} ${rule.conditionText} {${scopeRules(
          rule.cssRules,
          scope
        )}}`;
      }
      // Skip global fonts, imports, animations and page rules in a blog post fragment.
      return "";
    })
    .join("\n");
}

export function exportTistory(doc) {
  const className = `dragonage-log-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
  const scope = `.${className}`;
  const wrapper = doc.createElement("div");
  wrapper.className = className;
  wrapper.style.cssText =
    'background:#1e1e1e;color:#e0e0e0;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:16px;line-height:1.6;text-align:left;padding:12px;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;';
  // Clone only body content, leaving the editable iframe untouched.
  [...doc.body.childNodes].forEach((node) =>
    wrapper.append(node.cloneNode(true))
  );
  wrapper
    .querySelectorAll("style,link,script,meta,title,iframe,object,embed,base")
    .forEach((n) => n.remove());
  wrapper.querySelectorAll("*").forEach((n) => {
    [...n.attributes].forEach(({ name }) => {
      if (
        /^data-log-editor-|^on/i.test(name) ||
        name === "tabindex" ||
        name === "contenteditable"
      )
        n.removeAttribute(name);
    });
  });
  let unreadableStyles = 0;
  const styles = [...doc.querySelectorAll('style,link[rel~="stylesheet"]')]
    .filter((node) => !node.hasAttribute("data-log-editor-style"))
    .map((node) => {
      try {
        if (!node.sheet) throw new Error("Stylesheet unavailable");
        return scopeRules(node.sheet.cssRules, scope);
      } catch {
        unreadableStyles++;
        return "";
      }
    })
    .join("\n");
  const reset = `${scope} *,${scope} *::before,${scope} *::after{box-sizing:border-box}
${scope} p,${scope} li,${scope} span,${scope} div{font-size:inherit;line-height:inherit}
${scope} p{margin:0 0 .5em;color:inherit}
${scope} img{max-width:100%;height:auto}
${scope} a{color:inherit}`;
  const overrides = `${scope},${scope} *{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif!important}
${scope} .css-custom{min-height:0;height:auto;width:100%;max-width:100%;padding:8px}
${scope} .preamble,${scope} .chatlog__message-group{width:100%;max-width:100%;box-sizing:border-box}
${scope} .chatlog__messages{min-width:0}
${scope} .chatlog__content{overflow-wrap:anywhere}
${scope} .chatlog__content pre{white-space:pre-wrap}
${scope} .chatlog__author-avatar{flex-shrink:0}
@media(max-width:650px){${scope}{padding:4px!important}${scope} .chatlog__timestamp{display:block;margin-left:0}}`;
  const css = `${reset}\n${styles}\n${overrides}`.replace(
    /<\/style/gi,
    "<\\/style"
  );
  return {
    html: `<!-- Dragonage Log Editor: 티스토리 HTML 모드에 붙여넣으세요. -->\n<style>\n${css}\n</style>\n${wrapper.outerHTML}`,
    unreadableStyles,
    embeddedImages:
      wrapper.querySelectorAll('img[src^="data:"]').length +
      (styles.match(/url\(["']?data:image/gi) || []).length,
  };
}
