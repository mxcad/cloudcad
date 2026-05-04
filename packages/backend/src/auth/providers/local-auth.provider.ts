///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { LoginDto, RegisterDto, AuthResponseDto, UserDto } from '../dto/auth.dto';
import { WechatLoginResponseDto } from '../dto/wechat.dto';
import { SmsVerificationService } from '../services/sms';
import { WechatService } from '../services/wechat.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import {
  USER_SERVICE,
  IUserService,
} from '../../common/interfaces/user-service.interface';
import { RegistrationService } from '../services/registration.service';
import { LoginService } from '../services/login.service';
import { AuthTokenService } from '../services/auth-token.service';
import { SessionRequest } from '../interfaces/jwt-payload.interface';
import { IAuthProvider } from '../interfaces/auth-provider.interface';

@Injectable()
export class LocalAuthProvider implements IAuthProvider {
  private readonly logger = new Logger(LocalAuthProvider.name);

  constructor(
    private prisma: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private smsVerificationService: SmsVerificationService,
    private wechatService: WechatService,
    private runtimeConfigService: RuntimeConfigService,
    @Inject(USER_SERVICE) private readonly userService: IUserService,
    private registrationService: RegistrationService,
    private loginService: LoginService,
    private authTokenService: AuthTokenService
  ) {}

  async login(
    credentials: LoginDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.loginService.login(credentials, req);
  }

