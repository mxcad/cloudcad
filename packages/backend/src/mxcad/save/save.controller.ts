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
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { SaveAsService, SaveMxwebAsResult } from './save-as.service';
import { TreeWalker } from '../../file-system/file-tree/tree-walker.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { IPERMISSION_SERVICE, IPermissionService } from '../../permission/interfaces/permission-service.interface';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { MxCadRequest } from '../types/request.types';
import { NodeType } from '@cloudcad/db';
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
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly saveAsService: SaveAsService,
    private readonly treeWalker: TreeWalker,
    private readonly permissionService: FileSystemPermissionService,
    @Inject(IPERMISSION_SERVICE) private readonly systemPermissionService: IPermissionService,
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

    if (dto.targetType === 'project' && !dto.projectId) {
      throw new BadRequestException(I18nContext.current()?.t('error.mxcad.save_to_project_requires_project_id') ?? '保存到项目时必须提供projectId');
    }

    if (dto.targetType === 'library' && !dto.libraryType) {
      throw new BadRequestException(I18nContext.current()?.t('error.mxcad.save_to_library_requires_library_type') ?? '保存到资源库时必须提供libraryType');
    }

    const targetParentNode =
      await this.fileSystemNodeService.findByIdWithDeletedAt(dto.targetParentId, {
        id: true,
        nodeType: true,
        ownerId: true,
      });

    if (!targetParentNode) {
      throw new BadRequestException(I18nContext.current()?.t('error.mxcad.target_folder_not_found') ?? '目标文件夹不存在');
    }

    if (targetParentNode.nodeType === NodeType.FILE) {
      throw new BadRequestException(I18nContext.current()?.t('error.mxcad.target_must_be_folder') ?? '目标必须是文件夹');
    }

    if (dto.targetType === 'personal') {
      const rootId = await this.treeWalker.resolveProjectId(
        dto.targetParentId,
      );
      const rootNode = rootId
        ? await this.fileSystemNodeService.findUniqueById(rootId, {
            nodeType: true,
            ownerId: true,
          })
        : null;

      const isUserPersonalSpace = rootNode?.ownerId === userId;

      if (!isUserPersonalSpace) {
        this.logger.warn(
          `[saveMxwebAs] 用户 ${userId} 尝试保存到非自己的私人空间: ${dto.targetParentId}`,
        );
        throw new BadRequestException(I18nContext.current()?.t('error.mxcad.no_permission_save_to_location') ?? '您没有权限保存到此位置');
      }
    } else if (dto.targetType === 'library') {
      const requiredPermission = dto.libraryType === 'drawing'
        ? SystemPermission.LIBRARY_DRAWING_MANAGE
        : SystemPermission.LIBRARY_BLOCK_MANAGE;
      const hasPermission = await this.systemPermissionService.checkSystemPermission(
        userId,
        requiredPermission,
      );
      if (!hasPermission) {
        this.logger.warn(
          `[saveMxwebAs] 用户 ${userId} 没有${dto.libraryType === 'drawing' ? '图纸库' : '图块库'}管理权限`,
        );
        throw new BadRequestException(I18nContext.current()?.t('error.mxcad.no_permission_library_management') ?? '您没有资源库管理权限');
      }
    } else {
      if (dto.projectId) {
        const hasPermission =
          await this.permissionService.checkNodePermission(
            userId,
            dto.projectId,
            ProjectPermission.CAD_SAVE,
          );

        if (!hasPermission) {
          this.logger.warn(
            `[saveMxwebAs] 用户 ${userId} 没有项目 ${dto.projectId} 的 CAD_SAVE 权限`,
          );
          throw new BadRequestException(I18nContext.current()?.t('error.mxcad.no_permission_save_to_project') ?? '您没有权限保存到此项目');
        }
      } else {
        throw new BadRequestException(I18nContext.current()?.t('error.mxcad.save_to_project_requires_project_id') ?? '保存到项目时必须提供projectId');
      }
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
