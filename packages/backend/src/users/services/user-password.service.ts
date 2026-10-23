import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PASSWORD_HASHER, IPasswordHasher } from '../interfaces/password-hasher.interface';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { isAdminRole } from '../../common/enums/permissions.enum';
import { PasswordPolicyService } from '../../auth/services/password-policy.service';
import { MfaService } from '../../auth/services/mfa.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
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
    // MfaService 由 global 的 AuthModule 导出（同 PasswordPolicyService 先例），免循环依赖
    private readonly mfaService: MfaService,
    private readonly runtimeConfigService: RuntimeConfigService,
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
    newPassword: string,
    totpCode?: string
  ): Promise<{ message: string }> {
    // 审计用：区分"修改密码/首次设置密码"（失败记录也需要，故提升到 try 外）
    let hasPassword = false;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          password: true,
          totpEnabled: true,
          role: { select: { name: true } },
        },
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

      // TOTP step-up（#415）：管理员开启双因素总闸且已绑定时，改密须额外验证动态码。
      // TOTP 只守登录一步，不守「账号控制」一步——攻击者持有密码 + 有效会话即可绕过
      // 第二因子改密，永久接管账号并踢掉其余会话。未绑定管理员已被锁在绑定页且无码可给，
      // 不要求（改密在其解锁白名单内，要求会死锁）。
      const mfaEnforceEnabled =
        await this.runtimeConfigService.getValue<boolean>('mfaEnforceEnabled');
      if (mfaEnforceEnabled && isAdminRole(user.role?.name) && user.totpEnabled) {
        if (!totpCode) {
          throw new UnauthorizedException(
            I18nContext.current()?.t('error.mfa.required') ??
              '请输入双因素认证动态码'
          );
        }
        if (!(await this.mfaService.verifyCode(userId, totpCode))) {
          this.logger.warn(
            `管理员改密被拒 - TOTP 动态码错误: ${user.email ?? userId}`
          );
          throw new UnauthorizedException(
            I18nContext.current()?.t('error.mfa.code_invalid') ??
              '双因素认证动态码错误，请重试'
          );
        }
      }

      // 口令策略校验（#416 等保 8.1.4.1 a)/b)）：复杂度 + 弱口令黑名单
      await this.passwordPolicyService.assertPasswordPolicy(newPassword);

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
      await this.auditLogService.log({
        action: AuditAction.USER_CHANGE_PASSWORD,
        resourceType: ResourceType.USER,
        resourceId: userId,
        userId,
        success: true,
        resourceName: user.email ?? userId,
        params: { changeType: hasPassword ? 'change' : 'set' },
      });

      return {
        message: `密码${hasPassword ? '修改' : '设置'}成功，请重新登录`,
      };
    } catch (error) {
      // 失败也记（密码错误/验证失败等尝试有审查价值），写库失败不阻塞业务
      await this.auditLogService.log({
        action: AuditAction.USER_CHANGE_PASSWORD,
        resourceType: ResourceType.USER,
        resourceId: userId,
        userId,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        resourceName: userId,
        params: { changeType: hasPassword ? 'change' : 'set' },
      });
      this.logger.error(`用户密码修改失败：${error.message}`, error.stack);
      throw error;
    }
  }
}
