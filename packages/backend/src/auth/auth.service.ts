import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { EmailVerificationService } from './services/email-verification.service';
import { InitializationService } from '../common/services/initialization.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService,
    private emailVerificationService: EmailVerificationService,
    private initializationService: InitializationService,
    @InjectRedis() private readonly redis: Redis
  ) {}

  async register(
    registerDto: RegisterDto
  ): Promise<{ message: string; email: string }> {
    const { email, username, password, nickname } = registerDto;

    const existingUserByEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUserByEmail) {
      throw new ConflictException('邮箱已被注册');
    }

    const existingUserByUsername = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUserByUsername) {
      throw new ConflictException('用户名已被使用');
    }

    const registerKey = `register:pending:${email}`;
    await this.redis.setex(
      registerKey,
      15 * 60,
      JSON.stringify({
        email,
        username,
        password,
        nickname: nickname || username,
      })
    );

    try {
      await this.emailVerificationService.sendVerificationEmail(email);
      this.logger.log(`验证码已发送: ${email}`);
    } catch (error) {
      this.logger.error(`发送验证码失败: ${error.message}`);
      await this.redis.del(registerKey);
      throw new Error('发送验证码失败，请稍后重试');
    }

    return {
      message: '验证码已发送到您的邮箱，请查收并完成验证',
      email: email,
    };
  }

  async verifyEmailAndActivate(
    email: string,
    code: string
  ): Promise<{ message: string }> {
    this.logger.log(`开始验证邮箱: ${email}`);

    const isValid = await this.emailVerificationService.verifyEmail(
      email,
      code
    );

    if (!isValid) {
      this.logger.error(`验证码验证失败: ${email}`);
      throw new Error('验证码验证失败');
    }

    this.logger.log(`验证码验证成功: ${email}`);

    const registerKey = `register:pending:${email}`;
    const registerDataStr = await this.redis.get(registerKey);

    this.logger.log(`Redis 注册信息: ${registerDataStr ? '存在' : '不存在'}`);

    if (!registerDataStr) {
      this.logger.error(`注册信息已过期: ${email}`);
      throw new Error('注册信息已过期，请重新注册');
    }

    const registerData = JSON.parse(registerDataStr);
    this.logger.log(`解析注册信息成功: ${registerData.username}`);

    const hashedPassword = await bcrypt.hash(registerData.password, 12);
    this.logger.log(`密码加密完成`);

    // 获取默认角色（USER）
    const defaultRole = await this.prisma.role.findFirst({
      where: { name: 'USER' },
    });

    if (!defaultRole) {
      throw new Error('默认角色不存在');
    }

    await this.prisma.user.create({
      data: {
        email: registerData.email,
        username: registerData.username,
        password: hashedPassword,
        nickname: registerData.nickname,
        roleId: defaultRole.id,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    this.logger.log(`用户创建成功: ${email}`);

    await this.redis.del(registerKey);

    return {
      message: '邮箱验证成功，账号已创建',
    };
  }

  async login(loginDto: LoginDto, req?: any): Promise<AuthResponseDto> {
    const { account, password } = loginDto;

    this.logger.log(`用户登录尝试: ${account}`);

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: account }, { username: account }],
      },
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
        emailVerified: true,
        password: true,
      },
    });

    if (!user) {
      this.logger.warn(`登录失败 - 用户不存在: ${account}`);
      throw new UnauthorizedException('账号或密码错误');
    }

    if (user.status !== 'ACTIVE') {
      if (user.status === 'INACTIVE' && !user.emailVerified) {
        this.logger.warn(`登录失败 - 邮箱未验证: ${account}`);
        throw new UnauthorizedException('请先验证邮箱后再登录');
      }
      this.logger.warn(
        `登录失败 - 账号已禁用: ${account} (状态: ${user.status})`
      );
      throw new UnauthorizedException('账号已被禁用');
    }

    if (!user.emailVerified) {
      this.logger.warn(`登录失败 - 邮箱未验证: ${account}`);
      throw new UnauthorizedException('请先验证邮箱后再登录');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`登录失败 - 密码错误: ${account}`);
      throw new UnauthorizedException('账号或密码错误');
    }

    const { password: _, ...userWithoutPassword } = user;

    const tokens = await this.generateTokens(userWithoutPassword);

    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role.name;
      req.session.userEmail = user.email;
      this.logger.log(
        `Session 已设置: userId=${user.id}, role=${user.role.name}`
      );
    }

    this.logger.log(
      `用户登录成功: ${account} (ID: ${user.id}, 角色: ${user.role.name})`
    );

    return {
      ...tokens,
      user: {
        ...userWithoutPassword,
        nickname: userWithoutPassword.nickname || undefined,
        avatar: userWithoutPassword.avatar || undefined,
        role: userWithoutPassword.role,
        status: userWithoutPassword.status,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as any;

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('无效的刷新Token');
      }

      const isValidRefreshToken = await this.validateRefreshToken(
        refreshToken,
        payload.sub
      );
      if (!isValidRefreshToken) {
        throw new UnauthorizedException('刷新Token无效或已过期');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
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

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('用户不存在或已被禁用');
      }

      const tokens = await this.generateTokens(user);

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
    } catch (error) {
      throw new UnauthorizedException('无效的刷新Token');
    }
  }

  async logout(userId: string): Promise<void> {
    try {
      await this.deleteAllRefreshTokens(userId);
      this.logger.log(`用户退出登录，已删除刷新令牌: ${userId}`);
    } catch (error) {
      this.logger.error(`登出失败: ${error.message}`);
      throw new UnauthorizedException('登出失败');
    }
  }

  /**
   * 撤销特定的Token
   * @param token 要撤销的Token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as any;

      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.exp - now;

      if (expiresIn > 0) {
        await this.tokenBlacklistService.addToBlacklist(token, expiresIn);
      }
    } catch (error) {
      throw new UnauthorizedException('无效的Token');
    }
  }

  /**
   * 存储刷新Token到数据库
   * @param userId 用户ID
   * @param token 刷新Token
   */
  private async storeRefreshToken(
    userId: string,
    token: string
  ): Promise<void> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as any;

      const expiresAt = new Date(payload.exp * 1000);

      // 先删除该用户的所有旧 tokens，确保只有一个活跃的 refresh token
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      // 创建新的 refresh token
      await this.prisma.refreshToken.create({
        data: {
          token,
          userId,
          expiresAt,
        },
      });
    } catch (error) {
      // 如果是唯一约束冲突，说明并发请求导致的重复创建
      // 这种情况下，忽略错误，因为至少有一个请求成功创建了 token
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        this.logger.warn(`并发刷新 token 冲突，已忽略: ${error.message}`);
        return;
      }
      throw new UnauthorizedException('Token存储失败');
    }
  }

  /**
   * 验证刷新Token是否存在于数据库中
   * @param token 刷新Token
   * @param userId 用户ID
   */
  async validateRefreshToken(token: string, userId: string): Promise<boolean> {
    try {
      const refreshToken = await this.prisma.refreshToken.findFirst({
        where: {
          token,
          userId,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      return !!refreshToken;
    } catch (error) {
      return false;
    }
  }

  /**
   * 删除用户的所有刷新Token
   * @param userId 用户ID
   */
  async deleteAllRefreshTokens(userId: string): Promise<void> {
    try {
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
    } catch (error) {
      throw new UnauthorizedException('删除刷新Token失败');
    }
  }

  async generateTokens(user: any): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    // Access Token payload 包含用户基本信息和角色名称
    // 这样 JwtStrategy 就不需要每次都查询数据库
    const accessPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role?.name || 'USER',
      type: 'access',
    };

    const refreshPayload = {
      sub: user.id,
      type: 'refresh',
    };

    const jwtSecret = this.configService.get<string>('jwt.secret');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: jwtSecret,
        expiresIn: this.configService.get<string>('jwt.expiresIn', '1h') as any,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: jwtSecret,
        expiresIn: this.configService.get<string>(
          'jwt.refreshExpiresIn',
          '7d'
        ) as any,
      }),
    ]);

    await this.storeRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
    };
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        role: {
          include: {
            permissions: true,
          },
        },
        status: true,
        password: true,
      },
    });

    if (user && user.status === 'ACTIVE') {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (isPasswordValid) {
        const { password: _, ...result } = user;
        return result;
      }
    }
    return null;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    this.logger.log(`忘记密码请求: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('该邮箱未注册');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('账号已被禁用，无法重置密码');
    }

    await this.emailVerificationService.sendVerificationEmail(email);
    this.logger.log(`密码重置验证码已发送: ${email}`);

    return {
      message: '密码重置验证码已发送到您的邮箱',
    };
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<{ message: string }> {
    this.logger.log(`重置密码请求: ${email}`);

    const isValid = await this.emailVerificationService.verifyEmail(
      email,
      code
    );
    if (!isValid) {
      this.logger.error(`验证码验证失败: ${email}`);
      throw new UnauthorizedException('验证码无效或已过期');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    await this.deleteAllRefreshTokens(user.id);
    await this.tokenBlacklistService.removeUserFromBlacklist(user.id);

    this.logger.log(`密码重置成功: ${email}`);

    return {
      message: '密码重置成功，请使用新密码登录',
    };
  }
}
