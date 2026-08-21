///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';

export interface UploadTokenPayload {
  path: string;
  operation: 'upload';
  exp: number;
}

export interface UploadTokenResult {
  token: string;
  path: string;
  operation: 'upload';
  expiresAt: Date;
}

/**
 * 预签名上传令牌签发服务
 *
 * standalone 模式下，客户端直连 storage-service 上传文件时，
 * 由后端签发携带 { path, operation:'upload' } 的 JWT，
 * storage-service 使用共享密钥 BACKEND_JWT_SECRET 校验（不查库）。
 * 参考 PRD #125 / issue #119。
 */
@Injectable()
export class UploadTokenService {
  private readonly logger = new Logger(UploadTokenService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds =
      parseInt(configService.get<string>('UPLOAD_TOKEN_TTL') || '3600', 10) ||
      3600;
  }

  /**
   * 签发上传令牌
   * @param path storage-service 内相对路径（如 202607/node1/a.dwg）
   */
  async signUploadToken(path: string): Promise<UploadTokenResult> {
    const secret = this.configService.get<string>('BACKEND_JWT_SECRET');
    if (!secret) {
      this.logger.warn('BACKEND_JWT_SECRET 未配置，无法签发上传令牌');
      throw new UnauthorizedException('BACKEND_JWT_SECRET 未配置');
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.ttlSeconds;
    const payload: UploadTokenPayload = {
      path,
      operation: 'upload',
      exp,
    };

    const token = jwt.sign(payload, secret, {
      algorithm: 'HS256',
    });

    return {
      token,
      path,
      operation: 'upload',
      expiresAt: new Date(exp * 1000),
    };
  }
}
