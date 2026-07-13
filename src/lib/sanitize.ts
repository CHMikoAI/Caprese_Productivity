// Tiny allowlist sanitizer for the rich-text description. Runs on both server
// (before storing) and client (before rendering into contentEditable). Keeps
// only basic formatting tags and strips every attribute, so no on*-handlers,
// styles, scripts or javascript: URLs can survive.
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "s", "strike", "u",
  "p", "br", "div", "span", "ul", "ol", "li",
]);

export function sanitizeHtml(input: string): string {
  if (!input) return "";

  // Remove whole script/style blocks including their content.
  let html = input.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");

  // For every remaining tag, drop disallowed ones and strip all attributes.
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)[^>]*?(\/?)>/g, (_m, slash, name) => {
    const tag = String(name).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    return `<${slash}${tag}>`;
  });

  return html.trim();
}
