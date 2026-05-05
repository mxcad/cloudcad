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
 * mxcadCheck — 文件去重检查模块
 *
 * 提供文件唯一性检查和重复文件确认 UI。
 */

import { mxCadControllerCheckDuplicateFile } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import type { DuplicateCheckResult } from './mxcadTypes';

export type { DuplicateCheckResult } from './mxcadTypes';

/**
 * 检查目标目录中是否存在重复文件
 * @param fileHash 文件哈希值
 * @param filename 文件名
 * @param nodeId 目标节点 ID
 * @returns 去重检查结果
 */
export async function checkDuplicateFile(
  fileHash: string,
  filename: string,
  nodeId: string
): Promise<DuplicateCheckResult> {
  try {
    const duplicateCheck = await mxCadControllerCheckDuplicateFile({
      body: { fileHash, filename, nodeId },
    });

    return {
      isDuplicate: !!duplicateCheck.data?.isDuplicate,
      existingNodeId: duplicateCheck.data?.existingNodeId ?? null,
    };
  } catch (error) {
    handleError(error, 'mxcadCheck: checkDuplicateFile');
    return { isDuplicate: false, existingNodeId: null };
  }
}

/**
 * 显示重复文件确认弹框
 * @param filename 文件名
 * @returns Promise<'open' | 'upload' | null> 用户选择：打开已有文件、继续上传、或取消
 */
export function showDuplicateFileDialog(
  filename: string
): Promise<'open' | 'upload' | null> {
  return new Promise((resolve) => {
    const dialogId = 'mxcad-duplicate-file-dialog';
    const existingDialog = document.getElementById(dialogId);

    if (existingDialog) {
      document.body.removeChild(existingDialog);
    }

    const dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    dialog.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        width: 90%;
        max-width: 450px;
        overflow: hidden;
      ">
        <div style="
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">发现相同文件</h3>
          <button id="mxcad-duplicate-dialog-close" style="
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            color: #9ca3af;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div style="padding: 20px;">
          <div style="
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 16px;
          ">
            <div style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: #fef3c7;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            </div>
            <div>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #374151;">
                当前目录中已存在相同的文件：
              </p>
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1f2937; word-break: break-all;">
                ${filename}
              </p>
            </div>
          </div>
          <p style="margin: 0; font-size: 13px; color: #6b7280;">
            您可以选择直接打开已存在的文件，或上传新文件。
          </p>
        </div>
        <div style="
          padding: 16px 20px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        ">
          <button id="mxcad-duplicate-dialog-cancel" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: #6b7280;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          ">
            取消
          </button>
          <button id="mxcad-duplicate-dialog-upload" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: #6b7280;
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          ">
            上传新文件
          </button>
          <button id="mxcad-duplicate-dialog-open" style="
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: #4f46e5;
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          ">
            打开已有文件
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const closeBtn = dialog.querySelector('#mxcad-duplicate-dialog-close');
    const cancelBtn = dialog.querySelector('#mxcad-duplicate-dialog-cancel');
    const uploadBtn = dialog.querySelector('#mxcad-duplicate-dialog-upload');
    const openBtn = dialog.querySelector('#mxcad-duplicate-dialog-open');

    const cleanup = () => {
      document.body.removeChild(dialog);
    };

    closeBtn?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    cancelBtn?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    uploadBtn?.addEventListener('click', () => {
      cleanup();
      resolve('upload');
    });

    openBtn?.addEventListener('click', () => {
      cleanup();
      resolve('open');
    });

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        cleanup();
        resolve(null);
      }
    });
  });
}
