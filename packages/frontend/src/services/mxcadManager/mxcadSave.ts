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

import { saveControllerSaveMxwebToNode } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { escapeHtml } from '@/utils/sanitize';
import type { SaveMxwebParams } from './mxcadTypes';

export type { SaveMxwebParams } from './mxcadTypes';

/**
 * 将 mxweb Blob 保存到指定节点
 * @param params 保存参数
 */
export async function saveMxwebToNode(params: SaveMxwebParams): Promise<void> {
  try {
    const filename = params.filename || 'drawing.mxweb';
    await saveControllerSaveMxwebToNode({
      path: { nodeId: params.nodeId },
      body: {
        file: new File([params.blob], filename, { type: params.blob.type }),
        ...(params.commitMessage ? { commitMessage: params.commitMessage } : {}),
        ...(params.expectedTimestamp ? { expectedTimestamp: params.expectedTimestamp } : {}),
      },
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
    const isDark = escapeHtml(currentTheme) === 'dark';

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
      z-index: 100000; /* Z_LAYERS.TOAST - save confirm dialog */
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
          ">
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
          "></textarea>
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
          ">
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
          ">
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
