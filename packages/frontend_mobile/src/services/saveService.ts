import {
  saveControllerSaveMxwebAs,
  libraryControllerSaveDrawingNode,
  libraryControllerSaveBlockNode,
} from '../api-sdk';
import { MxCpp } from 'mxcad';
import { calculateFileHash } from '../utils/hashUtils';
import { uploadFile } from './mobileUploadService';
import { getApiBaseUrl } from '../utils/apiConfig';
import { t } from '@/languages';

export function getMxwebBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const mxcad = MxCpp.App.getCurrentMxCAD();
      if (!mxcad) {
        reject(new Error('CAD engine not initialized'));
        return;
      }
      const fileName = mxcad.getCurrentFileName() || 'drawing.mxweb';
      mxcad.saveFile(fileName, (data: { buffer: ArrayBuffer }) => {
        if (!data || !data.buffer) {
          reject(new Error(t('获取文件数据失败')));
          return;
        }
        const blob = new Blob([data.buffer], { type: 'application/octet-stream' });
        resolve(blob);
      }, false, false);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 保存到现有节点（hash + 分片上传模式）
 * 参考 PC 端 mxcadSave.ts saveMxwebToNode 逻辑
 */
export async function saveToNode(
  nodeId: string,
  blob: Blob,
  commitMessage?: string,
  expectedTimestamp?: string | null,
): Promise<{ path?: string }> {
  const filename = 'drawing.mxweb';
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const hash = await calculateFileHash(file);

  await uploadFile({ file, hash, nodeId, skipDb: true });

  const formData = new FormData();
  formData.append('hash', hash);
  if (commitMessage) formData.append('commitMessage', commitMessage);
  if (expectedTimestamp) formData.append('expectedTimestamp', expectedTimestamp);

  const apiBaseUrl = getApiBaseUrl();
  const baseUrl = (() => {
    try { return new URL(apiBaseUrl).origin; } catch { return ''; }
  })();
  const token = localStorage.getItem('accessToken');
  const response = await fetch(`${baseUrl}/api/v1/mxcad/savemxweb/${nodeId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ message: t('保存失败') }));
    throw new Error((errBody as { message?: string }).message || t('保存失败'));
  }
  const result = await response.json() as { nodeId: string; path?: string };
  return { path: result.path };
}

export async function saveAs(params: {
  blob: Blob;
  targetType: 'personal' | 'project' | 'library';
  targetParentId: string;
  fileName?: string;
  commitMessage?: string;
  projectId?: string;
  libraryType?: 'drawing' | 'block';
  format?: 'dwg' | 'dxf' | 'mxweb';
}): Promise<{ nodeId: string }> {
  const { blob, format, ...rest } = params;
  const file = new File([blob], 'drawing.mxweb', { type: blob.type });
  const result = await saveControllerSaveMxwebAs({
    body: {
      file,
      format: format || 'mxweb',
      ...rest,
    },
  });
  if (result.error) throw result.error;
  const responseData = result.data as unknown as { nodeId: string };
  return responseData;
}

export async function saveLibraryDrawing(
  nodeId: string,
  blob: Blob,
): Promise<{ updatedAt?: string }> {
  const file = new File([blob], 'drawing.mxweb', { type: blob.type });
  const result = await libraryControllerSaveDrawingNode({
    path: { nodeId },
    body: { file },
  });
  if (result.error) throw result.error;
  const data = result.data as unknown as { updatedAt?: string } | undefined;
  return data || {};
}

export async function saveLibraryBlock(
  nodeId: string,
  blob: Blob,
): Promise<{ updatedAt?: string }> {
  const file = new File([blob], 'block.mxweb', { type: blob.type });
  const result = await libraryControllerSaveBlockNode({
    path: { nodeId },
    body: { file },
  });
  if (result.error) throw result.error;
  const data = result.data as unknown as { updatedAt?: string } | undefined;
  return data || {};
}
