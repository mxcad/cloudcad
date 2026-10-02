/**
 * 外部参照管理服务层（E-26）：列出全部参照（含已存在与缺失）+ 查看/下载/替换。
 *
 * 双场景统一出口：
 * - 公开场景（未登录/分享）：publicFileController* 端点，identifier = fileHash。
 * - 节点场景（已登录）：mxcadExternalRefController* / mxcadFileAccessController* 端点，identifier = nodeId。
 *
 * 对照 PC packages/frontend/src/hooks/useExternalReferenceUpload.ts +
 * pages/CADEditorDirect.tsx 的 handleViewXref/handleDownloadXref。
 * 所有函数失败即抛（SDK error），由调用方（面板）提示具体原因。
 */
import {
  publicFileControllerCheckExtReference,
  publicFileControllerUploadExtReference,
  publicFileControllerAccessFile,
  mxcadExternalRefControllerCheckExternalReference,
  mxcadExternalRefControllerUploadExtReferenceImage,
  mxcadExternalRefControllerUploadExtReferenceDwg,
  mxcadFileAccessControllerGetFileDownloadExternalRef,
  mxcadFileAccessControllerViewExternalRef,
} from '../api-sdk';
import { cachedApiUrl } from '../utils/apiConfig';
import { publicFileAccessPath } from '../utils/mxwebUrl';
import { triggerBlobDownload } from '../utils/download';
import { sanitizeFileName } from '../utils/sanitizeFileName';
import {
  parseExtRefFileNames,
  getPreloadingData,
  checkExternalReferences,
  uploadExtRefImage,
  uploadExtRefDwg,
} from './extRefService';
import { getPublicPreloadingData } from './publicFileService';

export type ExtRefType = 'img' | 'ref';
export type ExtRefUploadState = 'notSelected' | 'uploading' | 'success' | 'fail';

export interface ExtRefItem {
  name: string;
  type: ExtRefType;
  /** 文件是否已就位（已上传/已存在） */
  exists: boolean;
  uploadState: ExtRefUploadState;
  /** 上传进度 0-100 */
  progress: number;
  /** 替换时选中的本地文件 */
  source?: File;
}

export interface ExtRefContext {
  /** 公开场景 = fileHash；节点场景 = nodeId */
  identifier: string;
  isPublic: boolean;
}

function toItem(name: string, type: ExtRefType, exists: boolean): ExtRefItem {
  return {
    name,
    type,
    exists,
    uploadState: exists ? 'success' : 'notSelected',
    progress: exists ? 100 : 0,
  };
}

/**
 * 取全部外部参照（含已存在与缺失），逐项标注 exists。
 *
 * @param options.retry 公开场景下 preloading 数据可能尚未生成（转换中），
 *   传 true 时按 10×2s 重试等待（自动打开流程用）；手动刷新传 false 立即反馈。
 */
export async function fetchExtRefList(
  ctx: ExtRefContext,
  options?: { retry?: boolean }
): Promise<ExtRefItem[]> {
  if (ctx.isPublic) {
    let data = await getPublicPreloadingData(ctx.identifier);
    if (!data && options?.retry) {
      for (let i = 0; i < 9; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        data = await getPublicPreloadingData(ctx.identifier);
        if (data) break;
      }
    }
    if (!data) return [];
    const refs = parseExtRefFileNames([
      ...(data.images || []).filter(
        (img: string) => !img.startsWith('http://') && !img.startsWith('https://')
      ),
      ...(data.externalReference || []),
    ]);
    const items: ExtRefItem[] = [];
    for (const ref of refs) {
      const exists = await checkPublicExtReference(ctx.identifier, ref.name);
      items.push(toItem(ref.name, ref.type, exists));
    }
    return items;
  }

  const data = await getPreloadingData(ctx.identifier);
  if (!data) return [];
  const refs = parseExtRefFileNames([
    ...(data.images || []).filter(
      (img: string) => !img.startsWith('http://') && !img.startsWith('https://')
    ),
    ...(data.externalReference || []),
  ]);
  const missing = await checkExternalReferences(ctx.identifier);
  const missingSet = new Set(missing.map((m) => m.name));
  return refs.map((ref) => toItem(ref.name, ref.type, !missingSet.has(ref.name)));
}

