import {
  mxcadExternalRefControllerUploadExtReferenceDwg,
  mxcadExternalRefControllerUploadExtReferenceImage,
  mxcadExternalRefControllerGetPreloadingData,
} from '@/api-sdk';
import { getXrefName } from '../../types/filesystem';
import { FileTreeNode } from './types';
import { findFileInTree } from './fileTree';

/**
 * 获取外部参照文件名列表（带重试等待 preloading.json 生成）
 */
async function fetchXrefNames(
  nodeId: string
): Promise<{ images: string[]; refs: string[] } | null> {
  // preloading.json 由 CAD 转换服务异步生成，批量导入后可能尚未完成，适当延长等待窗口
  const maxRetries = 20;
  const retryDelay = 3000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await mxcadExternalRefControllerGetPreloadingData({
        path: { nodeId },
      });
      const data = result?.data as any;
      if (data) {
        const images = (data.images || [])
          .map((item: any) => getXrefName(item))
          .filter((name: string) => name.trim().length > 0);
        const refs = (data.externalReference || [])
          .map((item: any) => getXrefName(item))
          .filter((name: string) => name.trim().length > 0);
        return { images, refs };
      }
    } catch {
      // preloading.json 尚未生成，等待后重试
    }
    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  return null;
}

/**
 * 静默处理批量导入的外部参照——在 fileTree 中搜索并上传匹配的外部参照文件
 */
export async function processExternalReferences(
  uploadedFiles: Array<{ nodeId: string; fileName: string }>,
  tree: FileTreeNode
): Promise<{ found: number; uploaded: number; ignored: number }> {
  const dwgFiles = uploadedFiles.filter(
    (f) =>
      f.fileName.toLowerCase().endsWith('.dwg') ||
      f.fileName.toLowerCase().endsWith('.dxf')
  );

  let found = 0,
    uploaded = 0,
    ignored = 0;
  const dwgExts = ['.dwg', '.dxf'];
  const imgExts = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.tiff',
    '.tif',
    '.webp',
  ];

  for (const { nodeId } of dwgFiles) {
    const xrefNames = await fetchXrefNames(nodeId);
    if (!xrefNames) continue;

    const allXrefNames = [...xrefNames.images, ...xrefNames.refs];

    for (const xrefName of allXrefNames) {
      // preloading 中文件名可能带相对路径（如 images/logo.png），先精确匹配，再按 basename 回退
      const matchedFile =
        findFileInTree(tree, xrefName) ||
        findFileInTree(tree, xrefName.split(/[\\/]/).pop() || xrefName);

      if (matchedFile) {
        found++;
        try {
          const ext = '.' + (xrefName.toLowerCase().split('.').pop() || '');
          if (dwgExts.includes(ext)) {
            await mxcadExternalRefControllerUploadExtReferenceDwg({
              path: { nodeId },
              body: { file: matchedFile, nodeId, ext_ref_file: xrefName },
            });
          } else if (imgExts.includes(ext)) {
            await mxcadExternalRefControllerUploadExtReferenceImage({
              path: { nodeId },
              body: {
                file: matchedFile,
                nodeId,
                ext_ref_file: xrefName,
                updatePreloading: true,
              },
            });
          }
          uploaded++;
        } catch (err) {
          console.warn(`外部参照上传失败: ${xrefName}`, err);
        }
      } else {
        ignored++;
      }
    }
  }

  return { found, uploaded, ignored };
}
