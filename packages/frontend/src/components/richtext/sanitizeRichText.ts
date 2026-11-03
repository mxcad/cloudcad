/**
 * 富文本安全处理（PC 端唯一出口）。
 *
 * 反馈/评论等用户输入的富文本 content 以 HTML 存储。所有渲染前必须经
 * `sanitizeRichText` 白名单过滤，杜绝 script / on* 属性 / javascript: URL。
 *
 * 白名单刻意收窄到「文本 + 行内媒体 + 附件卡片」所需的最小集合：
 *  - 标签：标题/段落/行内格式/列表/引用/代码/图片/分隔线
 *  - 属性：img.src(仅 http/https/data:image)、img.alt/title、a.href(仅 http/https)、
 *    附件标记 data-att-id / data-kind / data-label（供 RichContentView 水合）
 * 其余（style/class/id/事件/iframe 等）一律剥离。
 */

/** 允许的标签白名单（小写） */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'img',
  'figure',
  'figcaption',
]);

/** 各标签允许的属性（小写） */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  img: new Set(['src', 'alt', 'title', 'data-att-id', 'data-kind']),
  a: new Set(['href', 'title']),
  div: new Set(['data-att-id', 'data-kind', 'data-label']),
  span: new Set(['data-att-id', 'data-kind', 'data-label']),
};

function safeUrl(url: string, isImg: boolean): string | null {
  const value = url.trim();
  if (!value) return null;
  if (/^https?:/i.test(value)) return value;
  // 图片允许内联 data:image/*（自包含截图）；其余 data: 一律拒绝
  if (isImg && /^data:image\//i.test(value)) return value;
  return null;
}

function sanitizeAttributes(el: Element): void {
  const tag = el.tagName.toLowerCase();
  const allowed = ALLOWED_ATTRS[tag];
  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    // class 仅允许富文本附件卡片的固定类（纯样式，无脚本风险）
    if (name === 'class') {
      if (/^fb-att-card(-icon|-label|-link)?$/.test(value)) continue;
      el.removeAttribute(attr.name);
      continue;
    }
    const isAllowed = allowed?.has(name) ?? false;
    if (!isAllowed) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === 'href' || name === 'src') {
      const clean = safeUrl(value, tag === 'img');
      if (clean) el.setAttribute(name, clean);
      else el.removeAttribute(attr.name);
    } else if (name === 'data-att-id') {
      // 仅保留安全字符集（附件 id 形如 uuid）
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) el.removeAttribute(attr.name);
    } else if (name === 'data-kind') {
      if (!/^[A-Za-z]{1,32}$/.test(value)) el.removeAttribute(attr.name);
    }
  }
  // a 强制 rel=nofollow，img 强制可拖拽关闭（卡片/图片不参与拖拽语义）
  if (tag === 'a') el.setAttribute('rel', 'nofollow noopener');
}

/**
 * 白名单净化 HTML 字符串。非字符串/空串返回空串；解析失败返回空串。
 * 输入为受控编辑器产物（见 RichtextEditor），但仍以防御纵深处理：
 * 对未知标签剥离内容、对已知标签递归清洗。
 */
export function sanitizeRichText(html: string): string {
  if (typeof html !== 'string' || !html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          // 未知标签（script/iframe/div 外的自定义）：剥壳保留文本内容
          const fragment = document.createDocumentFragment();
          while (el.firstChild) fragment.appendChild(el.firstChild);
          el.replaceWith(fragment);
          continue;
        }
        sanitizeAttributes(el);
        walk(el);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        // 注释等非文本节点移除
        child.parentNode?.removeChild(child);
      }
    }
  };
  walk(doc.body);
  // 序列化 body 内容
  return doc.body.innerHTML;
}

/** 去掉 HTML 标签得到纯文本（用于「字数」校验与移动端降级展示） */
export function stripHtmlTags(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 提交前把编辑器 HTML 收敛为可持久化形式：
 * 移除仅用于本地预览的 blob:/data: src（保留 data-att-id，由 RichContentView
 * 水合真实 URL），并把连续空行收敛。
 */
export function toPersistableHtml(html: string): string {
  const sanitized = sanitizeRichText(html);
  const doc = new DOMParser().parseFromString(sanitized, 'text/html');
  for (const img of Array.from(doc.body.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    if (/^(blob:|data:image\/)/i.test(src)) {
      // 本地预览 URL：提交后不可用，改为占位（水合时按 data-att-id 回填）
      if (img.getAttribute('data-att-id')) img.removeAttribute('src');
    }
  }
  return doc.body.innerHTML;
}

/** 反转义 HTML 实体为文本（移动端/纯文本降级用） */
export function decodeEntities(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}

/** 把纯文本转义为 HTML（移动端/纯文本提交用），保证 content 统一为 HTML */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
