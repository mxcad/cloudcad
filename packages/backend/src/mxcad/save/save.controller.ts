///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Post,
  Body,
  Param,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { MXCAD_SAVE_SERVICE } from '../interfaces/mxcad-service-tokens';
import { IMxcadSaveService } from '../interfaces/mxcad-save.interface';
import { SaveAsService, SaveMxwebAsResult } from './save-as.service';
import { MxCadRequest } from '../types/request.types';
import { SaveMxwebDto } from '../dto/save-mxweb.dto';
import { SaveMxwebAsDto } from '../dto/save-mxweb-as.dto';
import { SaveMxwebResponseDto } from '../dto/save-mxweb-response.dto';
import { SaveMxwebAsResponseDto } from '../dto/save-mxweb-as-response.dto';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction } from '../../common/enums/audit.enum';

import { I18nContext } from 'nestjs-i18n';
@ApiTags('MxCAD 图纸保存')
@Controller('mxcad')
export class SaveController {
  private readonly logger = new Logger(SaveController.name);

  constructor(
    @Inject(MXCAD_SAVE_SERVICE)
    private readonly mxCadSaveService: IMxcadSaveService,
    private readonly saveAsService: SaveAsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post('savemxweb/:nodeId')
  @UseGuards(RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_SAVE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SaveMxwebDto })
  @ApiResponse({
    status: 200,
    description: '保存 mxweb 文件到指定节点',
    type: SaveMxwebResponseDto,
  })
  async saveMxwebToNode(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveMxwebDto,
    @Req() request: MxCadRequest,
  ) {
    this.logger.log(
      `[saveMxwebToNode] 开始保存: nodeId=${nodeId}, commitMessage=${dto.commitMessage || '(无)'}, hash=${dto.hash || '无'}`,
    );

    const userId = request.user?.id;
    const userName =
      request.user?.username || request.user?.nickname || request.user?.email;

    let result: { success: boolean; message: string; path?: string };

    if (dto.hash) {
      this.logger.log(`[saveMxwebToNode] 使用 hash 模式: ${dto.hash}`);
      result = await this.mxCadSaveService.saveMxwebFileByHash(
        nodeId,
        dto.hash,
        userId,
        userName,
        dto.commitMessage,
        false,
        dto.expectedTimestamp,
      );
    } else if (file) {
      result = await this.mxCadSaveService.saveMxwebFile(
        nodeId,
        file,
        userId,
        userName,
        dto.commitMessage,
        false,
        dto.expectedTimestamp,
      );
    } else {
      throw new BadRequestException(I18nContext.current()?.t('error.file_extra.missing_file_or_hash') ?? '缺少文件或文件 hash');
    }

    if (!result.success) {
      this.logger.error(`[saveMxwebToNode] 保存失败: ${result.message}`);
      throw new BadRequestException(result.message);
    }

    this.logger.log(`[saveMxwebToNode] 保存成功: nodeId=${nodeId}`);
    // 显式保存审计（FILE_UPDATE）：仅项目内节点记录（个人空间/公共资源库不记）；
    // 失败不记（版本冲突等失败高频且前端已提示，无审查价值）
    await this.auditLogService.logProjectNodeAction(
      AuditAction.FILE_UPDATE,
      nodeId,
      userId,
    );
    return {
      nodeId,
      path: result.path,
    };
  }

  @Post('save-as')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SaveMxwebAsDto })
  @ApiResponse({
    status: 200,
    description: '保存mxweb文件为新文件',
    type: SaveMxwebAsResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async saveMxwebAs(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SaveMxwebAsDto,
    @Req() request: MxCadRequest,
  ) {
    this.logger.log(
      `[saveMxwebAs] 开始保存: targetType=${dto.targetType}, parentId=${dto.targetParentId}, format=${dto.format}, hash=${dto.hash || '无'}`,
    );

    const userId = request.user?.id;
    const userName =
      request.user?.username || request.user?.nickname || request.user?.email;

    if (!userId) {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth_extra.user_not_logged_in') ?? '用户未登录');
    }

    let result: SaveMxwebAsResult;

    if (dto.hash) {
      this.logger.log(`[saveMxwebAs] 使用 hash 模式: ${dto.hash}`);
      result = await this.saveAsService.saveMxwebAsByHash({
        fileHash: dto.hash,
        targetType: dto.targetType,
        targetParentId: dto.targetParentId,
        projectId: dto.projectId,
        format: dto.format || 'dwg',
        userId,
        userName,
        commitMessage: dto.commitMessage,
        fileName: dto.fileName,
        libraryType: dto.libraryType,
        sourceNodeId: dto.sourceNodeId,
        sourceFileHash: dto.sourceFileHash,
      });
    } else if (file) {
      result = await this.saveAsService.saveMxwebAs({
        file,
        targetType: dto.targetType,
        targetParentId: dto.targetParentId,
        projectId: dto.projectId,
        format: dto.format || 'dwg',
        userId,
        userName,
        commitMessage: dto.commitMessage,
        fileName: dto.fileName,
        libraryType: dto.libraryType,
        sourceNodeId: dto.sourceNodeId,
        sourceFileHash: dto.sourceFileHash,
      });
    } else {
      throw new BadRequestException(I18nContext.current()?.t('error.file_extra.missing_file_or_hash') ?? '缺少文件或文件 hash');
    }

    if (!result.success) {
      this.logger.error(`[saveMxwebAs] 保存失败: ${result.message}`);
      throw new BadRequestException(result.message);
    }

    this.logger.log(`[saveMxwebAs] 保存成功: nodeId=${result.nodeId}`);
    // 另存为项目 = 项目内新增图纸（FILE_CREATE）；personal/library 目标不记
    if (dto.targetType === 'project' && dto.projectId) {
      await this.auditLogService.logProjectNodeAction(
        AuditAction.FILE_CREATE,
        result.nodeId,
        userId,
      );
    }
    return result;
  }
}
