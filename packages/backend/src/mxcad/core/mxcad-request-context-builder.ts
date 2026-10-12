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
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { MxCadContext } from '../types/mxcad-context.types';
import { MxCadRequest } from '../types/request.types';

import { I18nContext } from 'nestjs-i18n';
import { getClientIp } from '../../common/utils/client-ip';
import { MxCadRequestAuthService } from './mxcad-request-auth.service';
@Injectable()
export class MxCadRequestContextBuilder {
  private readonly logger = new Logger(MxCadRequestContextBuilder.name);

  constructor(
    private readonly fileTreeService: FileTreeService,
    private readonly requestAuthService: MxCadRequestAuthService
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

      const anonymousContext: MxCadContext & { isLibrary?: boolean } = {
        nodeId: nodeId || undefined,
        userId: undefined as any,
        userRole: undefined as any,
        conflictStrategy: request.body?.conflictStrategy || 'rename',
        isLibrary: undefined,
        ip: clientIp,
      };

      // 认证解析（token 校验 + 用户状态）走 MxCadRequestAuthService 单一出口；
      // null 表示降级为匿名访问。
      if (!request.headers.authorization) {
        this.logger.log('匿名访问：返回部分上下文');
        return anonymousContext;
      }

      try {
        const user = await this.requestAuthService.resolveUserOrGuest(request);

        if (!user) {
          this.logger.log('用户不可用，降级为匿名访问');
        } else {
          this.logger.log(`JWT 验证成功: ${user.userId}`);

          if (!nodeId) {
            this.logger.log(
              'nodeId 为空，返回部分上下文供公开上传等场景使用'
            );
            return {
              nodeId: undefined as any,
              userId: user.userId,
              userRole: user.userRole as any,
              conflictStrategy: request.body?.conflictStrategy || 'rename',
              isLibrary: undefined,
              ip: clientIp,
            };
          }

          const context: MxCadContext & { isLibrary?: boolean } = {
            nodeId,
            userId: user.userId,
            userRole: user.userRole as any,
            conflictStrategy: request.body?.conflictStrategy || 'rename',
            isLibrary: await this.fileTreeService.isLibraryNode(nodeId),
            ip: clientIp,
          };

          this.logger.log(
            `构建上下文: userId=${user.userId}, nodeId=${nodeId}, conflictStrategy=${context.conflictStrategy}, isLibrary=${context.isLibrary}`
          );
          return context;
        }
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        this.logger.warn(
          `认证解析失败，降级为匿名访问: ${(error as Error).message}`
        );
      }

      this.logger.log('匿名访问：返回部分上下文');
      return anonymousContext;
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
}
