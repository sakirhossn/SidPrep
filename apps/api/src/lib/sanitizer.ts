/**
 * SidPrep Server-Side CMS HTML Sanitizer
 * Strips dangerous script tags, iframes, unsafe protocols, and inline event handlers (F21)
 */

const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 'strike', 's', 'sub', 'sup',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code', 'hr', 'br',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'div', 'span', 'img', 'a'
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  '*': new Set(['class', 'id', 'title', 'aria-label', 'aria-hidden']),
  'a': new Set(['href', 'target', 'rel', 'title']),
  'img': new Set(['src', 'alt', 'title', 'width', 'height']),
  'th': new Set(['scope', 'colspan', 'rowspan']),
  'td': new Set(['colspan', 'rowspan']),
};

const SAFE_URL_PATTERN = /^(https?:|\/|#|mailto:)/i;
const SAFE_IMAGE_URL_PATTERN = /^(https?:|\/|data:image\/(png|jpeg|webp|gif);base64,)/i;

/**
 * Sanitize raw HTML string before saving to database or rendering in public views
 */
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let sanitized = rawHtml;

  // 1. Remove dangerous blocks entirely (tag and contents)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^>]*>/gi, '');
  sanitized = sanitized.replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '');
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  sanitized = sanitized.replace(/<base\b[^>]*>/gi, '');
  sanitized = sanitized.replace(/<link\b[^>]*>/gi, '');

  // 2. Strip inline event handlers: onclick, onerror, onload, onmouseover, etc.
  sanitized = sanitized.replace(/\s+on[a-zA-Z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // 3. Process remaining tags
  sanitized = sanitized.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagName, attrs) => {
    const lowerTag = tagName.toLowerCase();

    // If tag is not allowlisted, strip the tag completely
    if (!ALLOWED_TAGS.has(lowerTag)) {
      return '';
    }

    // Closing tags for allowlisted elements
    if (match.startsWith('</')) {
      return `</${lowerTag}>`;
    }

    // Parse and filter attributes for open tag
    const allowedAttrs = ALLOWED_ATTRIBUTES[lowerTag] || new Set();
    const globalAttrs = ALLOWED_ATTRIBUTES['*'];

    let cleanAttrs = '';
    const attrRegex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+)))?/g;
    let attrMatch;

    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

      // Skip event handlers or javascript: values
      if (attrName.startsWith('on')) continue;

      if (allowedAttrs.has(attrName) || globalAttrs.has(attrName)) {
        // Enforce safe URL protocol on href
        if (attrName === 'href') {
          const trimmed = attrVal.trim();
          if (!SAFE_URL_PATTERN.test(trimmed)) {
            continue; // Drop unsafe href
          }
          let safeHref = trimmed;
          let extraRel = '';
          if (lowerTag === 'a' && trimmed.startsWith('http')) {
            extraRel = ' rel="noopener noreferrer"';
          }
          cleanAttrs += ` href="${safeHref.replace(/"/g, '&quot;')}"${extraRel}`;
          continue;
        }

        // Enforce safe URL on src
        if (attrName === 'src') {
          const trimmed = attrVal.trim();
          if (!SAFE_IMAGE_URL_PATTERN.test(trimmed)) {
            continue; // Drop unsafe src
          }
          cleanAttrs += ` src="${trimmed.replace(/"/g, '&quot;')}"`;
          continue;
        }

        cleanAttrs += ` ${attrName}="${attrVal.replace(/"/g, '&quot;')}"`;
      }
    }

    const selfClosing = ['img', 'br', 'hr'].includes(lowerTag) ? ' /' : '';
    return `<${lowerTag}${cleanAttrs}${selfClosing}>`;
  });

  return sanitized.trim();
}
