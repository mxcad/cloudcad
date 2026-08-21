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
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { MxCadContext } from '../types/mxcad-context.types';
import { MxCadRequest } from '../types/request.types';

import { I18nContext } from 'nestjs-i18n';
import { getClientIp } from '../../common/utils/client-ip';
@Injectable()
export class MxCadRequestContextBuilder {
  private readonly logger = new Logger(MxCadRequestContextBuilder.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly fileTreeService: FileTreeService,
    private readonly permissionService: FileSystemPermissionService
  ) {}

  async buildContextFromRequest(
    request: MxCadRequest
  ): Promise<MxCadContext & { isLibrary?: boolean }> {
    try {
      const nodeId = request.body?.nodeId || request.query?.nodeId;
      const clientIp = getClientIp(request);

      this.logger.log(
        `🔍 解析参数: body.nodeId=${request.body?.nodeId}, query.nodeId=${request.query?.nodeId}`
      );
      this.logger.log(`🔍 最终值: nodeId=${nodeId}`);

      // 尝试 JWT 认证，允许匿名访问
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (token) {
        try {
          const payload = this.jwtService.verify(token);

          const userData = await this.fileSystemNodeService.findUserById(
            payload.sub,
            {
              id: true,
              email: true,
              username: true,
              nickname: true,
              roleId: true,
              status: true,
            }
          );

          if (!userData) {
            this.logger.warn('用户不存在，降级为匿名访问');
          } else if (userData.status !== 'ACTIVE') {
            this.logger.warn('用户账号已被禁用，降级为匿名访问');
          } else {
            this.logger.log(`JWT 验证成功: ${userData.username}`);

            if (!nodeId) {
              this.logger.log(
                'nodeId 为空，返回部分上下文供公开上传等场景使用'
              );
              return {
                nodeId: undefined as any,
                userId: userData.id,
                userRole: userData.roleId,
                conflictStrategy: request.body?.conflictStrategy || 'rename',
                isLibrary: undefined,
                ip: clientIp,
              };
            }

            const context: MxCadContext & { isLibrary?: boolean } = {
              nodeId,
              userId: userData.id,
              userRole: userData.roleId,
              conflictStrategy: request.body?.conflictStrategy || 'rename',
              isLibrary: await this.fileTreeService.isLibraryNode(nodeId),
              ip: clientIp,
            };

            this.logger.log(
              `构建上下文: userId=${userData.id}, nodeId=${nodeId}, conflictStrategy=${context.conflictStrategy}, isLibrary=${context.isLibrary}`
            );
            return context;
          }
        } catch (error) {
          if (error instanceof BadRequestException) {
            throw error;
          }
          this.logger.warn(
            `JWT 验证失败，降级为匿名访问: ${(error as Error).message}`
          );
        }
      }

      // 匿名访问：返回部分上下文（无用户信息）
      this.logger.log('匿名访问：返回部分上下文');

      const context: MxCadContext & { isLibrary?: boolean } = {
        nodeId: nodeId || undefined,
        userId: undefined as any,
        userRole: undefined as any,
        conflictStrategy: request.body?.conflictStrategy || 'rename',
        isLibrary: undefined,
        ip: clientIp,
      };

      return context;
    } catch (error) {
      this.logger.error(`构建上下文失败: ${error.message}`, error);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.authentication_failed') ??
          '身份验证失败'
      );
    }
  }

  async validateTokenAndGetUserId(request: MxCadRequest): Promise<string> {
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.missing_auth_header') ??
          '缺少Authorization header'
      );
    }

    const token = authorization.replace('Bearer ', '');

    let payload;
    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.jwt_invalid') ??
          'JWT token无效或已过期'
      );
    }

    const userData = await this.fileSystemNodeService.findUserById(
      payload.sub,
      {
        id: true,
        status: true,
      }
    );

    if (!userData) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'
      );
    }

    if (userData.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth_extra.user_account_disabled') ??
          '用户账号已被禁用'
      );
    }

    return userData.id;
  }

  async getProjectRootByNodeId(
    nodeId: string
  ): Promise<Pick<any, 'id' | 'parentId'> | null> {
    return this.fileSystemNodeService.getProjectRootByNodeId(nodeId);
  }

  async checkFileAccessPermission(
    nodeId: string,
    userId: string,
    checkUserId: string
  ): Promise<boolean> {
    try {
      this.logger.log(
        `[checkFileAccessPermission] 开始检查权限: nodeId=${nodeId}, checkUserId=${checkUserId}`
      );

      const role = await this.permissionService.getNodeAccessRole(
        checkUserId,
        nodeId
      );

      const hasPermission = role !== null;
      this.logger.log(
        `[checkFileAccessPermission] 权限检查结果: ${hasPermission}, role=${role}`
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(`检查文件访问权限失败: ${error.message}`, error);
      return false;
    }
  }
}
