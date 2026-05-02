/**
 * CloudCAD 草图 UI 配置前端模块
 * 处理 CAD 草图界面配置表单 - 三级菜单树结构
 */

const SKETCHES_CONFIG = (function () {
  let token = '';
  let currentConfig = {};
  let editingItem = null;

  const MENU_ITEM_FIELDS = [
    { key: 'tab', label: '菜单名称', type: 'text', placeholder: '菜单名称' },
    {
      key: 'icon',
      label: '图标',
      type: 'text',
      optional: true,
      placeholder: '图标名称',
    },
    {
      key: 'cmd',
      label: '命令',
      type: 'text',
      optional: true,
      placeholder: 'CAD命令',
    },
    {
      key: 'commandOptions',
      label: '命令选项',
      type: 'text',
      optional: true,
      placeholder: '["C","A"]',
    },
    {
      key: 'type',
      label: '类型',
      type: 'text',
      optional: true,
      placeholder: 'divider/component/group',
    },
  ];

  const MENU_ITEM_EXTRA_FIELDS = [
    { key: 'isShowLabel', label: '显示文字', type: 'boolean' },
    { key: 'isShowToMainPanel', label: '显示到主面板', type: 'boolean' },
    { key: 'isShowToMainPanelRight', label: '显示到右侧', type: 'boolean' },
    { key: 'isSeparateMenuArrowIcon', label: '独立箭头', type: 'boolean' },
    { key: 'labelWithArrowLayout', label: '标签箭头布局', type: 'boolean' },
    { key: 'col', label: '列', type: 'boolean' },
    { key: 'sameWidth', label: '等宽', type: 'boolean' },
    {
      key: 'size',
      label: '尺寸',
      type: 'select',
      options: [
        { value: '', label: '默认' },
        { value: 'large', label: '大' },
      ],
    },
  ];

  function init(authToken) {
    token = authToken;
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/sketches-config', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.status === 401) {
        return { success: false, error: '未授权' };
      }
      const data = await res.json();
      if (data.success) {
        currentConfig = data.data || { mMenuData: [] };
        return { success: true, data: currentConfig };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function renderForm(container) {
    if (!container) return;

    let html = `
      <div class="sketches-config-wrapper">
        <div class="sketches-config-actions">
          <button class="btn btn-primary" id="saveSketchesConfigBtn">
            <span class="btn-text">保存配置</span>
            <span class="btn-loading" style="display:none">保存中...</span>
          </button>
          <button class="btn btn-secondary" id="importSketchesConfigBtn">导入</button>
          <button class="btn btn-secondary" id="exportSketchesConfigBtn">导出</button>
          <button class="btn btn-warning" id="resetSketchesConfigBtn">还原默认</button>
          <button class="btn btn-secondary" id="refreshSketchesConfigBtn">刷新</button>
        </div>
        <input type="file" id="sketchesConfigJsonFile" accept=".json" style="display:none" />
        <div class="sketches-config-content">
          <div class="sketches-menu-tree" id="sketchesMenuTree">
            ${renderMenuData(currentConfig.mMenuData || [])}
          </div>
          <button class="btn btn-secondary add-root-menu-btn" id="addRootMenuBtn">
            + 添加一级菜单
          </button>
        </div>
      </div>
    `;

    container.innerHTML = html;
    setTimeout(() => bindEvents(container), 0);
  }

  function renderMenuData(menus, level = 0, parentPath = '') {
    if (!menus || menus.length === 0) {
      return level === 0 ? '<div class="empty-hint">暂无菜单配置</div>' : '';
    }

    return menus
      .map((menu, idx) => renderMenuItem(menu, idx, level, parentPath))
      .join('');
  }

  function renderMenuItem(menu, idx, level = 0, parentPath = '') {
    const isDivider = menu.type === 'divider';
    const hasChildren = menu.list && menu.list.length > 0;
    const indent = level * 20;
    const currentPath = parentPath ? `${parentPath},${idx}` : `${idx}`;

    let html = `
      <div class="menu-tree-item level-${level}" data-level="${level}" data-idx="${idx}" data-path="${currentPath}">
        <div class="menu-item-row" style="padding-left: ${indent}px">
          ${hasChildren ? '<span class="expand-btn" data-expanded="true">▼</span>' : '<span class="expand-btn" style="visibility:hidden">▼</span>'}
          ${
            isDivider
              ? '<span class="divider-label">--- 分隔线 ---</span>'
              : `<span class="menu-name">${escapeHtml(menu.tab || menu.label || '(未命名)')}</span>
               <span class="menu-cmd">${escapeHtml(menu.cmd || '')}</span>`
          }
          <div class="menu-actions">
            ${!isDivider ? `<button class="btn btn-sm btn-secondary add-child-btn">+ 子菜单</button>` : ''}
            <button class="btn btn-sm btn-secondary edit-btn">编辑</button>
            <button class="btn btn-sm btn-danger delete-btn">删除</button>
          </div>
        </div>
        ${hasChildren ? `<div class="menu-children">${renderMenuData(menu.list, level + 1, currentPath)}</div>` : ''}
      </div>
    `;
    return html;
  }

  function getMenuByPath(pathStr) {
    const indices = pathStr.split(',').map(Number);
    // Start from root
    let current = currentConfig.mMenuData;
    // Traverse until the second-to-last index to get the parent
    for (let i = 0; i < indices.length - 1; i++) {
      if (current && current[indices[i]] && current[indices[i]].list) {
        current = current[indices[i]].list;
      } else {
        return null;
      }
    }
    // Now current is the parent array, get the last item
    const lastIdx = indices[indices.length - 1];
    if (current && current[lastIdx]) {
      return { parent: current, idx: lastIdx, item: current[lastIdx] };
    }
    return null;
  }

  function bindEvents(container) {
    container
      .querySelector('#saveSketchesConfigBtn')
      .addEventListener('click', saveConfig);
    container
      .querySelector('#refreshSketchesConfigBtn')
      .addEventListener('click', () => {
        loadConfig().then(() =>
          renderForm(document.getElementById('sketchesConfigContent'))
        );
      });
    container
      .querySelector('#importSketchesConfigBtn')
      .addEventListener('click', () =>
        container.querySelector('#sketchesConfigJsonFile').click()
      );
    container
      .querySelector('#sketchesConfigJsonFile')
      .addEventListener('change', importJson);
    container
      .querySelector('#exportSketchesConfigBtn')
      .addEventListener('click', exportJson);
    container
      .querySelector('#resetSketchesConfigBtn')
      .addEventListener('click', async () => {
        if (!confirm('确定要还原为默认配置吗？')) return;
        try {
          const res = await fetch('/api/sketches-config/reset', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast('配置已还原为默认', 'success');
            loadConfig().then(() =>
              renderForm(document.getElementById('sketchesConfigContent'))
            );
          } else {
            showToast(data.error || '还原失败', 'error');
          }
        } catch (e) {
          showToast('还原失败: ' + e.message, 'error');
        }
      });
    container
      .querySelector('#addRootMenuBtn')
      .addEventListener('click', () => addRootMenu(container));

    // Menu tree events
    container.querySelectorAll('.expand-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.menu-tree-item');
        const children = item.querySelector('.menu-children');
        if (children) {
          const isExpanded = btn.dataset.expanded === 'true';
          btn.dataset.expanded = !isExpanded;
          children.style.display = isExpanded ? 'none' : 'block';
          btn.textContent = isExpanded ? '▶' : '▼';
        }
      });
    });

    container.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.menu-tree-item');
        editMenuItem(item, container);
      });
    });

    container.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定删除此项？')) {
          const item = btn.closest('.menu-tree-item');
          deleteMenuItem(item, container);
        }
      });
    });

    container.querySelectorAll('.add-child-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.menu-tree-item');
        addChildMenu(item, container);
      });
    });
  }

  function addRootMenu(container) {
    const newMenu = { tab: '新菜单', list: [] };
    currentConfig.mMenuData = currentConfig.mMenuData || [];
    currentConfig.mMenuData.push(newMenu);
    renderForm(container);
  }

  function addChildMenu(item, container) {
    const pathStr = item.dataset.path;
    const result = getMenuByPath(pathStr);
    if (!result || !result.item) return;

    const parent = result.item;
    if (!parent) return;

    const newItem = { tab: '新菜单项', list: [] };
    parent.list = parent.list || [];
    parent.list.push(newItem);
    renderForm(container);
  }

  function editMenuItem(item, container) {
    const pathStr = item.dataset.path;
    const result = getMenuByPath(pathStr);
    if (!result || !result.item) return;

    const menuData = result.item;

    const modal = showEditModal(menuData, (updated) => {
      Object.assign(menuData, updated);
      renderForm(container);
    });
  }

  function deleteMenuItem(item, container) {
    const pathStr = item.dataset.path;
    const result = getMenuByPath(pathStr);
    if (!result || !result.parent) return;

    result.parent.splice(result.idx, 1);
    renderForm(container);
  }

  function showEditModal(menuData, onSave) {
    const isDivider = menuData.type === 'divider';

    const fieldsHtml = MENU_ITEM_FIELDS.filter(
      (f) => f.key !== 'type' || !isDivider
    )
      .map((field) => {
        let value = menuData[field.key];
        // Convert arrays to JSON string for display
        if (Array.isArray(value)) {
          value = JSON.stringify(value);
        } else if (value === undefined || value === null) {
          value = '';
        }
        if (field.type === 'boolean') {
          return `
            <label class="checkbox-inline">
              <input type="checkbox" data-field="${field.key}" ${value ? 'checked' : ''} /> 
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
            <div class="field-inline">
              <label>${field.label}</label>
              <select data-field="${field.key}">${options}</select>
            </div>
          `;
        }
        return `
          <div class="field-inline">
            <label>${field.label}</label>
            <input type="text" data-field="${field.key}" value="${escapeHtml(value)}" placeholder="${field.placeholder || ''}" />
          </div>
        `;
      })
      .join('');

    const extraFieldsHtml = MENU_ITEM_EXTRA_FIELDS.map((field) => {
      const value = menuData[field.key];
      if (field.type === 'boolean') {
        return `
          <label class="checkbox-inline">
            <input type="checkbox" data-field="${field.key}" ${value ? 'checked' : ''} /> 
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
          <div class="field-inline">
            <label>${field.label}</label>
            <select data-field="${field.key}">${options}</select>
          </div>
        `;
      }
      return '';
    }).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h4>编辑菜单项</h4>
        <div class="modal-fields">${fieldsHtml}</div>
        ${!isDivider ? `<div class="modal-extra"><h5>高级选项</h5>${extraFieldsHtml}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancelEditBtn">取消</button>
          <button class="btn btn-primary" id="saveEditBtn">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal
      .querySelector('#cancelEditBtn')
      .addEventListener('click', () => modal.remove());
    modal.querySelector('#saveEditBtn').addEventListener('click', () => {
      const updates = {};
      modal.querySelectorAll('[data-field]').forEach((el) => {
        updates[el.dataset.field] =
          el.type === 'checkbox' ? el.checked : el.value;
      });
      // Handle commandOptions JSON
      if (updates.commandOptions) {
        try {
          updates.commandOptions = JSON.parse(updates.commandOptions);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }
      onSave(updates);
      modal.remove();
    });

    return modal;
  }

  async function saveConfig() {
    const btn = document.getElementById('saveSketchesConfigBtn');
    setButtonLoading(btn, true);

    try {
      const res = await fetch('/api/sketches-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(currentConfig),
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

  async function importJson(e) {
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
        loadConfig().then(() =>
          renderForm(document.getElementById('sketchesConfigContent'))
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

  return { init, loadConfig, renderForm, updateTextarea: () => {} };
})();
