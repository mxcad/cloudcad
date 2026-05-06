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
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MxCadService } from './mxcad.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { MxCadContext } from '../types/mxcad-context.types';
import { MxCadRequest } from '../types/request.types';

@Injectable()
export class MxCadRequestContextBuilder {
  private readonly logger = new Logger(MxCadRequestContextBuilder.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly mxCadService: MxCadService,
    private readonly fileTreeService: FileTreeService,
    private readonly permissionService: FileSystemPermissionService,
  ) {}

  async buildContextFromRequest(
    request: MxCadRequest,
  ): Promise<MxCadContext & { isLibrary?: boolean }> {
    try {
      if (!request.headers.authorization) {
        throw new UnauthorizedException(
          '缺少Authorization header，请提供有效的JWT token',
        );
      }

      const token = request.headers.authorization.replace('Bearer ', '');

      let payload;
      try {
        payload = this.jwtService.verify(token);
      } catch (error) {
        throw new UnauthorizedException('JWT token无效或已过期');
      }

      const userData = await this.mxCadService.findUserById(payload.sub, {
        id: true,
        email: true,
        username: true,
        nickname: true,
        roleId: true,
        status: true,
      });

      if (!userData) {
        throw new UnauthorizedException('用户不存在');
      }

      if (userData.status !== 'ACTIVE') {
        throw new UnauthorizedException('用户账号已被禁用');
      }

      this.logger.log(`JWT 验证成功: ${userData.username}`);

      const nodeId = request.body?.nodeId || request.query?.nodeId;

      this.logger.log(
        `🔍 解析参数: body.nodeId=${request.body?.nodeId}, query.nodeId=${request.query?.nodeId}`,
      );
      this.logger.log(`🔍 最终值: nodeId=${nodeId}`);

      if (!nodeId) {
        throw new BadRequestException(
          '缺少节点ID（nodeId），无法创建文件系统节点',
        );
      }

      const libraryKey = await this.fileTreeService.getLibraryKey(nodeId);

      const context: MxCadContext & { isLibrary?: boolean } = {
        nodeId,
        userId: userData.id,
        userRole: userData.roleId,
        conflictStrategy: request.body?.conflictStrategy || 'rename',
        isLibrary: libraryKey === 'drawing' || libraryKey === 'block',
      };

      this.logger.log(
        `构建上下文: userId=${userData.id}, nodeId=${nodeId}, conflictStrategy=${context.conflictStrategy}, libraryKey=${libraryKey}, isLibrary=${context.isLibrary}`,
      );
      return context;
    } catch (error) {
      this.logger.error(`构建上下文失败: ${error.message}`, error);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('身份验证失败');
    }
  }

  async validateTokenAndGetUserId(request: MxCadRequest): Promise<string> {
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('缺少Authorization header');
    }

    const token = authorization.replace('Bearer ', '');

    let payload;
    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('JWT token无效或已过期');
    }

    const userData = await this.mxCadService.findUserById(payload.sub, {
      id: true,
      status: true,
    });

    if (!userData) {
      throw new UnauthorizedException('用户不存在');
    }

    if (userData.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户账号已被禁用');
    }

    return userData.id;
  }

  async getAllNodeIdsInProject(projectId: string): Promise<string[]> {
    return this.mxCadService.getAllNodeIdsInProject(projectId);
  }

  async getFileSystemNodeByHash(fileHash: string, projectId?: string) {
    return this.mxCadService.findFileNodeByHash(fileHash, projectId);
  }

  async getProjectRootByNodeId(nodeId: string) {
    return this.mxCadService.getProjectRootByNodeId(nodeId);
  }

  async checkFileAccessPermission(
    nodeId: string,
    userId: string,
    checkUserId: string,
  ): Promise<boolean> {
    try {
      this.logger.log(
        `[checkFileAccessPermission] 开始检查权限: nodeId=${nodeId}, checkUserId=${checkUserId}`,
      );

      const role = await this.permissionService.getNodeAccessRole(
        checkUserId,
        nodeId,
      );

      const hasPermission = role !== null;
      this.logger.log(
        `[checkFileAccessPermission] 权限检查结果: ${hasPermission}, role=${role}`,
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(`检查文件访问权限失败: ${error.message}`, error);
      return false;
    }
  }
}
