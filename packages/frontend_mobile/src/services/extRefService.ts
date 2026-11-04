import {
  mxcadExternalRefControllerGetPreloadingData,
  mxcadExternalRefControllerCheckExternalReference,
  mxcadExternalRefControllerUploadExtReferenceImage,
  mxcadExternalRefControllerUploadExtReferenceDwg,
} from '../api-sdk';
import { unwrap } from '../utils/apiError';

export interface ExtRefFile {
  name: string;
  type: 'img' | 'ref';
  hash: string;
  url?: string;
}

export interface PreloadingData {
  hash: string;
  /** 与 SDK PreloadingDataDto 一致：PreloadingFileInfoDto[] 对象数组 */
  images: Array<{ name: string; size: number; type: string }>;
  externalReference: Array<{ name: string; size: number; type: string }>;
  tz?: boolean;
}

export async function getPreloadingData(
  nodeId: string
): Promise<PreloadingData | null> {
  try {
    const result = await mxcadExternalRefControllerGetPreloadingData({ path: { nodeId } });
    unwrap(result);
    return result.data as unknown as PreloadingData;
  } catch {
    return null;
  }
}

export async function checkExternalReferences(
  nodeId: string
): Promise<ExtRefFile[]> {
  try {
    const result = await mxcadExternalRefControllerCheckExternalReference({
      path: { nodeId },
      body: { fileName: '' },
    });
    unwrap(result);
    const data = result.data as unknown as { files: ExtRefFile[] };
    return data?.files || [];
  } catch {
    return [];
  }
}

/**
 * 上传外部参照图片。
 *
 * 失败即抛（SDK error 或请求异常），不返回 boolean 谎言——调用方据此区分
 * 「上传成功」与「上传失败」，避免对用户报假成功。
 */
export async function uploadExtRefImage(params: {
  nodeId: string;
  file: File;
  srcDwgfileHash: string;
  extRefFile: string;
  /** 对齐 PC useExternalReferenceUpload：上传后写回 mxweb_preloading.json（默认 false） */
  updatePreloading?: boolean;
  /** 替换模式：被替换的原始参照名（文件名不变仅内容替换） */
  originalXrefName?: string;
}): Promise<void> {
  const result = await mxcadExternalRefControllerUploadExtReferenceImage({
    path: { nodeId: params.nodeId },
    body: {
      file: params.file,
      hash: params.srcDwgfileHash,
      ext_ref_file: params.extRefFile,
      updatePreloading: params.updatePreloading,
      originalXrefName: params.originalXrefName,
    },
  });
  unwrap(result);
}

/** 上传外部参照 dwg。失败即抛，契约同 uploadExtRefImage。 */
export async function uploadExtRefDwg(params: {
  nodeId: string;
  file: File;
  /** 外部参照文件名（含扩展名）。后端 @IsNotEmpty 必填，空串会被 400 拒 */
  extRefFile: string;
  /** 替换模式：被替换的原始参照名（文件名不变仅内容替换） */
  originalXrefName?: string;
}): Promise<void> {
  const result = await mxcadExternalRefControllerUploadExtReferenceDwg({
    path: { nodeId: params.nodeId },
    body: {
      file: params.file,
      ext_ref_file: params.extRefFile,
      originalXrefName: params.originalXrefName,
    },
  });
  unwrap(result);
}

export function parseExtRefFileNames(
  refs: string[]
): { name: string; type: 'img' | 'ref' }[] {
  const seen = new Set<string>();
  const result: { name: string; type: 'img' | 'ref' }[] = [];
  for (const ref of refs) {
    const parts = ref.replace(/\\/g, '/').split('/');
    const name = parts[parts.length - 1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const lower = name.toLowerCase();
    const type =
      lower.endsWith('.dwg') || lower.endsWith('.dxf') ? 'ref' : 'img';
    result.push({ name, type });
  }
  return result;
}
