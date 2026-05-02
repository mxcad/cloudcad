/**
 * CloudCAD 命令别名配置前端模块
 * 处理 myQuickCommand.json
 */

const QUICK_COMMAND_CONFIG = (function () {
  let token = '';
  let currentConfig = [];

  function init(authToken) {
    token = authToken;
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/quick-command', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.status === 401) {
        return { success: false, error: '未授权' };
      }
      const data = await res.json();
      if (data.success) {
        currentConfig = data.data || [];
        return { success: true, data: currentConfig };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function renderForm(container) {
    if (!container) return;

    if (currentConfig.length === 0) {
      container.innerHTML =
        '<div style="padding:20px;text-align:center;color:#888">加载中...</div>';
      const result = await loadConfig();
      if (!result.success) {
        container.innerHTML = `<div style="padding:20px;text-align:center;color:#e74c3c">加载失败: ${result.error}</div>`;
        return;
      }
    }

    let html = `
      <div class="quick-command-wrapper">
        <div class="quick-command-actions">
          <button class="btn btn-primary" id="saveQuickCommandBtn">
            <span class="btn-text">保存配置</span>
            <span class="btn-loading" style="display:none">保存中...</span>
          </button>
          <button class="btn btn-secondary" id="importQuickCommandBtn">导入</button>
          <button class="btn btn-secondary" id="exportQuickCommandBtn">导出</button>
          <button class="btn btn-secondary" id="resetQuickCommandBtn">还原默认</button>
          <button class="btn btn-secondary" id="addQuickCommandBtn">添加命令</button>
        </div>
        <input type="file" id="quickCommandJsonFile" accept=".json" style="display:none" />
        <div class="quick-command-list">
          ${renderCommandList()}
        </div>
      </div>
    `;

    container.innerHTML = html;
    setTimeout(() => bindEvents(container), 0);
  }

  function renderCommandList() {
    if (currentConfig.length === 0) {
      return '<div class="empty-hint">暂无命令配置</div>';
    }

    return currentConfig
      .map((cmd, idx) => {
        const mainCmd = cmd[0] || '';
        const aliases = cmd.slice(1);
        return `
        <div class="quick-command-item" data-index="${idx}">
          <div class="qc-item-header">
            <span class="qc-main-cmd">${escapeHtml(mainCmd)}</span>
            <div class="qc-aliases">
              ${aliases.map((alias) => `<span class="qc-alias">${escapeHtml(alias)}</span>`).join('')}
              ${aliases.length === 0 ? '<span class="qc-no-alias">无别名</span>' : ''}
            </div>
            <div class="qc-actions">
              <button class="btn btn-sm btn-secondary" data-action="edit" data-index="${idx}">编辑</button>
              <button class="btn btn-sm btn-danger" data-action="delete" data-index="${idx}">删除</button>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  function bindEvents(container) {
    container
      .querySelector('#saveQuickCommandBtn')
      .addEventListener('click', saveConfig);
    container
      .querySelector('#refreshQuickCommandBtn')
      ?.addEventListener('click', async () => {
        await loadConfig();
        await renderForm(document.getElementById('quickCommandContent'));
      });
    container
      .querySelector('#importQuickCommandBtn')
      .addEventListener('click', () => {
        container.querySelector('#quickCommandJsonFile').click();
      });
    container
      .querySelector('#quickCommandJsonFile')
      .addEventListener('change', importJson);
    container
      .querySelector('#exportQuickCommandBtn')
      .addEventListener('click', exportJson);
    container
      .querySelector('#resetQuickCommandBtn')
      .addEventListener('click', resetConfig);
    container
      .querySelector('#addQuickCommandBtn')
      .addEventListener('click', () => showEditModal());

    container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        showEditModal(idx);
      });
    });

    container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        deleteCommand(idx);
      });
    });
  }

  function showEditModal(idx = -1) {
    const isEdit = idx >= 0;
    const command = isEdit ? currentConfig[idx] : ['', ''];
    const mainCmd = command[0] || '';
    const aliases = command.slice(1).join(', ');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h4>${isEdit ? '编辑命令' : '添加命令'}</h4>
        <div class="form-group">
          <label>主命令 <span style="color:#e74c3c">*</span></label>
          <input type="text" id="qcMainCmd" value="${escapeHtml(mainCmd)}" placeholder="如: Mx_New" />
        </div>
        <div class="form-group">
          <label>别名（用逗号分隔）</label>
          <input type="text" id="qcAliases" value="${escapeHtml(aliases)}" placeholder="如: _new, new" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="qcCancelBtn">取消</button>
          <button class="btn btn-primary" id="qcSaveBtn">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal
      .querySelector('#qcCancelBtn')
      .addEventListener('click', () => modal.remove());
    modal.querySelector('#qcSaveBtn').addEventListener('click', () => {
      const newMainCmd = modal.querySelector('#qcMainCmd').value.trim();
      const newAliases = modal
        .querySelector('#qcAliases')
        .value.split(',')
        .map((s) => s.trim())
        .filter((s) => s);

      if (!newMainCmd) {
        showToast('请输入主命令', 'error');
        return;
      }

      const newCommand = [newMainCmd, ...newAliases];

      if (isEdit) {
        currentConfig[idx] = newCommand;
      } else {
        currentConfig.push(newCommand);
      }

      saveConfigInternal();
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  async function saveConfig() {
    const btn = document.getElementById('saveQuickCommandBtn');
    setButtonLoading(btn, true);

    try {
      const res = await fetch('/api/quick-command', {
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

  async function saveConfigInternal() {
    try {
      const res = await fetch('/api/quick-command', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(currentConfig),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已保存', 'success');
        refreshList();
      } else {
        showToast(data.error || '保存失败', 'error');
      }
    } catch (e) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  async function deleteCommand(idx) {
    if (!confirm(`确定要删除命令 "${currentConfig[idx]?.[0]}" 吗？`)) return;

    currentConfig.splice(idx, 1);
    await saveConfigInternal();
  }

  function refreshList() {
    const listEl = document.querySelector('.quick-command-list');
    if (listEl) {
      listEl.innerHTML = renderCommandList();
      bindEvents(document.querySelector('.quick-command-wrapper'));
    }
  }

  async function importJson(e) {
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
        await renderForm(document.getElementById('quickCommandContent'));
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
      const res = await fetch('/api/quick-command/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        await loadConfig();
        await renderForm(document.getElementById('quickCommandContent'));
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
