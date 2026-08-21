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
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { DatabaseService } from '../../database/database.service';
import {
  CLIENT_ID_WHITELIST,
  DEVICE_AUTH_FIELDS,
  DEVICE_AUTH_STATUS,
  DEVICE_CODE_EXPIRES_IN,
  DEVICE_CODE_POLL_INTERVAL,
  deviceAuthKey,
  deviceAuthUserCodeKey,
} from './device-auth.constants';
import type { AppConfig } from '../../config/app.config';
import type { JwtExeAccessPayload, JwtExeRefreshPayload } from '../interfaces/jwt-payload.interface';
import { DeviceCodeResponseDto } from './dto/device-code.dto';
import { DeviceAuthorizeResponseDto } from './dto/device-authorize.dto';
import { DeviceTokenResponseDto } from './dto/device-token.dto';

const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class DeviceAuthService {
  private readonly logger = new Logger(DeviceAuthService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly prisma: DatabaseService,
  ) {}

  async requestDeviceCode(clientId: string): Promise<DeviceCodeResponseDto> {
    if (!CLIENT_ID_WHITELIST.has(clientId)) {
      throw new BadRequestException(`Invalid client_id: ${clientId}`);
    }

    const deviceCode = this.generateDeviceCode();
    const userCode = this.generateUserCode();
    const now = Math.floor(Date.now() / 1000);

    const key = deviceAuthKey(deviceCode);
    const pipeline = this.redis.pipeline();

    pipeline.hset(key, {
      [DEVICE_AUTH_FIELDS.USER_CODE]: userCode,
      [DEVICE_AUTH_FIELDS.CLIENT_ID]: clientId,
      [DEVICE_AUTH_FIELDS.STATUS]: DEVICE_AUTH_STATUS.PENDING,
      [DEVICE_AUTH_FIELDS.CLIENT_TYPE]: 'exe',
      [DEVICE_AUTH_FIELDS.CREATED_AT]: String(now),
    });
    pipeline.expire(key, DEVICE_CODE_EXPIRES_IN);

    const userCodeKey = deviceAuthUserCodeKey(userCode);
    pipeline.setex(userCodeKey, DEVICE_CODE_EXPIRES_IN, deviceCode);

    await pipeline.exec();

    const domain = await this.runtimeConfigService.getValue<string>(
      'deviceAuthFrontendDomain',
      'http://localhost:3000',
    );

    return new DeviceCodeResponseDto({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${domain}/device`,
      verification_uri_complete: `${domain}/device?user_code=${userCode}&client_id=${clientId}`,
      expires_in: DEVICE_CODE_EXPIRES_IN,
      interval: DEVICE_CODE_POLL_INTERVAL,
    });
  }

  private readonly AUTHORIZE_LUA_SCRIPT = `
    local status = redis.call('HGET', KEYS[1], 'status')
    if status ~= ARGV[1] then
      return 0
    end
    redis.call('HSET', KEYS[1], 'status', ARGV[2], 'user_id', ARGV[3])
    redis.call('DEL', KEYS[2])
    return 1
  `;

  async authorizeDevice(
    userCode: string,
    userId: string,
  ): Promise<DeviceAuthorizeResponseDto> {
    const userCodeKey = deviceAuthUserCodeKey(userCode);
    const deviceCode = await this.redis.get(userCodeKey);

    if (!deviceCode) {
      throw new NotFoundException('Invalid or expired user_code');
    }

    const key = deviceAuthKey(deviceCode);
    const result = await this.redis.eval(
      this.AUTHORIZE_LUA_SCRIPT,
      2,
      key,
      userCodeKey,
      DEVICE_AUTH_STATUS.PENDING,
      DEVICE_AUTH_STATUS.AUTHORIZED,
      userId,
    );

    if (result !== 1) {
      throw new BadRequestException('Device code is not in PENDING state');
    }

    this.logger.log(
      `Device authorized: device_code=${deviceCode.substring(0, 8)}..., user_id=${userId}`,
    );
    return new DeviceAuthorizeResponseDto(true);
  }

  private readonly POLL_LUA_SCRIPT = `
    local data = redis.call('HGETALL', KEYS[1])
    if #data == 0 then
      return {'expired_token'}
    end
    local map = {}
    for i = 1, #data, 2 do
      map[data[i]] = data[i + 1]
    end
    if map['client_id'] ~= ARGV[1] then
      return {'expired_token'}
    end
    local status = map['status']
    if status == 'AUTHORIZED' then
      local user_id = map['user_id']
      if not user_id or user_id == '' then
        return {'expired_token'}
      end
      redis.call('DEL', KEYS[1])
      return {'AUTHORIZED', user_id}
    end
    if status == 'EXPIRED' then
      return {'expired_token'}
    end
    return {'authorization_pending'}
  `;

  async pollForToken(
    deviceCode: string,
    clientId: string,
  ): Promise<DeviceTokenResponseDto> {
    if (!CLIENT_ID_WHITELIST.has(clientId)) {
      throw new BadRequestException(`Invalid client_id: ${clientId}`);
    }

    const key = deviceAuthKey(deviceCode);
    const result = await this.redis.eval(
      this.POLL_LUA_SCRIPT,
      1,
      key,
      clientId,
    ) as [string] | [string, string];

    const [action, userId] = result;

    if (action === 'AUTHORIZED' && userId) {
      const tokens = await this.generateExeTokens(userId, clientId);

      this.logger.log(
        `Device token issued: device_code=${deviceCode.substring(0, 8)}..., user_id=${userId}, client_id=${clientId}`,
      );

      return new DeviceTokenResponseDto({
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: 604800,
        refresh_token: tokens.refreshToken,
      });
    }

    throw new HttpException({ error: action }, HttpStatus.BAD_REQUEST);
  }

  private async generateExeTokens(
    userId: string,
    clientId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtSecret = this.configService.get('jwt', { infer: true })?.secret;
    const jwtRefreshSecret = this.configService.get('jwt', { infer: true })?.refreshSecret;

    if (!jwtSecret || !jwtRefreshSecret) {
      throw new Error('JWT secret configuration is missing');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        username: true,
        role: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new HttpException({ error: 'access_denied' }, HttpStatus.BAD_REQUEST);
    }

    const accessPayload: JwtExeAccessPayload = {
      sub: user.id,
      email: user.email ?? '',
      username: user.username,
      role: user.role?.name ?? 'USER',
      roleId: user.role?.id ?? '',
      type: 'access',
      client_type: 'exe',
      client_id: clientId,
    };

    const refreshPayload: JwtExeRefreshPayload = {
      sub: user.id,
      type: 'refresh',
      client_type: 'exe',
      client_id: clientId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: jwtSecret,
        expiresIn: '7d',
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: jwtRefreshSecret,
        expiresIn: '30d',
      }),
    ]);

    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: jwtRefreshSecret,
      }) as JwtExeRefreshPayload & { exp: number };

      const expiresAt = new Date(decoded.exp * 1000);
      await this.prisma.refreshToken.create({
        data: { token: refreshToken, userId, expiresAt, clientId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to store EXE refresh token: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { accessToken, refreshToken };
  }

  private generateDeviceCode(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateUserCode(): string {
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += USER_CODE_CHARS[
        Math.floor(Math.random() * USER_CODE_CHARS.length)
      ];
    }
    return `${code.substring(0, 4)}-${code.substring(4, 8)}`;
  }
}
