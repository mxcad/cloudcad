import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ExternalReferenceUpdateService } from './external-reference-update.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { UploadExtReferenceFileDto } from '../dto/upload-ext-reference-file.dto';
import { PreloadingDataDto } from '../dto/preloading-data.dto';
import type { MxCadRequest } from '../types/request.types';
import type { AppConfig } from '../../config/app.config';

@Injectable()
export class ExtRefValidatorService {
  private readonly logger = new Logger(ExtRefValidatorService.name);
  private readonly cacheTTL: number;
  private preloadingDataCache = new Map<string, { data: PreloadingDataDto; timestamp: number }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly externalReferenceUpdateService: ExternalReferenceUpdateService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly runtimeConfigService: RuntimeConfigService,
    configService: ConfigService<AppConfig>,
  ) {
    const cacheTTLConfig = configService.get('cacheTTL', { infer: true });
    this.cacheTTL = cacheTTLConfig.mxcad * 1000;
  }

  async validateExtReferenceUpload(
    file: Express.Multer.File | null,
    body: UploadExtReferenceFileDto,
    allowedExtensions: string[] | null,
    skipPreloadingCheck = false,
    allowedMimePrefix: string | null = null,
  ): Promise<{ success: boolean; error?: { code: number; message: string }; preloadingData?: unknown }> {
    if (!file) return { success: false, error: { code: -1, message: I18nContext.current()?.t('error.file.missing_file') ?? '缺少文件' } };
    if (!body.nodeId || !body.ext_ref_file) return { success: false, error: { code: -1, message: I18nContext.current()?.t('error.file.missing_required_params') ?? '缺少必要参数' } };
    // 图片上传场景（skipPreloadingCheck=true）：新建图纸可能尚未生成 preloading.json，
    // 不因 preloading 缺失而拒绝上传，仅校验源图纸节点存在；
    // preloading.json 由 addImageToPreloadingData 在图片落盘后自动创建。
    // 外部参照上传/替换场景（skipPreloadingCheck=false）：仍要求 preloading 数据存在。
    let preloadingData: PreloadingDataDto | null;
    if (skipPreloadingCheck) {
      const node = await this.fileSystemNodeService.findById(body.nodeId);
      if (!node) return { success: false, error: { code: -1, message: I18nContext.current()?.t('error.mxcad_extra.drawing_not_found') ?? '图纸文件不存在' } };
      preloadingData = await this.externalReferenceUpdateService.getPreloadingData(body.nodeId);
    } else {
      preloadingData = await this.externalReferenceUpdateService.getPreloadingData(body.nodeId);
      if (!preloadingData) return { success: false, error: { code: -1, message: I18nContext.current()?.t('error.mxcad_extra.drawing_not_found') ?? '图纸文件不存在' } };
    }
    const xrefNameToCheck = body.originalXrefName ?? (skipPreloadingCheck ? null : body.ext_ref_file);
    if (xrefNameToCheck && preloadingData) {
      const isValidReference = preloadingData.externalReference.some((ref) => ref.name === xrefNameToCheck) || preloadingData.images.some((img) => img.name === xrefNameToCheck);
      if (!isValidReference) return { success: false, error: { code: -1, message: I18nContext.current()?.t('error.file.external_ref_invalid') ?? '无效的外部参照文件' } };
    }
    if (!this.validateFileName(body.ext_ref_file)) return { success: false, error: { code: -1, message: I18nContext.current()?.t('error.file.name_contains_illegal_chars') ?? '文件名包含非法字符' } };
    const maxSizeCheck = await this.validateFileSize(file.size);
    if (!maxSizeCheck.success) return { success: false, error: { code: -1, message: maxSizeCheck.message } };
    if (allowedExtensions && !this.validateFileType(body.ext_ref_file, allowedExtensions)) {
      const allowedTypes = allowedExtensions.join(', ');
      return { success: false, error: { code: -1, message: I18nContext.current()?.t('error.mxcad_extra.only_allowed_types', { args: { types: allowedTypes } }) ?? `仅支持 ${allowedTypes} 文件` } };
    }
    if (allowedMimePrefix && !file.mimetype.startsWith(allowedMimePrefix)) {
      return { success: false, error: { code: -1, message: I18nContext.current()?.t('error.mxcad_extra.only_allowed_mime_type', { args: { type: allowedMimePrefix } }) ?? `仅支持 ${allowedMimePrefix} 类型的文件` } };
    }
    return { success: true, preloadingData };
  }

  validateFileName(fileName: string): boolean {
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) return false;
    if (!fileName || fileName.trim().length === 0) return false;
    if (fileName.length > 255) return false;
    if (/[<>:"|?*]/.test(fileName)) return false;
    for (let i = 0; i < fileName.length; i++) {
      const charCode = fileName.charCodeAt(i);
      if (charCode < 0x20 || charCode === 0x7f) return false;
    }
    return true;
  }

  /**
   * 校验外部参照文件大小（使用 extRefMaxFileSize，区别于图纸上传的 maxFileSize）
   * 返回 { success } 与动态上限文案。
   */
  async validateFileSize(fileSize: number): Promise<{ success: boolean; message?: string }> {
    const maxFileSizeMB = await this.runtimeConfigService.getValue<number>('extRefMaxFileSize', 100);
    const maxSize = maxFileSizeMB * 1024 * 1024;
    if (fileSize > 0 && fileSize <= maxSize) return { success: true };
    return {
      success: false,
      message: I18nContext.current()?.t('error.file.size_exceeded_limit', { args: { limit: maxFileSizeMB } }) ?? `文件大小超出限制（最大 ${maxFileSizeMB}MB）`,
    };
  }

  validateFileType(fileName: string, allowedExtensions: string[] = ['.dwg', '.dxf', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']): boolean {
    return allowedExtensions.includes(path.extname(fileName).toLowerCase());
  }

  async validateTokenAndGetUserId(request: MxCadRequest): Promise<string> {
    if (request.user) {
      const userData = await this.fileSystemNodeService.findUserById(request.user.id, { id: true, status: true });
      if (!userData) throw new UnauthorizedException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      if (userData.status !== 'ACTIVE') throw new UnauthorizedException(I18nContext.current()?.t('error.auth_extra.user_account_disabled') ?? '用户账号已被禁用');
      return userData.id;
    }
    const authorization = request.headers.authorization;
    if (!authorization) throw new UnauthorizedException(I18nContext.current()?.t('error.auth.missing_auth_header') ?? '缺少Authorization header');
    const token = authorization.replace('Bearer ', '');
    let payload: { sub: string };
    try { payload = this.jwtService.verify(token); } catch { throw new UnauthorizedException(I18nContext.current()?.t('error.auth.jwt_invalid') ?? 'JWT token无效或已过期'); }
    const userData = await this.fileSystemNodeService.findUserById(payload.sub, { id: true, status: true });
    if (!userData) throw new UnauthorizedException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
    if (userData.status !== 'ACTIVE') throw new UnauthorizedException(I18nContext.current()?.t('error.auth_extra.user_account_disabled') ?? '用户账号已被禁用');
    return userData.id;
  }

  async checkFileAccessPermission(nodeId: string, userId: string, checkUserId: string): Promise<boolean> {
    try {
      const role = await this.permissionService.getNodeAccessRole(checkUserId, nodeId);
      return role !== null;
    } catch { return false; }
  }

  computeUploadedFileHash(filePath: string, originalname: string): { hash: string; path: string } {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const ext = path.extname(originalname);
    const newPath = path.join(path.dirname(filePath), `${hash}${ext}`);
    if (filePath !== newPath) {
      if (fs.existsSync(newPath)) {
        // 相同内容文件已存在（同一图片重复上传）：复用已有 hash 文件，清理临时文件，避免 renameSync 抛 EEXIST → 500
        fs.rmSync(filePath, { force: true });
      } else {
        fs.renameSync(filePath, newPath);
      }
    }
    return { hash, path: newPath };
  }

  cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.preloadingDataCache.entries()) {
      if (now - value.timestamp >= this.cacheTTL) this.preloadingDataCache.delete(key);
    }
  }

  invalidatePreloadingCache(nodeId: string): void {
    this.preloadingDataCache.delete(nodeId);
  }

  getPreloadingCache(nodeId: string): PreloadingDataDto | undefined {
    const cached = this.preloadingDataCache.get(nodeId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;
    return undefined;
  }

  setPreloadingCache(nodeId: string, data: PreloadingDataDto): void {
    this.preloadingDataCache.set(nodeId, { data, timestamp: Date.now() });
  }
}