  async loginByPhone(
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    this.logger.log(`手机号验证码登录尝试: ${phone}`);

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );

    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    let user = await this.prisma.user.findUnique({
      where: { phone: formattedPhone },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        phone: true,
        phoneVerified: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: {
              select: {
                permission: true,
              },
            },
          },
        },
        status: true,
      },
    });

    if (!user) {
      const allowAutoRegister = await this.runtimeConfigService.getValue<boolean>(
        'allowAutoRegisterOnPhoneLogin',
        false
      );

      const allowRegister = await this.runtimeConfigService.getValue<boolean>(
        'allowRegister',
        true
      );

      if (allowAutoRegister && allowRegister) {
        this.logger.log(`手机号未注册，开始自动注册: ${formattedPhone}`);

        const baseUsername = `u_${formattedPhone.slice(-8)}`;
        let username = baseUsername;
        let suffix = 1;

        while (await this.prisma.user.findUnique({ where: { username } })) {
          username = `${baseUsername}_${suffix}`;
          suffix++;
        }

        const newUser = await this.userService.create({
          username,
          password: Math.random().toString(36).slice(-12) + '!Aa',
          nickname: `用户${formattedPhone.slice(-4)}`,
          phone: formattedPhone,
          phoneVerified: true,
        });

        this.logger.log(
          `手机号自动注册成功: ${formattedPhone}, username: ${username}`
        );

        user = await this.prisma.user.findUnique({
          where: { id: newUser.id },
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            phone: true,
            phoneVerified: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isSystem: true,
                permissions: {
                  select: {
                    permission: true,
                  },
                },
              },
            },
            status: true,
          },
        });
      } else {
        throw new BadRequestException({
          code: 'PHONE_NOT_REGISTERED',
          message: '手机号未注册，请先注册',
          phone: formattedPhone,
        } as any);
      }
    }

    if (!user) {
      throw new InternalServerErrorException('用户创建失败');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('账号已被禁用');
    }

    const tokens = await this.authTokenService.generateTokens(user);

    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role.name;
      req.session.userEmail = user.email ?? undefined;
      await req.session.save();
      this.logger.log(
        `Session 已设置: userId=${user.id}, role=${user.role.name}`
      );
    }

    this.logger.log(`手机号验证码登录成功: ${formattedPhone}`);

    return {
      ...tokens,
      user: {
        ...user,
        nickname: user.nickname || undefined,
        avatar: user.avatar || undefined,
        role: user.role,
        status: user.status,
      },
    };
  }

  async loginByWechat(
    code: string,
    state: string
  ): Promise<WechatLoginResponseDto> {
    if (!this.wechatService.validateState(state)) {
      throw new BadRequestException('无效的状态参数');
    }

    const tokenData = await this.wechatService.getAccessToken(code);

    const wechatUser = await this.wechatService.getUserInfo(
      tokenData.access_token,
      tokenData.openid
    );

    let user = await this.prisma.user.findUnique({
      where: { wechatId: wechatUser.openid },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        wechatId: true,
        provider: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: {
              select: {
                permission: true,
              },
            },
          },
        },
        status: true,
        emailVerified: true,
        phone: true,
        phoneVerified: true,
      },
    });

    const wechatAutoRegister = await this.runtimeConfigService.getValue<boolean>(
      'wechatAutoRegister',
      false
    );
    const requireEmailVerification = await this.runtimeConfigService.getValue<boolean>(
      'requireEmailVerification',
      false
    );
    const requirePhoneVerification = await this.runtimeConfigService.getValue<boolean>(
      'requirePhoneVerification',
      false
    );

    if (!user) {
      const allowRegister = await this.runtimeConfigService.getValue<boolean>(
        'allowRegister',
        true
      );

      if (wechatAutoRegister && allowRegister) {
        let username = `wechat_${wechatUser.openid.slice(0, 8)}`;
        let counter = 0;
        while (await this.prisma.user.findUnique({ where: { username } })) {
          counter++;
          username = `wechat_${wechatUser.openid.slice(0, 8)}_${counter}`;
        }

        const defaultRole = await this.prisma.role.findFirst({
          where: { name: 'USER' },
        });

        if (!defaultRole) {
          throw new InternalServerErrorException('默认角色不存在');
        }

        user = await this.prisma.user.create({
          data: {
            wechatId: wechatUser.openid,
            provider: 'WECHAT',
            username,
            nickname: wechatUser.nickname,
            avatar: wechatUser.headimgurl,
            roleId: defaultRole.id,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            wechatId: true,
            provider: true,
            roleId: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isSystem: true,
                permissions: {
                  select: {
                    permission: true,
                  },
                },
              },
            },
            status: true,
            emailVerified: true,
            phone: true,
            phoneVerified: true,
          },
        });

        this.logger.log(`微信自动注册新用户: ${username} (ID: ${user.id})`);
      } else {
        const tempToken = this.jwtService.sign(
          {
            sub: 'pending',
            type: 'wechat_temp',
            wechatId: wechatUser.openid,
            nickname: wechatUser.nickname,
            avatar: wechatUser.headimgurl,
          },
          {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn: '30m',
          }
        );

        return {
          accessToken: '',
          refreshToken: '',
          user: null as any,
          requireEmailBinding: false,
          requirePhoneBinding: false,
          needRegister: true,
          tempToken,
        };
      }
    } else {
      if (user.status === 'SUSPENDED') {
        throw new UnauthorizedException('账号已被暂停使用');
      } else if (user.status === 'INACTIVE') {
        throw new UnauthorizedException('账号尚未激活');
      } else if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException('账号状态异常');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          nickname: wechatUser.nickname,
          avatar: wechatUser.headimgurl,
        },
      });

      this.logger.log(`微信用户登录成功: ${user.username} (ID: ${user.id})`);
    }

    const needEmailBinding = requireEmailVerification && !user.email;
    const needPhoneBinding = requirePhoneVerification && !user.phone;

    if (needEmailBinding || needPhoneBinding) {
      const tempToken = this.jwtService.sign(
        {
          sub: user.id,
          type: 'wechat_bind_temp',
          wechatId: user.wechatId,
        },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: '30m',
        }
      );

      return {
        accessToken: '',
        refreshToken: '',
        user: {
          ...user,
          nickname: user.nickname || undefined,
          avatar: user.avatar || undefined,
          role: user.role,
          status: user.status,
        },
        requireEmailBinding: needEmailBinding,
        requirePhoneBinding: needPhoneBinding,
        tempToken,
      };
    }

    const tokens = await this.authTokenService.generateTokens(user);

    return {
      ...tokens,
      user: {
        ...user,
        nickname: user.nickname || undefined,
        avatar: user.avatar || undefined,
        role: user.role,
        status: user.status,
      },
      requireEmailBinding: false,
      requirePhoneBinding: false,
    };
  }

  async register(
    data: RegisterDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.registrationService.register(data, req);
  }

  async refreshToken(token: string): Promise<AuthResponseDto> {
    const result = await this.authTokenService.refreshToken(token);

    const user = await this.prisma.user.findUnique({
      where: { id: result.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: {
              select: {
                permission: true,
              },
            },
          },
        },
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    return {
      ...result,
      user: {
        ...user,
        nickname: user.nickname || undefined,
        avatar: user.avatar || undefined,
        role: user.role,
        status: user.status,
        hasPassword: result.user.hasPassword,
      },
    };
  }

  async getUserInfo(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: {
              select: {
                permission: true,
              },
            },
          },
        },
        status: true,
        phone: true,
        phoneVerified: true,
        wechatId: true,
        provider: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    return {
      ...user,
      nickname: user.nickname || undefined,
      avatar: user.avatar || undefined,
      phone: user.phone || undefined,
    };
  }
}
