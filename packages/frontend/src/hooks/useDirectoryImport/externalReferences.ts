import {
  mxcadExternalRefControllerUploadExtReferenceDwg,
  mxcadExternalRefControllerUploadExtReferenceImage,
  mxcadExternalRefControllerGetPreloadingData,
} from '@/api-sdk';
import { getXrefName } from '../../types/filesystem';
import { FileTreeNode, ExtRefSummary } from './types';
import { findFileInTree } from './fileTree';

/** preloading 轮询总预算：批量导入时转换排队慢，短窗口会把「还没转完」误判为「无参照」 */
const PRELOADING_TOTAL_BUDGET_MS = 180_000;
const PRELOADING_MAX_DELAY_MS = 15_000;

/**
 * 获取外部参照文件名列表（指数退避轮询等待 preloading.json 生成）
 * 2s 起、单次上限 15s、总预算 3 分钟
 */
async function fetchXrefNames(
  nodeId: string
): Promise<{ images: string[]; refs: string[] } | null> {
  let delayMs = 2_000;
  let elapsedMs = 0;

  while (elapsedMs < PRELOADING_TOTAL_BUDGET_MS) {
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
      // preloading.json 尚未生成或接口抖动，等待后重试
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    elapsedMs += delayMs;
    delayMs = Math.min(delayMs * 1.5, PRELOADING_MAX_DELAY_MS);
  }
  return null;
}

/**
 * 静默处理批量导入的外部参照——在 fileTree 中搜索并上传匹配的外部参照文件。
 *
 * 失败语义：后端失败时返回 HTTP 200 + { code: -1, message }，必须显式检查 code，
 * 否则失败会被当成功计数（历史上参照丢失且无任何反馈的根因之一）。
 * 通过 onSummary 分阶段上报汇总，供导入结果页/Toast 展示。
 */
export async function processExternalReferences(
  uploadedFiles: Array<{ nodeId: string; fileName: string }>,
  tree: FileTreeNode,
  onSummary?: (summary: ExtRefSummary) => void
): Promise<ExtRefSummary> {
  const summary: ExtRefSummary = {
    status: 'processing',
    matched: 0,
    uploaded: 0,
    failed: 0,
    missing: 0,
  };
  onSummary?.({ ...summary });

  const dwgFiles = uploadedFiles.filter(
    (f) =>
      f.fileName.toLowerCase().endsWith('.dwg') ||
      f.fileName.toLowerCase().endsWith('.dxf')
  );

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

      if (!matchedFile) {
        summary.missing++;
        onSummary?.({ ...summary });
        continue;
      }

      summary.matched++;

      try {
        const ext = '.' + (xrefName.toLowerCase().split('.').pop() || '');
        let responseCode: number | undefined;

        if (dwgExts.includes(ext)) {
          const result = await mxcadExternalRefControllerUploadExtReferenceDwg({
            path: { nodeId },
            body: { file: matchedFile, nodeId, ext_ref_file: xrefName },
          });
          responseCode = (result?.data as { code?: number } | undefined)?.code;
        } else if (imgExts.includes(ext)) {
          const result =
            await mxcadExternalRefControllerUploadExtReferenceImage({
              path: { nodeId },
              body: {
                file: matchedFile,
                nodeId,
                ext_ref_file: xrefName,
                updatePreloading: true,
              },
            });
          responseCode = (result?.data as { code?: number } | undefined)?.code;
        } else {
          // 非参照支持的扩展名：不计数也不上传
          continue;
        }

        if (responseCode === 0) {
          summary.uploaded++;
        } else {
          summary.failed++;
        }
      } catch {
        summary.failed++;
      }
      onSummary?.({ ...summary });
    }
  }

  summary.status = 'done';
  onSummary?.({ ...summary });
  return summary;
}
