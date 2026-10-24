/**
 * 文章 HTML 白名單過濾（儲存前於伺服器端執行）。
 * 使用 Workers 內建的 HTMLRewriter，不需額外套件。
 * 允許的標籤對應 Tiptap 編輯器能產生的內容。
 */

const ALLOWED: Record<string, string[]> = {
  p: [],
  br: [],
  h2: [],
  h3: [],
  strong: [],
  em: [],
  u: [],
  s: [],
  a: ['href', 'target', 'rel'],
  ul: [],
  ol: ['start'],
  li: [],
  blockquote: [],
  hr: [],
  img: ['src', 'alt', 'title', 'width', 'height'],
  // YouTube：Tiptap 以 <div data-youtube-video><iframe></div> 表示
  div: ['data-youtube-video'],
  iframe: ['src', 'width', 'height', 'allowfullscreen'],
};

/** 連同內容整個移除的標籤 */
const DROP = new Set(['script', 'style', 'noscript', 'template', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'svg', 'math', 'head', 'title', 'meta', 'link']);

const YOUTUBE_EMBED = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/[\w-]+/;

function safeUrl(value: string, kind: 'href' | 'src') {
  const v = value.trim();
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  if (kind === 'href' && (v.startsWith('#') || v.startsWith('mailto:'))) return true;
  return /^https?:\/\//i.test(v);
}

export async function sanitizeHtml(html: string): Promise<string> {
  const rewriter = new HTMLRewriter()
    .on('*', {
      element(el) {
        const tag = el.tagName.toLowerCase();
        const allowedAttrs = ALLOWED[tag];
        if (DROP.has(tag) || (tag === 'iframe' && !YOUTUBE_EMBED.test(el.getAttribute('src') ?? ''))) {
          el.remove();
          return;
        }
        if (!allowedAttrs || (tag === 'div' && !el.hasAttribute('data-youtube-video'))) {
          el.removeAndKeepContent();
          return;
        }

        // 先複製屬性清單再移除，避免迭代中修改
        const attrs = [...(el.attributes as unknown as Iterable<[string, string]>)];
        for (const [name, value] of attrs) {
          const ok =
            allowedAttrs.includes(name) &&
            (name === 'href' ? safeUrl(value, 'href') : name === 'src' ? safeUrl(value, 'src') : true);
          if (!ok) el.removeAttribute(name);
        }
        if (tag === 'a' && el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
      },
      comments(c) {
        c.remove();
      },
    });

  return rewriter.transform(new Response(html, { headers: { 'content-type': 'text/html' } })).text();
}

/** 取出 HTML 中引用的 R2 key（/media/... 路徑） */
export function mediaKeysIn(html: string): string[] {
  return [...html.matchAll(/\/media\/([^"'\s)?#]+)/g)].map((m) => decodeURIComponent(m[1]));
}

export function excerptOf(html: string, len = 120): string | null {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > len ? `${text.slice(0, len)}…` : text;
}
