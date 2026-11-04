() => {
  const roots = ['#root', '#modal-root', '#toast-root', '#global-tour-portal'];
  const items = [];
  const cjk = /[\u4e00-\u9fff]/;
  function push(text, kind, tag) {
    if (!text) return;
    const t = text.trim();
    if (!t || !cjk.test(t)) return;
    items.push({ text: t.slice(0, 60), kind, tag: tag || '' });
  }
  for (const sel of roots) {
    const root = document.querySelector(sel);
    if (!root) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && cjk.test(n.nodeValue)) {
        // 排除引擎黑盒
        let p = n.parentElement;
        let inEngine = false;
        while (p) { if (p.id === 'mxcad-global-container') { inEngine = true; break; } p = p.parentElement; }
        if (!inEngine) push(n.nodeValue, 'text', n.parentElement?.tagName || '');
      }
    }
    root.querySelectorAll('input, textarea').forEach(el => {
      if (el.placeholder && cjk.test(el.placeholder)) push(el.placeholder, 'placeholder', el.tagName);
    });
    root.querySelectorAll('[aria-label]').forEach(el => {
      if (cjk.test(el.getAttribute('aria-label') || '')) push(el.getAttribute('aria-label'), 'aria', el.tagName);
    });
    root.querySelectorAll('[title]').forEach(el => {
      const tv = el.getAttribute('title') || '';
      if (cjk.test(tv)) push(tv, 'title-attr', el.tagName);
    });
  }
  // 去重
  const seen = new Set();
  const uniq = items.filter(it => { const k = it.kind + '|' + it.text; if (seen.has(k)) return false; seen.add(k); return true; });
  return { url: location.href, total: uniq.length, items: uniq };
}
