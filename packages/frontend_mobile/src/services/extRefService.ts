import {
  mxCadControllerGetPreloadingData,
  mxCadControllerCheckExternalReference,
  mxCadControllerUploadExtReferenceImage,
  mxCadControllerUploadExtReferenceDwg,
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
    const result = await mxCadControllerGetPreloadingData({ path: { nodeId } });
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
    const result = await mxCadControllerCheckExternalReference({
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

export async function uploadExtRefImage(params: {
  file: File;
  srcDwgfileHash: string;
  extRefFile: string;
}): Promise<boolean> {
  try {
    const result = await mxCadControllerUploadExtReferenceImage({
      body: {
        file: params.file,
        hash: params.srcDwgfileHash,
        ext_ref_file: params.extRefFile,
      },
    });
    return !result.error;
  } catch {
    return false;
  }
}

export async function uploadExtRefDwg(params: {
  nodeId: string;
  file: File;
}): Promise<boolean> {
  try {
    const result = await mxCadControllerUploadExtReferenceDwg({
      path: { nodeId: params.nodeId },
      body: { file: params.file, ext_ref_file: '' },
    });
    return !result.error;
  } catch {
    return false;
  }
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

export function resolveExtRefImageUrl(
  fileName: string,
  fileUrl: string | undefined
): string {
  if (!fileUrl) return fileName;
  const match = fileUrl.match(/\/public-file\/access\/([a-f0-9]+)/i);
  if (match) {
    const hash = match[1];
    return `/api/v1/public-file/access/${hash}/${fileName}`;
  }
  return fileName;
}
