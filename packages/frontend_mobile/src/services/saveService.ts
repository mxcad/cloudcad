import {
  saveControllerSaveMxwebToNode,
  saveControllerSaveMxwebAs,
  libraryControllerSaveDrawingNode,
  libraryControllerSaveBlockNode,
} from '../api-sdk';
import { MxCpp } from 'mxcad';

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
          reject(new Error('获取文件数据失败'));
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

export async function saveToNode(nodeId: string, blob: Blob, commitMessage?: string): Promise<void> {
  const file = new File([blob], 'drawing.mxweb', { type: blob.type });
  const result = await saveControllerSaveMxwebToNode({
    path: { nodeId },
    body: {
      file,
      commitMessage: commitMessage || undefined,
    },
  });
  if (result.error) throw result.error;
}

export async function saveAs(params: {
  blob: Blob;
  targetType: 'personal' | 'project' | 'library';
  targetParentId: string;
  fileName?: string;
  commitMessage?: string;
  projectId?: string;
  libraryType?: 'drawing' | 'block';
}): Promise<{ nodeId: string }> {
  const { blob, ...rest } = params;
  const file = new File([blob], 'drawing.mxweb', { type: blob.type });
  const result = await saveControllerSaveMxwebAs({
    body: {
      file,
      format: 'mxweb',
      ...rest,
    },
  });
  if (result.error) throw result.error;
  const responseData = result.data as unknown as { nodeId: string };
  return responseData;
}

export async function saveLibraryDrawing(nodeId: string, blob: Blob): Promise<void> {
  const file = new File([blob], 'drawing.mxweb', { type: blob.type });
  const result = await libraryControllerSaveDrawingNode({
    path: { nodeId },
    body: { file },
  });
  if (result.error) throw result.error;
}

export async function saveLibraryBlock(nodeId: string, blob: Blob): Promise<void> {
  const file = new File([blob], 'block.mxweb', { type: blob.type });
  const result = await libraryControllerSaveBlockNode({
    path: { nodeId },
    body: { file },
  });
  if (result.error) throw result.error;
}
