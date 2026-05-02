/**
 * CloudCAD 前端配置模块
 * 整合 UI配置、草图配置、品牌配置
 */

const FRONTEND_CONFIG = (function () {
  let token = '';
  let currentUiConfig = {};
  let currentBrandConfig = {};
  let currentServerConfig = {};
  let currentQuickCommandConfig = [];
  let currentThemeConfig = {};

  function init(authToken) {
    token = authToken;
    UI_CONFIG.init(token);
    SKETCHES_CONFIG.init(token);
    SERVER_CONFIG.init(token);
    QUICK_COMMAND_CONFIG.init(token);
    THEME_CONFIG.init(token);
  }

  async function loadConfig() {
    const [uiResult, , brandResult, serverResult, quickCmdResult, themeResult] =
      await Promise.all([
        UI_CONFIG.loadConfig(),
        SKETCHES_CONFIG.loadConfig(),
        loadBrandConfig(),
        SERVER_CONFIG.loadConfig(),
        QUICK_COMMAND_CONFIG.loadConfig(),
        THEME_CONFIG.loadConfig(),
      ]);

    if (uiResult.success) {
      currentUiConfig = uiResult.data;
    }
    if (brandResult.success) {
      currentBrandConfig = brandResult.data;
    }
    if (serverResult.success) {
      currentServerConfig = serverResult.data;
    }
    if (quickCmdResult.success) {
      currentQuickCommandConfig = quickCmdResult.data;
    }
    if (themeResult.success) {
      currentThemeConfig = themeResult.data;
    }

    return {
      success:
        uiResult.success ||
        brandResult.success ||
        serverResult.success ||
        quickCmdResult.success ||
        themeResult.success,
      data: {
        ui: currentUiConfig,
        brand: currentBrandConfig,
        server: currentServerConfig,
        quickCommand: currentQuickCommandConfig,
        theme: currentThemeConfig,
      },
    };
  }

  async function loadBrandConfig() {
    try {
      const res = await fetch('/api/brand', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (data.success) {
        currentBrandConfig = data.data || {};
        return { success: true, data: currentBrandConfig };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function renderForm(container) {
    if (!container) return;

    let html = `
      <div class="frontend-config-container">
        <div class="frontend-config-header">
          <h3 class="frontend-config-title">前端配置</h3>
        </div>

        <div class="frontend-config-content">
          ${renderSection('uiConfig', 'UI 配置', 'CAD 编辑器界面配置', renderUiConfigSection())}
          ${renderSection('sketchesConfig', '草图 UI 配置', 'CAD 草图模式菜单配置', renderSketchesConfigSection())}
          ${renderSection('quickCommand', '命令别名', 'CAD 快捷命令配置', renderQuickCommandSection())}
          ${renderSection('serverConfig', '服务器配置', 'CAD 服务器端配置', renderServerConfigSection())}
          ${renderSection('themeConfig', '主题配置', 'CAD 界面主题颜色', renderThemeConfigSection())}
          ${renderSection('brandConfig', '品牌配置', '应用 Logo 和标题', renderBrandConfigSection())}
        </div>
      </div>
    `;

    container.innerHTML = html;
    setTimeout(() => bindEvents(container), 0);
  }

  function renderSection(id, title, desc, content) {
    return `
      <div class="config-section">
        <div class="section-header collapsed" data-section="${id}">
          <span>▶</span>
          <div class="section-title">
            <strong>${title}</strong>
            <small>${desc}</small>
          </div>
        </div>
        <div class="section-content" style="display:none">${content}</div>
      </div>
    `;
  }

  function renderUiConfigSection() {
    return `
      <div class="ui-config-section" id="uiConfigSection">
        <div id="uiConfigFormContent"></div>
      </div>
    `;
  }

  function renderSketchesConfigSection() {
    return `
      <div class="sketches-config-section" id="sketchesConfigSection">
        <div id="sketchesConfigContent"></div>
      </div>
    `;
  }

  function renderBrandConfigSection() {
    const logoUrl = currentBrandConfig.logo || '/brand/logo.png';
    return `
      <div class="brand-config-section" id="brandConfigSection">
        <div class="section-actions">
          <button class="btn btn-primary btn-save" data-action="saveBrandConfig">
            <span class="btn-text">保存配置</span>
            <span class="btn-loading" style="display:none">保存中...</span>
          </button>
          <button class="btn btn-secondary" data-action="uploadLogoBtn">上传 Logo</button>
          <input type="file" data-action="logoFileInput" accept="image/*" style="display:none" />
        </div>
        <div class="brand-form">
          <div class="form-group">
            <label>应用标题</label>
            <input type="text" id="brandTitle" value="${escapeHtml(currentBrandConfig.title || '')}" placeholder="请输入应用标题" maxlength="100" />
          </div>
          <div class="form-group">
            <label>当前 Logo</label>
            <div id="brandLogoPreview">
              <img src="${escapeHtml(logoUrl)}" style="max-width: 200px; max-height: 60px;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline';" />
              <span style="color:#666;display:none">未设置 Logo</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderServerConfigSection() {
    return `
      <div class="server-config-section" id="serverConfigSection">
        <div id="serverConfigContent"></div>
      </div>
    `;
  }

  function renderQuickCommandSection() {
    return `
      <div class="quick-command-section" id="quickCommandSection">
        <div id="quickCommandContent"></div>
      </div>
    `;
  }

  function renderThemeConfigSection() {
    return `
      <div class="theme-config-section" id="themeConfigSection">
        <div id="themeConfigContent"></div>
      </div>
    `;
  }

  async function bindEvents(container) {
    // Section collapse/expand
    container.querySelectorAll('.section-header').forEach((header) => {
      header.addEventListener('click', function () {
        this.classList.toggle('collapsed');
        const content = this.nextElementSibling;
        if (content) {
          content.style.display = this.classList.contains('collapsed')
            ? 'none'
            : 'block';
        }
      });
    });

    // Render UI Config form
    UI_CONFIG.renderForm(container.querySelector('#uiConfigFormContent'));

    // Render Sketches Config form
    SKETCHES_CONFIG.renderForm(
      container.querySelector('#sketchesConfigContent')
    );

    // Render Server Config form
    await SERVER_CONFIG.renderForm(
      container.querySelector('#serverConfigContent')
    );

    // Render Quick Command Config form
    await QUICK_COMMAND_CONFIG.renderForm(
      container.querySelector('#quickCommandContent')
    );

    // Render Theme Config form
    await THEME_CONFIG.renderForm(
      container.querySelector('#themeConfigContent')
    );

    // Bind Brand Config events
    const brandSection = container.querySelector('.brand-config-section');
    if (brandSection) {
      const saveBrandBtn = brandSection.querySelector(
        '[data-action="saveBrandConfig"]'
      );
      const uploadLogoBtn = brandSection.querySelector(
        '[data-action="uploadLogoBtn"]'
      );
      const logoFileInput = brandSection.querySelector(
        '[data-action="logoFileInput"]'
      );

      if (saveBrandBtn) {
        saveBrandBtn.addEventListener('click', () =>
          saveBrandConfig(container)
        );
      }
      if (uploadLogoBtn && logoFileInput) {
        uploadLogoBtn.addEventListener('click', () => logoFileInput.click());
        logoFileInput.addEventListener('change', (e) =>
          uploadLogo(e, container)
        );
      }
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

  async function saveUiConfig(container) {
    const section = container.querySelector('.ui-config-section');
    const btn = section.querySelector('[data-action="saveUiConfig"]');

    const updates = {};

    section
      .querySelectorAll('#uiConfigFormContent [id^="ui-"]')
      .forEach((el) => {
        const key = el.id.replace('ui-', '');
        if (el.type === 'checkbox') {
          updates[key] = el.checked;
        } else if (el.type === 'select-multiple') {
          updates[key] = Array.from(el.selectedOptions).map((opt) => opt.value);
        } else {
          updates[key] = el.value;
        }
      });

    const allSchemas = UI_CONFIG.BUTTON_SCHEMAS.concat(
      UI_CONFIG.BUTTON_BAR_SCHEMAS,
      UI_CONFIG.MENU_SCHEMAS,
      UI_CONFIG.RIGHT_MENU_SCHEMAS
    );

    section
      .querySelectorAll('#uiConfigFormContent .complex-card')
      .forEach((card) => {
        const schemaKey = card.dataset.schema;
        if (!schemaKey) return;

        let schema = allSchemas.find((s) => s.key === schemaKey);
        if (!schema) return;

        const isShowCheck = card.querySelector('.is-show-check');
        if (
          schemaKey === 'mLeftButtonBarData' ||
          schemaKey === 'mRightButtonBarData'
        ) {
          const isShow = isShowCheck?.checked ?? true;
          const items = collectComplexItems(card, schema);
          updates[schemaKey] = { isShow, buttonBarData: items };
        } else if (schema.isShowKey) {
          const isShow = isShowCheck?.checked ?? true;
          updates[schema.isShowKey] = !isShow;
          updates[schemaKey] = collectComplexItems(card, schema);
        } else {
          updates[schemaKey] = collectComplexItems(card, schema);
        }
      });

    setButtonLoading(btn, true);

    try {
      const res = await fetch('/api/ui-config', {
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
        showToast('UI 配置已保存', 'success');
        refreshUiConfig(container);
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

  function collectComplexItems(card, schema) {
    const childrenKey = schema.childrenKey;
    const items = [];
    card.querySelectorAll('.complex-item').forEach((item) => {
      if (item.classList.contains('child-item')) return;

      const obj = {};
      const fields = schema.itemFields || schema.fields || [];
      fields.forEach((field) => {
        const input = item.querySelector(`[data-field="${field.key}"]`);
        if (input) {
          obj[field.key] =
            field.type === 'boolean' ? input.checked : input.value;
        }
      });

      if (childrenKey) {
        const childContainer = item.querySelector(`.children-items`);
        if (childContainer) {
          const childItems = [];
          childContainer
            .querySelectorAll('.complex-item:not(.menu-item)')
            .forEach((child) => {
              const childObj = {};
              const childFields = schema.childFields || schema.itemFields || [];
              childFields.forEach((field) => {
                const input = child.querySelector(
                  `[data-field="${field.key}"]`
                );
                if (input) {
                  childObj[field.key] =
                    field.type === 'boolean' ? input.checked : input.value;
                }
              });
              childItems.push(childObj);
            });
          if (childItems.length > 0) obj[childrenKey] = childItems;
        }
      }
      items.push(obj);
    });
    return items;
  }

  async function importUiConfig(e, container) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch('/api/ui-config/import', {
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
        renderForm(container);
      } else {
        showToast(data.error || '导入失败', 'error');
      }
    } catch (err) {
      showToast('JSON 解析失败: ' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function exportUiConfig() {
    try {
      const res = await fetch('/api/ui-config/export', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'myUiConfig.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('配置已导出', 'success');
      } else {
        showToast('导出失败', 'error');
      }
    } catch (e) {
      showToast('导出失败: ' + e.message, 'error');
    }
  }

  async function resetUiConfig() {
    if (!confirm('确定要还原为默认配置吗？')) return;

    try {
      const res = await fetch('/api/ui-config/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        await loadConfig();
        const container = document.getElementById('frontendConfigContent');
        if (container) renderForm(container);
      } else {
        showToast(data.error || '还原失败', 'error');
      }
    } catch (e) {
      showToast('还原失败: ' + e.message, 'error');
    }
  }

  async function refreshUiConfig(container) {
    const result = await UI_CONFIG.loadConfig();
    if (result.success) {
      currentUiConfig = result.data;
      UI_CONFIG.renderForm(container.querySelector('#uiConfigFormContent'));
    }
    showToast('已刷新', 'info');
  }

  async function saveBrandConfig(container) {
    const section = container.querySelector('.brand-config-section');
    const title = section.querySelector('#brandTitle').value;

    const btn = section.querySelector('[data-action="saveBrandConfig"]');
    setButtonLoading(btn, true);

    try {
      const res = await fetch('/api/brand', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      setButtonLoading(btn, false);

      if (res.ok && data.success) {
        showToast('品牌配置已保存', 'success');
        await loadBrandConfig();
        renderForm(container);
      } else {
        showToast(data.error || '保存失败', 'error');
      }
    } catch (e) {
      setButtonLoading(btn, false);
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  async function uploadLogo(e, container) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('logo', file);

    try {
      const res = await fetch('/api/brand/logo', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast('Logo 上传成功', 'success');
        await loadBrandConfig();
        renderForm(container);
        // Force refresh logo preview by reloading the image
        const img = container.querySelector('#brandLogoPreview img');
        if (img) {
          img.src = img.src + '?t=' + Date.now();
        }
      } else {
        showToast(data.error || '上传失败', 'error');
      }
    } catch (e) {
      showToast('上传失败: ' + e.message, 'error');
    }
    e.target.value = '';
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
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

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

  function collectComplexItems(card, schema) {
    const childrenKey = schema.childrenKey;
    const items = [];
    card.querySelectorAll('.complex-item').forEach((item) => {
      if (item.classList.contains('child-item')) return;

      const obj = {};
      const fields = schema.itemFields || schema.fields || [];
      fields.forEach((field) => {
        const input = item.querySelector(`[data-field="${field.key}"]`);
        if (input) {
          obj[field.key] =
            field.type === 'boolean' ? input.checked : input.value;
        }
      });

      if (childrenKey) {
        const childContainer = item.querySelector(`.children-items`);
        if (childContainer) {
          const childItems = [];
          childContainer
            .querySelectorAll('.complex-item:not(.menu-item)')
            .forEach((child) => {
              const childObj = {};
              const childFields = schema.childFields || schema.itemFields || [];
              childFields.forEach((field) => {
                const input = child.querySelector(
                  `[data-field="${field.key}"]`
                );
                if (input) {
                  childObj[field.key] =
                    field.type === 'boolean' ? input.checked : input.value;
                }
              });
              childItems.push(childObj);
            });
          if (childItems.length > 0) obj[childrenKey] = childItems;
        }
      }
      items.push(obj);
    });
    return items;
  }

  // ========== UI 配置操作函数 ==========

  async function saveUiConfig(container) {
    const section = container.querySelector('.ui-config-section');
    const btn = section?.querySelector('[data-action="saveUiConfig"]');
    if (!section || !btn) return;

    setButtonLoading(btn, true);

    const updates = {};
    section
      .querySelectorAll('#uiConfigFormContent [id^="ui-"]')
      .forEach((el) => {
        const key = el.id.replace('ui-', '');
        if (el.type === 'checkbox') {
          updates[key] = el.checked;
        } else if (el.type === 'select-multiple') {
          updates[key] = Array.from(el.selectedOptions).map((opt) => opt.value);
        } else {
          updates[key] = el.value;
        }
      });

    const allSchemas = UI_CONFIG.BUTTON_SCHEMAS.concat(
      UI_CONFIG.BUTTON_BAR_SCHEMAS,
      UI_CONFIG.MENU_SCHEMAS,
      UI_CONFIG.RIGHT_MENU_SCHEMAS
    );

    section
      .querySelectorAll('#uiConfigFormContent .complex-card')
      .forEach((card) => {
        const schemaKey = card.dataset.schema;
        if (!schemaKey) return;

        let schema = allSchemas.find((s) => s.key === schemaKey);
        if (!schema) return;

        const isShowCheck = card.querySelector('.is-show-check');
        if (
          schemaKey === 'mLeftButtonBarData' ||
          schemaKey === 'mRightButtonBarData'
        ) {
          const isShow = isShowCheck?.checked ?? true;
          const items = collectComplexItems(card, schema);
          updates[schemaKey] = { isShow, buttonBarData: items };
        } else if (schema.isShowKey) {
          const isShow = isShowCheck?.checked ?? true;
          updates[schema.isShowKey] = !isShow;
          updates[schemaKey] = collectComplexItems(card, schema);
        } else {
          updates[schemaKey] = collectComplexItems(card, schema);
        }
      });

    try {
      const res = await fetch('/api/ui-config', {
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
        showToast('UI 配置已保存', 'success');
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
      showToast('保存失败：' + e.message, 'error');
    }
  }

  async function importUiConfig(e, container) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch('/api/ui-config/import', {
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
        const section = container.querySelector('#uiConfigFormContent');
        if (section) UI_CONFIG.renderForm(section);
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
      showToast('JSON 解析失败：' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function exportUiConfig(container) {
    try {
      const res = await fetch('/api/ui-config/export', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'myUiConfig.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('配置已导出', 'success');
      } else {
        showToast('导出失败', 'error');
      }
    } catch (e) {
      showToast('导出失败：' + e.message, 'error');
    }
  }

  async function resetUiConfig(container) {
    if (!confirm('确定要还原 UI 配置为默认吗？')) return;

    try {
      const res = await fetch('/api/ui-config/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        await loadConfig();
        const section = container.querySelector('#uiConfigFormContent');
        if (section) UI_CONFIG.renderForm(section);
      } else {
        showToast(data.error || '还原失败', 'error');
      }
    } catch (e) {
      showToast('还原失败：' + e.message, 'error');
    }
  }

  async function refreshUiConfig(container) {
    try {
      const result = await UI_CONFIG.loadConfig();
      if (result.success) {
        const section = container.querySelector('#uiConfigFormContent');
        if (section) UI_CONFIG.renderForm(section);
        showToast('已刷新', 'info');
      } else {
        showToast('刷新失败', 'error');
      }
    } catch (e) {
      showToast('刷新失败：' + e.message, 'error');
    }
  }

  // ========== 草图配置操作函数 ==========

  async function saveSketchesConfig(container) {
    const btn = container.querySelector('[data-action="saveSketchesConfig"]');
    if (!btn) return;

    setButtonLoading(btn, true);

    try {
      const res = await fetch('/api/sketches-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(SKETCHES_CONFIG.currentConfig),
      });

      const data = await res.json();
      setButtonLoading(btn, false);

      if (res.ok && data.success) {
        showToast('草图配置已保存', 'success');
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
      showToast('保存失败：' + e.message, 'error');
    }
  }

  async function importSketchesConfig(e, container) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch('/api/sketches-config/import', {
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
        const section = container.querySelector('#sketchesConfigContent');
        if (section) SKETCHES_CONFIG.renderForm(section);
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
      showToast('JSON 解析失败：' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function exportSketchesConfig() {
    try {
      const res = await fetch('/api/sketches-config/export', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mySketchesAndNotesUiConfig.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('配置已导出', 'success');
      } else {
        showToast('导出失败', 'error');
      }
    } catch (e) {
      showToast('导出失败：' + e.message, 'error');
    }
  }

  async function resetSketchesConfig(container) {
    if (!confirm('确定要还原草图配置为默认吗？')) return;

    try {
      const res = await fetch('/api/sketches-config/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        await loadConfig();
        const section = container.querySelector('#sketchesConfigContent');
        if (section) SKETCHES_CONFIG.renderForm(section);
      } else {
        showToast(data.error || '还原失败', 'error');
      }
    } catch (e) {
      showToast('还原失败：' + e.message, 'error');
    }
  }

  async function refreshSketchesConfig(container) {
    try {
      const result = await SKETCHES_CONFIG.loadConfig();
      if (result.success) {
        const section = container.querySelector('#sketchesConfigContent');
        if (section) SKETCHES_CONFIG.renderForm(section);
        showToast('已刷新', 'info');
      } else {
        showToast('刷新失败', 'error');
      }
    } catch (e) {
      showToast('刷新失败：' + e.message, 'error');
    }
  }

  // ========== 服务器配置操作函数 ==========

  async function saveServerConfig(container) {
    const btn = container.querySelector('[data-action="saveServerConfig"]');
    if (!btn) return;

    setButtonLoading(btn, true);

    const updates = {};
    container.querySelectorAll('.server-config-section [data-key]').forEach((el) => {
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
        showToast('服务器配置已保存', 'success');
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
      showToast('保存失败：' + e.message, 'error');
    }
  }

  async function importServerConfig(e, container) {
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
        await loadConfig();
        const section = container.querySelector('#serverConfigContent');
        if (section) SERVER_CONFIG.renderForm(section);
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
      showToast('JSON 解析失败：' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function exportServerConfig() {
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
        showToast('导出失败', 'error');
      }
    } catch (e) {
      showToast('导出失败：' + e.message, 'error');
    }
  }

  async function resetServerConfig(container) {
    if (!confirm('确定要还原服务器配置为默认吗？')) return;

    try {
      const res = await fetch('/api/server-config/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        await loadConfig();
        const section = container.querySelector('#serverConfigContent');
        if (section) SERVER_CONFIG.renderForm(section);
      } else {
        showToast(data.error || '还原失败', 'error');
      }
    } catch (e) {
      showToast('还原失败：' + e.message, 'error');
    }
  }

  async function refreshServerConfig(container) {
    try {
      const result = await SERVER_CONFIG.loadConfig();
      if (result.success) {
        const section = container.querySelector('#serverConfigContent');
        if (section) SERVER_CONFIG.renderForm(section);
        showToast('已刷新', 'info');
      } else {
        showToast('刷新失败', 'error');
      }
    } catch (e) {
      showToast('刷新失败：' + e.message, 'error');
    }
  }

  // ========== 命令别名配置操作函数 ==========

  async function saveQuickCommandConfig(container) {
    const btn = container.querySelector('[data-action="saveQuickCommandConfig"]');
    if (!btn) return;

    setButtonLoading(btn, true);

    try {
      const res = await fetch('/api/quick-command', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(QUICK_COMMAND_CONFIG.currentConfig),
      });

      const data = await res.json();
      setButtonLoading(btn, false);

      if (res.ok && data.success) {
        showToast('命令别名配置已保存', 'success');
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
      showToast('保存失败：' + e.message, 'error');
    }
  }

  async function importQuickCommandConfig(e, container) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch('/api/quick-command/import', {
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
        const section = container.querySelector('#quickCommandContent');
        if (section) QUICK_COMMAND_CONFIG.renderForm(section);
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
      showToast('JSON 解析失败：' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function exportQuickCommandConfig() {
    try {
      const res = await fetch('/api/quick-command/export', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'myQuickCommand.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('配置已导出', 'success');
      } else {
        showToast('导出失败', 'error');
      }
    } catch (e) {
      showToast('导出失败：' + e.message, 'error');
    }
  }

  async function resetQuickCommandConfig(container) {
    if (!confirm('确定要还原命令别名配置为默认吗？')) return;

    try {
      const res = await fetch('/api/quick-command/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        await loadConfig();
        const section = container.querySelector('#quickCommandContent');
        if (section) QUICK_COMMAND_CONFIG.renderForm(section);
      } else {
        showToast(data.error || '还原失败', 'error');
      }
    } catch (e) {
      showToast('还原失败：' + e.message, 'error');
    }
  }

  async function refreshQuickCommandConfig(container) {
    try {
      const result = await QUICK_COMMAND_CONFIG.loadConfig();
      if (result.success) {
        const section = container.querySelector('#quickCommandContent');
        if (section) QUICK_COMMAND_CONFIG.renderForm(section);
        showToast('已刷新', 'info');
      } else {
        showToast('刷新失败', 'error');
      }
    } catch (e) {
      showToast('刷新失败：' + e.message, 'error');
    }
  }

  // ========== 主题配置操作函数 ==========

  async function saveThemeConfig(container) {
    const btn = container.querySelector('[data-action="saveThemeConfig"]');
    if (!btn) return;

    setButtonLoading(btn, true);

    const updates = {};
    const themeSection = container.querySelector('.theme-config-section');

    const defaultThemeRadio = themeSection?.querySelector(
      'input[name="defaultTheme"]:checked'
    );
    if (defaultThemeRadio) {
      updates.defaultTheme = defaultThemeRadio.value;
    }

    themeSection?.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      const fieldType = el.dataset.type;
      const parts = key.split('.');

      let value = el.value;
      if (fieldType === 'opacity' || fieldType === 'number') {
        value = parseFloat(value);
      }

      setNestedValue(updates, parts, value);
    });

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
        showToast('主题配置已保存', 'success');
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
      showToast('保存失败：' + e.message, 'error');
    }
  }

  async function importThemeConfig(e, container) {
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
        const section = container.querySelector('#themeConfigContent');
        if (section) THEME_CONFIG.renderForm(section);
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
      showToast('JSON 解析失败：' + err.message, 'error');
    }
    e.target.value = '';
  }

  async function exportThemeConfig() {
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
        showToast('导出失败', 'error');
      }
    } catch (e) {
      showToast('导出失败：' + e.message, 'error');
    }
  }

  async function resetThemeConfig(container) {
    if (!confirm('确定要还原主题配置为默认吗？')) return;

    try {
      const res = await fetch('/api/theme-config/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        await loadConfig();
        const section = container.querySelector('#themeConfigContent');
        if (section) THEME_CONFIG.renderForm(section);
      } else {
        showToast(data.error || '还原失败', 'error');
      }
    } catch (e) {
      showToast('还原失败：' + e.message, 'error');
    }
  }

  async function refreshThemeConfig(container) {
    try {
      const result = await THEME_CONFIG.loadConfig();
      if (result.success) {
        const section = container.querySelector('#themeConfigContent');
        if (section) THEME_CONFIG.renderForm(section);
        showToast('已刷新', 'info');
      } else {
        showToast('刷新失败', 'error');
      }
    } catch (e) {
      showToast('刷新失败：' + e.message, 'error');
    }
  }

  return { init, loadConfig, renderForm };
})();
