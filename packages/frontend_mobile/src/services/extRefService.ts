import {
  mxcadExternalRefControllerGetPreloadingData,
  mxcadExternalRefControllerCheckExternalReference,
  mxcadExternalRefControllerUploadExtReferenceImage,
  mxcadExternalRefControllerUploadExtReferenceDwg,
} from '../api-sdk';

export interface ExtRefFile {
  name: string;
  type: 'img' | 'ref';
  hash: string;
  url?: string;
}

export interface PreloadingData {
  hash: string;
  images: string[];
  externalReference: string[];
  tz?: boolean;
}

export async function getPreloadingData(
  nodeId: string
): Promise<PreloadingData | null> {
  try {
    const result = await mxcadExternalRefControllerGetPreloadingData({ path: { nodeId } });
    if (result.error) return null;
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
    if (result.error) return [];
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
}): Promise<void> {
  const result = await mxcadExternalRefControllerUploadExtReferenceImage({
    path: { nodeId: params.nodeId },
    body: {
      file: params.file,
      hash: params.srcDwgfileHash,
      ext_ref_file: params.extRefFile,
    },
  });
  if (result.error) throw result.error;
}

/** 上传外部参照 dwg。失败即抛，契约同 uploadExtRefImage。 */
export async function uploadExtRefDwg(params: {
  nodeId: string;
  file: File;
}): Promise<void> {
  const result = await mxcadExternalRefControllerUploadExtReferenceDwg({
    path: { nodeId: params.nodeId },
    body: { file: params.file, ext_ref_file: '' },
  });
  if (result.error) throw result.error;
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
