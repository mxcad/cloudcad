import {
  mxCadControllerCheckFileExist,
} from '../api-sdk';
import { sanitizeFileName } from '../utils/sanitizeFileName';

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
    const safeName = sanitizeFileName(filename);
    const result = await mxCadControllerCheckFileExist({
      body: {
        fileSize,
        fileHash,
        filename: safeName,
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
