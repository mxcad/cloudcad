/**
 * CloudCAD 服务器配置前端模块
 * 处理 myServerConfig.json 表单编辑
 */

const SERVER_CONFIG = (function () {
  let token = '';
  let currentConfig = {};

  const CONFIG_FIELDS = [
    {
      key: 'supportTruetypeFont',
      label: '启用 Truetype 字体',
      type: 'boolean',
    },
    { key: 'webgl1', label: '使用 WebGL 1.0', type: 'boolean' },
    { key: 'useUtf8', label: '使用 UTF8 编码', type: 'boolean' },
    {
      key: 'isAutomaticJumpToMobilePage',
      label: '自动跳转到移动端',
      type: 'boolean',
    },
    { key: 'defaultFont', label: '缺省 SHX 字体', type: 'text' },
    { key: 'defaultBigFont', label: '缺省 Big 字体', type: 'text' },
    { key: 'defaultTrueTypeFont', label: '缺省 TrueType 字体', type: 'text' },
    { key: 'file_ext_name', label: 'CAD 文件扩展名', type: 'text' },
    { key: 'mobilePageUrl', label: '移动端页面路径', type: 'text' },
    { key: 'speechRecognitionModel', label: '语音识别模型', type: 'text' },
  ];

  const FONT_FIELDS = [
    {
      key: 'font',
      label: 'SHX 字体列表',
      type: 'array',
      placeholder: 'txt.shx, simplex.shx',
    },
    {
      key: 'bigFont',
      label: 'Big SHX 字体列表',
      type: 'array',
      placeholder: 'hztxt.shx, gbcbig.shx',
    },
    {
      key: 'trueTypeFont',
      label: 'TrueType 字体列表',
      type: 'array2d',
      placeholder: '[["syadobe"], ["思原黑体"]]',
    },
  ];

  const UPLOAD_FIELDS = [
    { key: 'baseUrl', label: '上传服务地址', type: 'text' },
    { key: 'fileisExist', label: '文件存在检查地址', type: 'text' },
    { key: 'chunkisExist', label: '分片存在检查地址', type: 'text' },
    { key: 'chunked', label: '分片上传', type: 'boolean' },
    { key: 'mxfilepath', label: '文件访问路径', type: 'text' },
    { key: 'saveUrl', label: '保存文件服务地址', type: 'text' },
    { key: 'saveDwgUrl', label: '保存 DWG 服务地址', type: 'text' },
    { key: 'printPdfUrl', label: '输出 PDF 服务地址', type: 'text' },
    { key: 'cutDwgUrl', label: '输出 DWG 服务地址', type: 'text' },
  ];

  const UPLOAD_CREATE_FIELDS = [
    { key: 'swf', label: 'SWF 路径', type: 'text' },
    { key: 'server', label: '服务端地址', type: 'text' },
    { key: 'accept.extensions', label: '允许扩展名', type: 'text' },
    { key: 'accept.mimeTypes', label: 'MIME 类型', type: 'text' },
  ];

  const AI_FIELDS = [{ key: 'aiUrl', label: 'AI 服务地址', type: 'text' }];

  const WASM_FIELDS = [
    { key: 'url', label: 'WASM 文件路径', type: 'text' },
    {
      key: 'type',
      label: 'WASM 类型',
      type: 'select',
      options: [
        { value: '2d', label: '2d (多线程)' },
        { value: '2d-st', label: '2d-st (单线程)' },
      ],
    },
  ];

  function init(authToken) {
    token = authToken;
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/server-config', {
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
      <div class="server-config-wrapper">
        <div class="server-config-actions">
          <button class="btn btn-primary" id="saveServerConfigBtn">
            <span class="btn-text">保存配置</span>
            <span class="btn-loading" style="display:none">保存中...</span>
          </button>
          <button class="btn btn-secondary" id="importServerConfigBtn">导入</button>
          <button class="btn btn-secondary" id="exportServerConfigBtn">导出</button>
          <button class="btn btn-secondary" id="refreshServerConfigBtn">刷新</button>
        </div>
        <input type="file" id="serverConfigJsonFile" accept=".json" style="display:none" />
        <div class="server-config-content">
          ${renderUploadSection()}
          ${renderAiSection()}
          ${renderWasmSection()}
          ${renderBasicSection()}
        </div>
      </div>
    `;

    container.innerHTML = html;
    setTimeout(() => bindEvents(container), 0);
  }

  function renderUploadSection() {
    return `
      <div class="config-subsection">
        <h4>上传配置</h4>
        <div class="form-grid">
          ${UPLOAD_FIELDS.map((field) => renderField(field, 'uploadFileConfig')).join('')}
        </div>
        <h5 style="margin: 16px 0 8px; color: #888;">创建配置 (create)</h5>
        <div class="form-grid">
          ${UPLOAD_CREATE_FIELDS.map((field) => renderField(field, 'uploadFileConfig.create')).join('')}
        </div>
      </div>
    `;
  }

  function renderAiSection() {
    return `
      <div class="config-subsection">
        <h4>AI 配置</h4>
        <div class="form-grid">
          ${AI_FIELDS.map((field) => renderField(field, 'aiConfig')).join('')}
        </div>
      </div>
    `;
  }

  function renderWasmSection() {
    return `
      <div class="config-subsection">
        <h4>WASM 配置</h4>
        <div class="form-grid">
          ${WASM_FIELDS.map((field) => renderField(field, 'wasmConfig')).join('')}
        </div>
      </div>
    `;
  }

  function renderBasicSection() {
    return `
      <div class="config-subsection">
        <h4>基础配置</h4>
        <div class="form-grid">
          ${CONFIG_FIELDS.map((field) => renderField(field, '')).join('')}
        </div>
      </div>
      <div class="config-subsection">
        <h4>字体配置</h4>
        <div class="form-grid">
          ${FONT_FIELDS.map((field) => renderField(field, '')).join('')}
        </div>
      </div>
    `;
  }

  function getNestedValue(obj, key) {
    if (!key) return obj;
    const parts = key.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return '';
      current = current[part];
    }
    return current ?? '';
  }

  function renderField(field, prefix) {
    const fullKey = prefix ? `${prefix}.${field.key}` : field.key;
    const value = getNestedValue(currentConfig, fullKey);

    if (field.type === 'boolean') {
      const checked = value ? 'checked' : '';
      return `
        <label class="checkbox-field">
          <input type="checkbox" data-key="${fullKey}" ${checked} />
          ${field.label}
        </label>
      `;
    }

    if (field.type === 'select') {
      const options = field.options
        .map(
          (opt) =>
            `<option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${opt.label}</option>`
        )
        .join('');
      return `
        <div class="field-group">
          <label>${field.label}</label>
          <select data-key="${fullKey}">${options}</select>
        </div>
      `;
    }

    if (field.type === 'array') {
      const arrayValue = Array.isArray(value) ? value.join(', ') : '';
      return `
        <div class="field-group">
          <label>${field.label}</label>
          <input type="text" data-key="${fullKey}" data-type="array" value="${escapeHtml(arrayValue)}" placeholder="${field.placeholder || ''}" />
        </div>
      `;
    }

    if (field.type === 'array2d') {
      const arrayValue = Array.isArray(value) ? JSON.stringify(value) : '';
      return `
        <div class="field-group">
          <label>${field.label}</label>
          <input type="text" data-key="${fullKey}" data-type="array2d" value="${escapeHtml(arrayValue)}" placeholder="${field.placeholder || ''}" />
        </div>
      `;
    }

    return `
      <div class="field-group">
        <label>${field.label}</label>
        <input type="text" data-key="${fullKey}" value="${escapeHtml(String(value))}" />
      </div>
    `;
  }

  async function bindEvents(container) {
    container
      .querySelector('#saveServerConfigBtn')
      .addEventListener('click', saveConfig);
    container
      .querySelector('#refreshServerConfigBtn')
      .addEventListener('click', async () => {
        await loadConfig();
        await renderForm(document.getElementById('serverConfigContent'));
      });
    container
      .querySelector('#importServerConfigBtn')
      .addEventListener('click', () =>
        container.querySelector('#serverConfigJsonFile').click()
      );
    container
      .querySelector('#serverConfigJsonFile')
      .addEventListener('change', importJson);
    container
      .querySelector('#exportServerConfigBtn')
      .addEventListener('click', exportJson);
  }

  async function saveConfig() {
    const btn = document.getElementById('saveServerConfigBtn');
    setButtonLoading(btn, true);

    const updates = {};
    document.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      const fieldType = el.dataset.type;
      const parts = key.split('.');

      if (el.type === 'checkbox') {
        setNestedValue(updates, parts, el.checked);
      } else if (fieldType === 'array') {
        const arr = el.value
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s);
        setNestedValue(updates, parts, arr);
      } else if (fieldType === 'array2d') {
        try {
          const arr = JSON.parse(el.value);
          setNestedValue(updates, parts, arr);
        } catch (e) {
          setNestedValue(updates, parts, el.value);
        }
      } else {
        setNestedValue(updates, parts, el.value);
      }
    });

    try {
      const res = await fetch('/api/server-config', {
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

      const res = await fetch('/api/server-config/import', {
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
        loadConfig().then(() =>
          renderForm(document.getElementById('serverConfigContent'))
        );
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
      const res = await fetch('/api/server-config/export', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'myServerConfig.json';
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
