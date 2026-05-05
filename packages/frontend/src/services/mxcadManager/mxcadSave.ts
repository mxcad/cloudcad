///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * mxcadSave — 保存模块
 *
 * 提供 mxweb 文件保存到节点的核心逻辑和保存确认 UI。
 */

import { mxCadControllerSaveMxwebToNode } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import type { SaveMxwebParams } from './mxcadTypes';

export type { SaveMxwebParams } from './mxcadTypes';

/**
 * 创建保存用的 FormData
 * @param blob 文件 Blob
 * @param nodeId 目标节点 ID
 * @param filename 文件名
 * @returns 构造好的 FormData
 */
export function createSaveFormData(
  blob: Blob,
  nodeId: string,
  filename: string
): FormData {
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('nodeId', nodeId);
  formData.append('hash', `${Date.now()}_${Math.random().toString(36).substring(7)}`);
  formData.append('name', filename);
  formData.append('size', String(blob.size));
  formData.append('chunk', '0');
  formData.append('chunks', '1');
  return formData;
}

/**
 * 将 mxweb Blob 保存到指定节点
 * @param params 保存参数
 */
export async function saveMxwebToNode(params: SaveMxwebParams): Promise<void> {
  try {
    const formData = createSaveFormData(params.blob, params.nodeId, params.filename);

    if (params.commitMessage) {
      formData.append('commitMessage', params.commitMessage);
    }

    if (params.expectedTimestamp) {
      formData.append('expectedTimestamp', params.expectedTimestamp);
    }

    await mxCadControllerSaveMxwebToNode({
      path: { nodeId: params.nodeId },
      body: formData,
    });
  } catch (error) {
    handleError(error, 'mxcadSave: saveMxwebToNode');
    throw error;
  }
}

/**
 * 显示保存确认弹框，获取用户输入的提交信息
 * @returns Promise<string | null> 用户输入的提交信息，取消返回 null
 */
export function showSaveConfirmDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    const dialogId = 'mxcad-save-confirm-dialog';
    const existingDialog = document.getElementById(dialogId);

    if (existingDialog) {
      document.body.removeChild(existingDialog);
    }

    // 获取当前主题
    const currentTheme =
      document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = currentTheme === 'dark';

    const dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--bg-overlay, ${isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(15, 23, 42, 0.5)'});
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    dialog.innerHTML = `
      <div style="
        background: var(--bg-elevated, ${isDark ? '#2a2f35' : '#ffffff'});
        border: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
        border-radius: 12px;
        box-shadow: var(--shadow-lg, 0 10px 15px ${isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)'});
        width: 90%;
        max-width: 450px;
        overflow: hidden;
      ">
        <div style="
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--text-primary, ${isDark ? '#f0f4f8' : '#0f172a'});">保存文件</h3>
          <button id="mxcad-save-dialog-close" style="
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            color: var(--text-muted, ${isDark ? '#5a6a7a' : '#94a3b8'});
            transition: color 0.2s ease;
          " onmouseover="this.style.color='var(--text-secondary, ${isDark ? '#b8c5d1' : '#334155'})'" onmouseout="this.style.color='var(--text-muted, ${isDark ? '#5a6a7a' : '#94a3b8'})'">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div style="padding: 20px;">
          <label style="
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: var(--text-secondary, ${isDark ? '#b8c5d1' : '#334155'});
            margin-bottom: 8px;
          ">
            修改说明（可选）
          </label>
          <textarea id="mxcad-save-dialog-input" placeholder="请输入本次修改的内容说明..." style="
            width: 100%;
            height: 100px;
            padding: 12px;
            background: var(--bg-secondary, ${isDark ? '#1a1d21' : '#ffffff'});
            border: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
            border-radius: 8px;
            font-size: 14px;
            color: var(--text-primary, ${isDark ? '#f0f4f8' : '#0f172a'});
            resize: vertical;
            box-sizing: border-box;
            font-family: inherit;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
          " onfocus="this.style.borderColor='var(--primary-500, ${isDark ? '#818cf8' : '#6366f1'})'; this.style.boxShadow='0 0 0 3px rgba(99, 102, 241, 0.2)'" onblur="this.style.borderColor='var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'})'; this.style.boxShadow='none'"></textarea>
          <p style="
            margin: 8px 0 0 0;
            font-size: 12px;
            color: var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'});
          ">
            此说明将记录在版本历史中，方便后续查看修改内容。
          </p>
        </div>
        <div style="
          padding: 16px 20px;
          background: var(--bg-secondary, ${isDark ? '#1a1d21' : '#f8fafc'});
          border-top: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        ">
          <button id="mxcad-save-dialog-cancel" style="
            padding: 10px 20px;
            border: 1px solid var(--border-default, ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'});
            border-radius: 8px;
            background: transparent;
            color: var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'});
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='var(--bg-tertiary, ${isDark ? '#22262b' : '#f1f5f9'})'; this.style.color='var(--text-secondary, ${isDark ? '#b8c5d1' : '#334155'})'" onmouseout="this.style.background='transparent'; this.style.color='var(--text-tertiary, ${isDark ? '#7a8a99' : '#64748b'})'">
            取消
          </button>
          <button id="mxcad-save-dialog-confirm" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, var(--primary-600, ${isDark ? '#a5b4fc' : '#4f46e5'}), var(--primary-500, ${isDark ? '#818cf8' : '#6366f1'}));
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: var(--shadow-sm, 0 1px 2px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'});
          " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='var(--shadow-md, 0 4px 6px ${isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.1)'})${isDark ? ', 0 0 20px rgba(99, 102, 241, 0.3)' : ''}'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-sm, 0 1px 2px ${isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'})'">
            保存
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const inputEl = dialog.querySelector(
      '#mxcad-save-dialog-input'
    ) as HTMLTextAreaElement;
    const closeBtn = dialog.querySelector('#mxcad-save-dialog-close');
    const cancelBtn = dialog.querySelector('#mxcad-save-dialog-cancel');
    const confirmBtn = dialog.querySelector('#mxcad-save-dialog-confirm');

    const cleanup = () => {
      if (dialog && dialog.parentNode) {
        dialog.parentNode.removeChild(dialog);
      }
    };

    const handleConfirm = () => {
      const message = inputEl.value.trim();
      cleanup();
      resolve(message || '');
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    closeBtn?.addEventListener('click', handleCancel);
    cancelBtn?.addEventListener('click', handleCancel);
    confirmBtn?.addEventListener('click', handleConfirm);

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        handleCancel();
      }
    });

    // ESC 键关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeyDown);
        handleCancel();
      }
      if (e.key === 'Enter' && e.ctrlKey) {
        document.removeEventListener('keydown', handleKeyDown);
        handleConfirm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // 自动聚焦输入框
    setTimeout(() => inputEl.focus(), 100);
  });
}
