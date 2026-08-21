import { Injectable } from '@nestjs/common';
import { ExternalRefService } from './external-ref.service';
import { ExternalReferenceUpdateService } from './external-reference-update.service';
import { ExtRefPreloadingService, PreloadingDataResult, WritePreloadingData } from './ext-ref-preloading.service';
import { ExtRefValidatorService } from './ext-ref-validator.service';
import { IExternalRefFacade } from './interfaces/ext-ref-facade.interface';
import { FileSystemNodeContext } from '../node/filesystem-node.service';
import type { MxCadRequest } from '../types/request.types';
import type { PreloadingDataDto } from '../dto/preloading-data.dto';
import type { ExternalReferenceStats } from '../types/external-reference.types';
import type { UploadExtReferenceFileDto } from '../dto/upload-ext-reference-file.dto';

@Injectable()
export class ExternalRefFacadeService implements IExternalRefFacade {
  constructor(
    private readonly externalRefService: ExternalRefService,
    private readonly externalReferenceUpdateService: ExternalReferenceUpdateService,
    private readonly extRefPreloadingService: ExtRefPreloadingService,
    private readonly extRefValidatorService: ExtRefValidatorService,
  ) {}

  async handleExternalReferenceFile(
    extRefHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string,
  ): Promise<void> {
    return this.externalRefService.handleExternalReferenceFile(extRefHash, srcDwgNodeId, extRefFileName, srcFilePath);
  }

  async handleExternalReferenceImage(
    fileHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string,
    context: FileSystemNodeContext,
  ): Promise<void> {
    return this.externalRefService.handleExternalReferenceImage(fileHash, srcDwgNodeId, extRefFileName, srcFilePath, context);
  }

  async updateAfterUpload(nodeId: string): Promise<void> {
    return this.externalReferenceUpdateService.updateAfterUpload(nodeId);
  }

  async getExternalRefDownloadPath(nodeId: string, fileName: string): Promise<string | null> {
    return this.externalReferenceUpdateService.getExternalRefDownloadPath(nodeId, fileName);
  }

  async readPreloadingData(nodeId: string): Promise<PreloadingDataResult | null> {
    return this.extRefPreloadingService.readPreloadingData(nodeId);
  }

  async writePreloading(nodeId: string, data: WritePreloadingData): Promise<boolean> {
    return this.extRefPreloadingService.writePreloading(nodeId, data);
  }

  async validateTokenAndGetUserId(request: MxCadRequest): Promise<string> {
    return this.extRefValidatorService.validateTokenAndGetUserId(request);
  }

  async checkFileAccessPermission(nodeId: string, userId: string, checkUserId: string): Promise<boolean> {
    return this.extRefValidatorService.checkFileAccessPermission(nodeId, userId, checkUserId);
  }

  async getPreloadingData(nodeId: string): Promise<PreloadingDataDto | null> {
    return this.externalReferenceUpdateService.getPreloadingData(nodeId);
  }

  async checkExists(nodeId: string, fileName: string): Promise<boolean> {
    return this.externalReferenceUpdateService.checkExists(nodeId, fileName);
  }

  async getStats(nodeId: string): Promise<ExternalReferenceStats> {
    return this.externalReferenceUpdateService.getStats(nodeId);
  }

  async updateInfo(nodeId: string, stats: ExternalReferenceStats): Promise<void> {
    return this.externalReferenceUpdateService.updateInfo(nodeId, stats);
  }

  async updatePreloadingAfterUpload(nodeId: string, extRefFileName: string, originalXrefName?: string): Promise<void> {
    return this.externalReferenceUpdateService.updatePreloadingAfterUpload(nodeId, extRefFileName, originalXrefName);
  }

  async validateExtReferenceUpload(
    file: Express.Multer.File | null,
    body: UploadExtReferenceFileDto,
    allowedExtensions: string[] | null,
    skipPreloadingCheck = false,
    allowedMimePrefix: string | null = null,
  ): Promise<{ success: boolean; error?: { code: number; message: string }; preloadingData?: unknown }> {
    return this.extRefValidatorService.validateExtReferenceUpload(file, body, allowedExtensions, skipPreloadingCheck, allowedMimePrefix);
  }

  computeUploadedFileHash(filePath: string, originalname: string): { hash: string; path: string } {
    return this.extRefValidatorService.computeUploadedFileHash(filePath, originalname);
  }

  getPreloadingCache(nodeId: string): PreloadingDataDto | null {
    return this.extRefValidatorService.getPreloadingCache(nodeId);
  }

  setPreloadingCache(nodeId: string, data: PreloadingDataDto): void {
    return this.extRefValidatorService.setPreloadingCache(nodeId, data);
  }

  invalidatePreloadingCache(nodeId: string): void {
    return this.extRefValidatorService.invalidatePreloadingCache(nodeId);
  }

  cleanExpiredCache(): void {
    return this.extRefValidatorService.cleanExpiredCache();
  }
}
