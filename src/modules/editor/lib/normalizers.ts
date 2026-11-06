/**
 * Pure, lightweight normalizers and pretty-printers for SVG/XML and JSON.
 * Zero external dependencies.
 */

/**
 * Normalizes and formats an XML / SVG string with clean tag indentation
 * and whitespace formatting.
 */
export function formatXml(xml: string, indent = "  "): string {
  const clean = xml.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!clean) return "";

  // Split into tags, comments, CDATA, declarations, and text content
  const tagRegex =
    /(<\?[^>]*\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/[a-zA-Z0-9_:.-]+>|<[a-zA-Z0-9_:.-]+(?:\s+[^"'<>/]+|"[^"]*"|'[^']*')*\s*\/?>|[^<]+)/g;

  const rawTokens = clean.match(tagRegex) || [clean];
  const lines: string[] = [];
  let depth = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const rawToken = rawTokens[i];
    const token = rawToken.trim();
    if (!token) continue;

    if (token.startsWith("<?") || token.startsWith("<!DOCTYPE")) {
      lines.push(`${indent.repeat(depth)}${token}`);
    } else if (token.startsWith("<!--") || token.startsWith("<![CDATA[")) {
      lines.push(`${indent.repeat(depth)}${token}`);
    } else if (token.startsWith("</")) {
      depth = Math.max(0, depth - 1);
      lines.push(`${indent.repeat(depth)}${token}`);
    } else if (token.startsWith("<")) {
      const normalizedTag = normalizeTagWhitespace(token);
      const isSelfClosing = normalizedTag.endsWith("/>");

      // Check if this is an opening tag immediately followed by text and its closing tag
      // e.g. <title>Hello World</title>
      const nextRaw = rawTokens[i + 1]?.trim();
      const nextNextRaw = rawTokens[i + 2]?.trim();
      const tagNameMatch = normalizedTag.match(/^<([a-zA-Z0-9_:.-]+)/);
      const tagName = tagNameMatch ? tagNameMatch[1] : "";

      if (
        !isSelfClosing &&
        tagName &&
        nextRaw &&
        !nextRaw.startsWith("<") &&
        nextNextRaw === `</${tagName}>`
      ) {
        lines.push(
          `${indent.repeat(depth)}${normalizedTag}${nextRaw}${nextNextRaw}`,
        );
        i += 2;
      } else if (isSelfClosing) {
        lines.push(`${indent.repeat(depth)}${normalizedTag}`);
      } else {
        lines.push(`${indent.repeat(depth)}${normalizedTag}`);
        depth++;
      }
    } else {
      lines.push(`${indent.repeat(depth)}${token}`);
    }
  }

  return lines.join("\n");
}

/**
 * Normalizes whitespace between tag attributes without altering quoted string values.
 */
function normalizeTagWhitespace(tag: string): string {
  let inDouble = false;
  let inSingle = false;
  let result = "";
  let lastWasSpace = false;

  for (let i = 0; i < tag.length; i++) {
    const ch = tag[i];
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      result += ch;
      lastWasSpace = false;
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      result += ch;
      lastWasSpace = false;
    } else if (!inDouble && !inSingle) {
      if (/\s/.test(ch)) {
        if (!lastWasSpace && result.length > 0 && !result.endsWith("<")) {
          result += " ";
          lastWasSpace = true;
        }
      } else {
        if ((ch === ">" || ch === "/") && lastWasSpace) {
          result = result.slice(0, -1);
        }
        if (ch === "/" && tag[i + 1] === ">") {
          result += " />";
          i++;
          lastWasSpace = false;
          continue;
        }
        result += ch;
        lastWasSpace = false;
      }
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Normalizes and pretty-prints a JSON string with 2-space indentation.
 */
export function formatJson(json: string, indent = "  "): string {
  const trimmed = json.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, indent);
  } catch {
    return json;
  }
}