/**
 * 查公开外部参照是否已就位。
 * 契约：查询失败保守视为「存在」（fail-open），避免已存在参照被误标缺失导致重复覆盖上传。
 */
async function checkPublicExtReference(
  srcHash: string,
  fileName: string
): Promise<boolean> {
  try {
    const result = await publicFileControllerCheckExtReference({
      query: { srcHash, fileName },
    });
    if (result.error) return true;
    const data = result.data as unknown as { exists?: boolean };
    return data?.exists ?? false;
  } catch {
    return true;
  }
}

/** 查看图片的可预览 URL。公开 = 直连（带缓存打散）；节点 = 鉴权 blob URL。 */
export async function getExtRefImageUrl(
  ctx: ExtRefContext,
  name: string
): Promise<string> {
  if (ctx.isPublic) {
    return cachedApiUrl(
      publicFileAccessPath(
        `${encodeURIComponent(ctx.identifier)}/${encodeURIComponent(name)}`
      )
    );
  }
  const result = await mxcadFileAccessControllerViewExternalRef({
    path: { nodeId: ctx.identifier, fileName: name },
  });
  if (result.error) throw result.error;
  return URL.createObjectURL(result.data as Blob);
}

/** 查看图纸的 mxweb 访问 URL（供 openMxWeb 就地打开，替换当前图纸）。 */
export function getExtRefDrawingUrl(ctx: ExtRefContext, name: string): string {
  if (ctx.isPublic) {
    return cachedApiUrl(
      publicFileAccessPath(
        `${encodeURIComponent(ctx.identifier)}/${encodeURIComponent(name)}.mxweb`
      )
    );
  }
  return cachedApiUrl(
    `/mxcad/external-ref-view/${encodeURIComponent(ctx.identifier)}/${encodeURIComponent(name)}`
  );
}

/** 下载外部参照。失败抛错（SDK error），由调用方提示。 */
export async function downloadExtRef(
  ctx: ExtRefContext,
  file: ExtRefItem
): Promise<void> {
  if (ctx.isPublic) {
    const result = await publicFileControllerAccessFile({
      path: { hash: ctx.identifier, filename: file.name },
    });
    if (result.error) throw result.error;
    triggerBlobDownload(result.data as Blob, file.name);
    return;
  }
  const result = await mxcadFileAccessControllerGetFileDownloadExternalRef({
    path: { nodeId: ctx.identifier, fileName: file.name },
  });
  if (result.error) throw result.error;
  triggerBlobDownload(result.data as Blob, file.name);
}

/** 替换/上传外部参照。失败抛错，由调用方提示。onProgress 回传 0-100 进度。 */
export async function replaceExtRef(
  ctx: ExtRefContext,
  file: ExtRefItem,
  newFile: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  if (ctx.isPublic) {
    await uploadPublicExtRef(ctx.identifier, file.name, newFile, onProgress);
    return;
  }
  if (file.type === 'img') {
    const preload = await getPreloadingData(ctx.identifier);
    await uploadExtRefImage({
      nodeId: ctx.identifier,
      file: newFile,
      srcDwgfileHash: preload?.hash || ctx.identifier,
      extRefFile: file.name,
    });
  } else {
    await uploadExtRefDwg({ nodeId: ctx.identifier, file: newFile });
  }
  onProgress?.(100);
}

/** 公开场景分片上传（1MB/片），对齐 ExternalRefUploadPopup 既有逻辑。 */
async function uploadPublicExtRef(
  hash: string,
  name: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  const safeName = sanitizeFileName(name);
  const chunkSize = 1 * 1024 * 1024;
  if (file.size <= chunkSize) {
    const result = await publicFileControllerUploadExtReference({
      body: { file, srcFileHash: hash, extRefFile: safeName } as never,
    });
    if (result.error) throw result.error;
    onProgress?.(100);
    return;
  }
  const totalChunks = Math.ceil(file.size / chunkSize);
  let uploadedBytes = 0;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    const result = await publicFileControllerUploadExtReference({
      body: {
        file: chunk,
        srcFileHash: hash,
        extRefFile: safeName,
        chunk: i,
        chunks: totalChunks,
      } as never,
    });
    if (result.error) throw result.error;
    uploadedBytes += chunk.size;
    onProgress?.(Math.min(99, Math.round((uploadedBytes / file.size) * 100)));
  }
  onProgress?.(100);
}
