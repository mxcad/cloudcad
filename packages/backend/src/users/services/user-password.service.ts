import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PASSWORD_HASHER, IPasswordHasher } from '../interfaces/password-hasher.interface';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { PasswordPolicyService } from '../../auth/services/password-policy.service';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class UserPasswordService {
  private readonly logger = new Logger(UserPasswordService.name);

  constructor(
    private readonly prisma: DatabaseService,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly auditLogService: AuditLogService,
    private readonly passwordPolicyService: PasswordPolicyService,
  ) {}

  async validatePassword(
    plainPassword: string,
    hashedPassword: string
  ): Promise<boolean> {
    return this.passwordHasher.compare(plainPassword, hashedPassword);
  }

  async changePassword(
    userId: string,
    oldPassword: string | undefined,
    newPassword: string
  ): Promise<{ message: string }> {
    // 审计用：区分"修改密码/首次设置密码"（失败记录也需要，故提升到 try 外）
    let hasPassword = false;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, password: true },
      });

      if (!user) {
        throw new NotFoundException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      }

      hasPassword = !!user.password;

      if (hasPassword) {
        if (!oldPassword) {
          throw new BadRequestException(I18nContext.current()?.t('error.auth.password_required') ?? '请输入当前密码');
        }
        const isPasswordValid = await this.passwordHasher.compare(
          oldPassword,
          user.password
        );
        if (!isPasswordValid) {
          throw new ConflictException(I18nContext.current()?.t('error.auth.password_incorrect') ?? '当前密码不正确');
        }
      }

      // 口令策略校验（#416 等保 8.1.4.1 a)/b)）：复杂度 + 弱口令黑名单
      this.passwordPolicyService.assertPasswordPolicy(newPassword);

      const hashedPassword = await this.passwordHasher.hash(newPassword);

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          // 记录口令修改时间（#416）
          passwordChangedAt: new Date(),
        },
      });

      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
      this.logger.log(`已删除用户的所有刷新令牌：${user.email}`);

      this.logger.log(`用户密码${hasPassword ? '修改' : '设置'}成功：${user.email}`);

      // 账号安全审计：修改密码成功（操作者即目标用户本人）
      await this.auditLogService.log(
        AuditAction.USER_CHANGE_PASSWORD,
        ResourceType.USER,
        userId,
        userId,
        true,
        undefined,
        undefined,
        undefined,
        user.email ?? userId,
        { changeType: hasPassword ? 'change' : 'set' }
      );

      return {
        message: `密码${hasPassword ? '修改' : '设置'}成功，请重新登录`,
      };
    } catch (error) {
      // 失败也记（密码错误/验证失败等尝试有审查价值），写库失败不阻塞业务
      await this.auditLogService.log(
        AuditAction.USER_CHANGE_PASSWORD,
        ResourceType.USER,
        userId,
        userId,
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        undefined,
        userId,
        { changeType: hasPassword ? 'change' : 'set' }
      );
      this.logger.error(`用户密码修改失败：${error.message}`, error.stack);
      throw error;
    }
  }
}
