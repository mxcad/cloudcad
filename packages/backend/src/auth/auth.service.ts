import { Injectable, Logger, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';
import { TokenBlacklistService } from './services/token-blacklist.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, username, password, nickname } = registerDto;

    // 检查邮箱是否已存在
    const existingUserByEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUserByEmail) {
      throw new ConflictException('邮箱已被注册');
    }

    // 检查用户名是否已存在
    const existingUserByUsername = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUserByUsername) {
      throw new ConflictException('用户名已被使用');
    }

    // 密码哈希
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        nickname: nickname || username,
      },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        role: true,
        status: true,
      },
    });

    // 生成Token
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
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { account, password } = loginDto;
    
    this.logger.log(`用户登录尝试: ${account}`);

    // 查找用户（支持邮箱或用户名登录）
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
        role: true,
        status: true,
        password: true,
      },
    });

    if (!user) {
      this.logger.warn(`登录失败 - 用户不存在: ${account}`);
      throw new UnauthorizedException('账号或密码错误');
    }

    if (user.status !== 'ACTIVE') {
      this.logger.warn(`登录失败 - 账号已禁用: ${account} (状态: ${user.status})`);
      throw new UnauthorizedException('账号已被禁用');
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`登录失败 - 密码错误: ${account}`);
      throw new UnauthorizedException('账号或密码错误');
    }

    // 移除密码字段
    const { password: _, ...userWithoutPassword } = user;

    // 生成Token
    const tokens = await this.generateTokens(userWithoutPassword);

    this.logger.log(`用户登录成功: ${account} (ID: ${user.id}, 角色: ${user.role})`);

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
      // 验证刷新Token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as any;

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('无效的刷新Token');
      }

      // 验证刷新Token是否存在于数据库中且未过期
      const isValidRefreshToken = await this.validateRefreshToken(
        refreshToken,
        payload.sub
      );
      if (!isValidRefreshToken) {
        throw new UnauthorizedException('刷新Token无效或已过期');
      }

      // 查找用户
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('用户不存在或已被禁用');
      }

      // 生成新的Token
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
      // 将用户添加到黑名单，这样该用户的所有Token都会失效
      await this.tokenBlacklistService.blacklistUserTokens(userId);

      // 删除用户的所有刷新Token
      await this.deleteAllRefreshTokens(userId);
    } catch (error) {
      throw new UnauthorizedException('登出失败');
    }
  }

  /**
   * 撤销特定的Token
   * @param token 要撤销的Token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      // 验证Token并获取过期时间
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as any;

      // 计算Token剩余有效时间
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.exp - now;

      if (expiresIn > 0) {
        // 将Token添加到黑名单
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
      // 计算Token过期时间
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as any;

      const expiresAt = new Date(payload.exp * 1000);

      // 先删除该用户的旧刷新Token
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      // 存储新的刷新Token
      await this.prisma.refreshToken.create({
        data: {
          token,
          userId,
          expiresAt,
        },
      });
    } catch (error) {
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

  private async generateTokens(user: any): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };

    const accessPayload = {
      ...payload,
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

    // 持久化刷新Token到数据库
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
        role: true,
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
}
