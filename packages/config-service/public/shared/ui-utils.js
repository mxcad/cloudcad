/**
 * CloudCAD 配置中心 UI 共享工具函数
 * 由 server.js 拆分重构时提取
 */

function setButtonLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const loadingEl = btn.querySelector('.btn-loading');
  if (loading) {
    btn.classList.add('loading');
    if (text) text.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'inline';
  } else {
    btn.classList.remove('loading');
    if (text) text.style.display = 'inline';
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function showToast(message, type = 'info', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setNestedValue(obj, parts, value) {
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}
