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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { MxCadService } from '../core/mxcad.service';
import { SaveAsService } from './save-as.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { PermissionService } from '../../common/services/permission.service';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { MxCadRequest } from '../types/request.types';
import { SaveMxwebDto } from '../dto/save-mxweb.dto';
import { SaveMxwebAsDto } from '../dto/save-mxweb-as.dto';
import { SaveMxwebResponseDto } from '../dto/save-mxweb-response.dto';
import { SaveMxwebAsResponseDto } from '../dto/save-mxweb-as-response.dto';

@ApiTags('MxCAD 图纸保存')
@Controller('mxcad')
export class SaveController {
  private readonly logger = new Logger(SaveController.name);

  constructor(
    private readonly mxCadService: MxCadService,
    private readonly saveAsService: SaveAsService,
    private readonly fileTreeService: FileTreeService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly systemPermissionService: PermissionService,
  ) {}

  @Post('savemxweb/:nodeId')
  @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_SAVE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
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
    @Body('commitMessage') commitMessage: string,
    @Body('expectedTimestamp') expectedTimestamp: string,
    @Req() request: MxCadRequest,
  ) {
    this.logger.log(
      `[saveMxwebToNode] 开始保存: nodeId=${nodeId}, commitMessage=${commitMessage || '(无)'}`,
    );

    const userId = request.user?.id;
    const userName =
      request.user?.username || request.user?.nickname || request.user?.email;

    const result = await this.mxCadService.saveMxwebFile(
      nodeId,
      file,
      userId,
      userName,
      commitMessage,
      false,
      expectedTimestamp,
    );

    if (!result.success) {
      this.logger.error(`[saveMxwebToNode] 保存失败: ${result.message}`);
      throw new BadRequestException(result.message);
    }

    this.logger.log(`[saveMxwebToNode] 保存成功: nodeId=${nodeId}`);
    return {
      nodeId,
      path: result.path,
    };
  }

  @Post('save-as')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
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
      `[saveMxwebAs] 开始保存: targetType=${dto.targetType}, parentId=${dto.targetParentId}, format=${dto.format}`,
    );

    const userId = request.user?.id;
    const userName =
      request.user?.username || request.user?.nickname || request.user?.email;

    if (!userId) {
      throw new UnauthorizedException('用户未登录');
    }

    if (dto.targetType === 'project' && !dto.projectId) {
      throw new BadRequestException('保存到项目时必须提供projectId');
    }

    if (dto.targetType === 'library' && !dto.libraryType) {
      throw new BadRequestException('保存到资源库时必须提供libraryType');
    }

    const targetParentNode =
      await this.mxCadService.findNodeByIdWithDeletedAt(dto.targetParentId, {
        id: true,
        isFolder: true,
        personalSpaceKey: true,
      });

    if (!targetParentNode) {
      throw new BadRequestException('目标文件夹不存在');
    }

    if (!targetParentNode.isFolder) {
      throw new BadRequestException('目标必须是文件夹');
    }

    if (dto.targetType === 'personal') {
      const rootId = await this.fileTreeService.getProjectId(
        dto.targetParentId,
      );
      const rootNode = rootId
        ? await this.mxCadService.findNodeById(rootId, {
            personalSpaceKey: true,
            ownerId: true,
          })
        : null;

      const isUserPersonalSpace =
        rootNode?.personalSpaceKey === userId ||
        rootNode?.ownerId === userId;

      if (!isUserPersonalSpace) {
        this.logger.warn(
          `[saveMxwebAs] 用户 ${userId} 尝试保存到非自己的私人空间: ${dto.targetParentId}`,
        );
        throw new BadRequestException('您没有权限保存到此位置');
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
        throw new BadRequestException('您没有资源库管理权限');
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
          throw new BadRequestException('您没有权限保存到此项目');
        }
      } else {
        throw new BadRequestException('保存到项目时必须提供projectId');
      }
    }

    const result = await this.saveAsService.saveMxwebAs({
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
    });

    if (!result.success) {
      this.logger.error(`[saveMxwebAs] 保存失败: ${result.message}`);
      throw new BadRequestException(result.message);
    }

    this.logger.log(`[saveMxwebAs] 保存成功: nodeId=${result.nodeId}`);
    return result;
  }
}
