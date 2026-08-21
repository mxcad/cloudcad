import type { PreloadingDataResult, WritePreloadingData } from '../ext-ref-preloading.service';
import type { FileSystemNodeContext } from '../../node/filesystem-node.service';
import type { MxCadRequest } from '../../types/request.types';
import type { PreloadingDataDto } from '../../dto/preloading-data.dto';
import type { ExternalReferenceStats } from '../../types/external-reference.types';
import type { UploadExtReferenceFileDto } from '../../dto/upload-ext-reference-file.dto';
export type { WritePreloadingData } from '../ext-ref-preloading.service';

export const I_EXTERNAL_REF_FACADE = 'IExternalRefFacade';

export interface IExternalRefFacade {
  handleExternalReferenceFile(
    extRefHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string,
  ): Promise<void>;

  handleExternalReferenceImage(
    fileHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string,
    context: FileSystemNodeContext,
  ): Promise<void>;

  updateAfterUpload(nodeId: string): Promise<void>;

  getExternalRefDownloadPath(nodeId: string, fileName: string): Promise<string | null>;

  readPreloadingData(nodeId: string): Promise<PreloadingDataResult | null>;

  writePreloading(nodeId: string, data: WritePreloadingData): Promise<boolean>;

  validateTokenAndGetUserId(request: MxCadRequest): Promise<string>;

  checkFileAccessPermission(nodeId: string, userId: string, checkUserId: string): Promise<boolean>;

  getPreloadingData(nodeId: string): Promise<PreloadingDataDto | null>;

  checkExists(nodeId: string, fileName: string): Promise<boolean>;

  getStats(nodeId: string): Promise<ExternalReferenceStats>;

  updateInfo(nodeId: string, stats: ExternalReferenceStats): Promise<void>;

  updatePreloadingAfterUpload(nodeId: string, extRefFileName: string, originalXrefName?: string): Promise<void>;

  validateExtReferenceUpload(
    file: Express.Multer.File | null,
    body: UploadExtReferenceFileDto,
    allowedExtensions: string[] | null,
    skipPreloadingCheck?: boolean,
    allowedMimePrefix?: string | null,
  ): Promise<{ success: boolean; error?: { code: number; message: string }; preloadingData?: unknown }>;

  computeUploadedFileHash(filePath: string, originalname: string): { hash: string; path: string };

  getPreloadingCache(nodeId: string): PreloadingDataDto | null;

  setPreloadingCache(nodeId: string, data: PreloadingDataDto): void;

  invalidatePreloadingCache(nodeId: string): void;

  cleanExpiredCache(): void;
}
