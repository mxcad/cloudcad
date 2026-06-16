import {
  mxCadControllerCheckFileExist,
} from '../api-sdk';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingNodeId: string | null;
}

export async function checkDuplicateFile(
  fileHash: string,
  filename: string,
  fileSize: number,
  nodeId?: string,
): Promise<DuplicateCheckResult> {
  try {
    const result = await mxCadControllerCheckFileExist({
      body: {
        fileSize,
        fileHash,
        filename,
        nodeId: nodeId || '',
      },
    });
    const data = result.data as unknown as { exists: boolean; nodeId?: string } | undefined;
    if (data?.exists) {
      return { isDuplicate: true, existingNodeId: data.nodeId || null };
    }
    return { isDuplicate: false, existingNodeId: null };
  } catch {
    return { isDuplicate: false, existingNodeId: null };
  }
}
