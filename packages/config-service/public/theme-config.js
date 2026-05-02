/**
 * CloudCAD 主题配置前端模块
 * 处理 myVuetifyThemeConfig.json
 */

const THEME_CONFIG = (function () {
  let token = '';
  let currentConfig = {};

  function init(authToken) {
    token = authToken;
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/theme-config', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.status === 401) {
        return { success: false, error: '未授权' };
      }
      const data = await res.json();
      if (data.success) {
        currentConfig = data.data || {};
        return { success: true, data: currentConfig };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function renderForm(container) {
    if (!container) return;

    if (Object.keys(currentConfig).length === 0) {
      container.innerHTML =
        '<div style="padding:20px;text-align:center;color:#888">加载中...</div>';
      const result = await loadConfig();
      if (!result.success) {
        container.innerHTML = `<div style="padding:20px;text-align:center;color:#e74c3c">加载失败: ${result.error}</div>`;
        return;
      }
    }

    let html = `
      <div class="theme-config-wrapper">
        <div class="theme-config-actions">
          <button class="btn btn-primary" id="saveThemeConfigBtn">
            <span class="btn-text">保存配置</span>
            <span class="btn-loading" style="display:none">保存中...</span>
          </button>
          <button class="btn btn-secondary" id="importThemeConfigBtn">导入</button>
          <button class="btn btn-secondary" id="exportThemeConfigBtn">导出</button>
          <button class="btn btn-secondary" id="resetThemeConfigBtn">还原默认</button>
        </div>
        <input type="file" id="themeConfigJsonFile" accept=".json" style="display:none" />
        <div class="theme-form">
          ${renderDefaultThemeSection()}
          ${renderThemeSection('light')}
          ${renderThemeSection('dark')}
        </div>
      </div>
    `;

    container.innerHTML = html;
    setTimeout(() => bindEvents(container), 0);
  }

  function renderDefaultThemeSection() {
    const currentTheme = currentConfig.defaultTheme || 'dark';
    return `
      <div class="config-subsection">
        <h4>默认主题</h4>
        <div class="theme-default-select">
          <label class="radio-label">
            <input type="radio" name="defaultTheme" value="light" ${currentTheme === 'light' ? 'checked' : ''} />
            <span>浅色主题</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="defaultTheme" value="dark" ${currentTheme === 'dark' ? 'checked' : ''} />
            <span>深色主题</span>
          </label>
        </div>
      </div>
    `;
  }

  function renderThemeSection(themeName) {
    const theme = currentConfig.themes?.[themeName] || {};
    const colors = theme.colors || {};
    const variables = theme.variables || {};

    return `
      <div class="config-subsection">
        <h4>${themeName === 'light' ? '浅色主题' : '深色主题'}</h4>
        
        <div class="theme-group">
          <h5>颜色配置</h5>
          <div class="theme-grid">
            ${Object.entries(colors)
              .map(([key, value]) =>
                renderColorField(themeName, 'colors', key, value)
              )
              .join('')}
          </div>
        </div>
        
        <div class="theme-group">
          <h5>变量配置</h5>
          <div class="theme-grid">
            ${Object.entries(variables)
              .map(([key, value]) =>
                renderVariableField(themeName, 'variables', key, value)
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderColorField(themeName, group, key, value) {
    const fullKey = `${themeName}.${group}.${key}`;
    const isOpacity = key.toLowerCase().includes('opacity');

    return `
      <div class="theme-field ${isOpacity ? 'theme-field-opacity' : 'theme-field-color'}">
        <label>${formatKey(key)}</label>
        <div class="theme-field-input">
          <input type="color" class="color-picker" data-key="${fullKey}" value="${value}" />
          <input type="text" class="color-text" data-key="${fullKey}" data-type="color" value="${escapeHtml(value)}" />
        </div>
      </div>
    `;
  }

  function renderVariableField(themeName, group, key, value) {
    const fullKey = `${themeName}.${group}.${key}`;
    const isOpacity = key.toLowerCase().includes('opacity');
    const isNumber = typeof value === 'number';

    if (isOpacity && isNumber) {
      return `
        <div class="theme-field theme-field-opacity">
          <label>${formatKey(key)}</label>
          <div class="theme-field-input theme-field-number">
            <input type="range" min="0" max="1" step="0.01" data-key="${fullKey}" data-type="opacity" value="${value}" />
            <input type="number" min="0" max="1" step="0.01" data-key="${fullKey}" data-type="opacity" value="${value}" />
          </div>
        </div>
      `;
    }

    if (isNumber) {
      return `
        <div class="theme-field">
          <label>${formatKey(key)}</label>
          <input type="number" data-key="${fullKey}" data-type="number" value="${value}" />
        </div>
      `;
    }

    // Color value
    return `
      <div class="theme-field theme-field-color">
        <label>${formatKey(key)}</label>
        <div class="theme-field-input">
          <input type="color" class="color-picker" data-key="${fullKey}" value="${value}" />
          <input type="text" class="color-text" data-key="${fullKey}" data-type="color" value="${escapeHtml(value)}" />
        </div>
      </div>
    `;
  }

  const KEY_LABELS = {
    // Colors
    surface: '表面颜色 (surface)',
    background: '背景色 (background)',
    accent: '强调色 (accent)',
    prominent: '突出色 (prominent)',
    hover_herder_btn: '标题栏悬停 (hover_herder_btn)',
    modification: '修改标记 (modification)',
    transition: '过渡色 (transition)',
    undertint: '底色 (undertint)',
    depth: '深度色 (depth)',
    'on-undertint': '底色文字 (on-undertint)',
    'undertint-bg': '底色背景 (undertint-bg)',
    'depth-bg': '深度背景 (depth-bg)',
    inverse: '反色 (inverse)',
    inverse1: '反色1 (inverse1)',
    console: '控制台色 (console)',
    'on-console': '控制台文字 (on-console)',
    'dialog-card': '对话框卡片 (dialog-card)',
    'dialog-card-text': '对话框文字 (dialog-card-text)',
    hover_electron_view_tab_btn_hover:
      '标签悬停 (hover_electron_view_tab_btn_hover)',
    hover_electron_view_tab_btn_action:
      '标签操作 (hover_electron_view_tab_btn_action)',
    nav_bg: '导航背景 (nav_bg)',
    nav_bg_active: '导航激活 (nav_bg_active)',
    sketches_color: '草图颜色 (sketches_color)',
    toolbar_header: '工具栏标题 (toolbar_header)',
    'on-undertint-bg': '底色背景文字 (on-undertint-bg)',
    'on-depth': '深度文字 (on-depth)',
    'theme-surface-variant': '表面变体 (theme-surface-variant)',
    'theme-on-surface-variant': '表面变体文字 (theme-on-surface-variant)',
    // Variables
    'border-color': '边框颜色 (border-color)',
    'border-opacity': '边框透明度 (border-opacity)',
    'high-emphasis-opacity': '高强调透明度 (high-emphasis-opacity)',
    'medium-emphasis-opacity': '中等强调透明度 (medium-emphasis-opacity)',
    'disabled-opacity': '禁用透明度 (disabled-opacity)',
    'idle-opacity': '空闲透明度 (idle-opacity)',
    'hover-opacity': '悬停透明度 (hover-opacity)',
    'focus-opacity': '聚焦透明度 (focus-opacity)',
    'selected-opacity': '选中透明度 (selected-opacity)',
    'activated-opacity': '激活透明度 (activated-opacity)',
    'pressed-opacity': '按下透明度 (pressed-opacity)',
    'dragged-opacity': '拖拽透明度 (dragged-opacity)',
    'theme-kbd': '键盘主题 (theme-kbd)',
    'theme-on-kbd': '键盘文字 (theme-on-kbd)',
    'theme-code': '代码主题 (theme-code)',
    'theme-on-code': '代码文字 (theme-on-code)',
    'theme-tbody': '表格主题 (theme-tbody)',
    'theme-btn-hover': '按钮悬停 (theme-btn-hover)',
    'theme-undertint-bg-overlay-multiplier':
      '底色叠加系数 (theme-undertint-bg-overlay-multiplier)',
  };

  function formatKey(key) {
    if (KEY_LABELS[key]) {
      return KEY_LABELS[key];
    }
    return (
      key
        .replace(/-/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim() + ` (${key})`
    );
  }

  function bindEvents(container) {
    container
      .querySelector('#saveThemeConfigBtn')
      .addEventListener('click', saveConfig);
    container
      .querySelector('#importThemeConfigBtn')
      .addEventListener('click', () => {
        container.querySelector('#themeConfigJsonFile').click();
      });
    container
      .querySelector('#themeConfigJsonFile')
      .addEventListener('change', importJson);
    container
      .querySelector('#exportThemeConfigBtn')
      .addEventListener('click', exportJson);
    container
      .querySelector('#resetThemeConfigBtn')
      .addEventListener('click', resetConfig);

    // Sync color picker and text input
    container.querySelectorAll('.color-picker').forEach((picker) => {
      picker.addEventListener('input', (e) => {
        const textInput = e.target.parentElement.querySelector('.color-text');
        if (textInput) {
          textInput.value = e.target.value;
        }
      });
    });

    container.querySelectorAll('.color-text').forEach((text) => {
      text.addEventListener('change', (e) => {
        const picker = e.target.parentElement.querySelector('.color-picker');
        if (picker && isValidColor(e.target.value)) {
          picker.value = e.target.value;
        }
      });
    });

    // Sync range and number for opacity
    container
      .querySelectorAll('input[type="range"][data-type="opacity"]')
      .forEach((range) => {
        range.addEventListener('input', (e) => {
          const numInput = e.target.parentElement.querySelector(
            'input[type="number"]'
          );
          if (numInput) {
            numInput.value = e.target.value;
          }
        });
      });

    container
      .querySelectorAll('input[type="number"][data-type="opacity"]')
      .forEach((num) => {
        num.addEventListener('input', (e) => {
          const range = e.target.parentElement.querySelector(
            'input[type="range"]'
          );
          if (range) {
            range.value = e.target.value;
          }
        });
      });
  }

  function isValidColor(value) {
    return /^#([0-9A-Fa-f]{3}){1,2}$/.test(value) || value.startsWith('rgb');
  }

  async function saveConfig() {
    const btn = document.getElementById('saveThemeConfigBtn');
    setButtonLoading(btn, true);

    const updates = {};

    // Get defaultTheme
    const defaultThemeRadio = document.querySelector(
      'input[name="defaultTheme"]:checked'
    );
    if (defaultThemeRadio) {
      updates.defaultTheme = defaultThemeRadio.value;
    }

    // Get all theme fields
    document.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      const fieldType = el.dataset.type;
      const parts = key.split('.');

      let value = el.value;
      if (fieldType === 'opacity' || fieldType === 'number') {
        value = parseFloat(value);
      }

      setNestedValue(updates, parts, value);
    });

    // Ensure themes object exists
    if (!updates.themes) {
      updates.themes = {};
    }
    if (!updates.themes.light) {
      updates.themes.light = { colors: {}, variables: {} };
    }
    if (!updates.themes.dark) {
      updates.themes.dark = { colors: {}, variables: {} };
    }

    try {
      const res = await fetch('/api/theme-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      setButtonLoading(btn, false);

      if (res.ok && data.success) {
        showToast('配置已保存', 'success');
      } else {
        if (data.errors) {
          const msg = data.errors
            .slice(0, 5)
            .map((e) => `${e.path}: ${e.error}`)
            .join('\n');
          showToast('校验失败:\n' + msg, 'error', 5000);
        } else {
          showToast(data.error || '保存失败', 'error');
        }
      }
    } catch (e) {
      setButtonLoading(btn, false);
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  function setNestedValue(obj, parts, value) {
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  async function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch('/api/theme-config/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(json),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置导入成功', 'success');
        await loadConfig();
        await renderForm(document.getElementById('themeConfigContent'));
      } else {
        if (data.errors) {
          const msg = data.errors
            .slice(0, 5)
            .map((e) => `${e.path}: ${e.error}`)
            .join('\n');
          showToast('校验失败:\n' + msg, 'error', 5000);
        } else {
          showToast(data.error || '导入失败', 'error');
        }
      }
    } catch (err) {
      showToast('JSON 解析失败: ' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function exportJson() {
    try {
      const res = await fetch('/api/theme-config/export', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'myVuetifyThemeConfig.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('配置已导出', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || '导出失败', 'error');
      }
    } catch (e) {
      showToast('导出失败: ' + e.message, 'error');
    }
  }

  async function resetConfig() {
    if (!confirm('确定要还原为默认配置吗？')) return;

    try {
      const res = await fetch('/api/theme-config/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        await loadConfig();
        await renderForm(document.getElementById('themeConfigContent'));
      } else {
        showToast(data.error || '还原失败', 'error');
      }
    } catch (e) {
      showToast('还原失败: ' + e.message, 'error');
    }
  }

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

  return { init, loadConfig, renderForm };
})();
