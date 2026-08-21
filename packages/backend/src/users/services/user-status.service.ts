import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { UserCleanupService } from '../../user-cleanup/user-cleanup.service';
import {
  VERIFICATION_STRATEGIES,
  IAccountVerificationStrategy,
  VerificationParams,
} from '../interfaces/account-verification-strategy.interface';
import { UserLifecycleEventPayload } from '../interfaces/user-lifecycle-event.interface';
import { IUserActionResponse } from '../../common/interfaces/user-service.interface';

import { I18nContext } from 'nestjs-i18n';
import { IRuntimeConfigService } from '@cloudcad/contracts';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';

@Injectable()
export class UserStatusService {
  private readonly logger = new Logger(UserStatusService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly userCleanupService: UserCleanupService,
    @Inject('CONFIG')
    private readonly runtimeConfigService: IRuntimeConfigService,
    @Inject(VERIFICATION_STRATEGIES)
    private readonly verificationStrategies: IAccountVerificationStrategy[],
    private readonly eventEmitter: EventEmitter2,
    private readonly auditLogService: AuditLogService,
  ) {}

  async softDelete(id: string, operatorId?: string) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { id }, include: { role: true },
      });
      if (!existingUser) {
        throw new NotFoundException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      }
      if (existingUser.deletedAt) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.deactivated') ?? '用户已注销');
      }
      if (existingUser.role.name === 'ADMIN') {
        throw new BadRequestException(I18nContext.current()?.t('error.user.cannot_delete_admin') ?? '不能删除管理员账户');
      }
      await this.prisma.user.update({
        where: { id },
        // 管理员软删：不自动恢复（deactivatedBy='ADMIN'），登录保持防枚举拒绝，需管理员手动恢复
        data: { deletedAt: new Date(), status: 'INACTIVE', deactivatedBy: 'ADMIN' },
      });
      this.logger.log(`用户注销成功：${existingUser.email}`);
      // 账号安全审计：管理员软删（操作者=管理员，目标=用户；名称快照入库，写库失败不阻塞业务）
      if (operatorId) {
        await this.auditLogService.log(
          AuditAction.USER_DEACTIVATE,
          ResourceType.USER,
          id,
          operatorId,
          true,
          undefined,
          undefined,
          undefined,
          existingUser.email ?? existingUser.username ?? id,
          { deactivatedBy: 'ADMIN' }
        );
      }
      return { message: (I18nContext.current()?.t('success.user_deactivated_30d_cleanup') ?? '用户已注销，30天后自动清理数据') };
    } catch (error) {
      // 失败也记（写库失败不阻塞业务）
      if (operatorId) {
        await this.auditLogService.log(
          AuditAction.USER_DEACTIVATE,
          ResourceType.USER,
          id,
          operatorId,
          false,
          error instanceof Error ? error.message : String(error),
          undefined,
          undefined,
          id,
          { deactivatedBy: 'ADMIN' }
        );
      }
      this.logger.error(`用户注销失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteImmediately(id: string, operatorId?: string) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { id }, include: { role: true },
      });
      if (!existingUser) {
        throw new NotFoundException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      }
      if (existingUser.deletedAt) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.deactivated') ?? '用户已注销');
      }
      if (existingUser.role.name === 'ADMIN') {
        throw new BadRequestException(I18nContext.current()?.t('error.user.cannot_delete_admin') ?? '不能删除管理员账户');
      }
      await this.userCleanupService.deleteUserCompletely(id);
      this.logger.log(`用户立即注销成功：${existingUser.email}`);
      // 账号安全审计：管理员彻底删除（操作者=管理员，目标=用户；名称快照入库）
      if (operatorId) {
        await this.auditLogService.log(
          AuditAction.USER_DEACTIVATE,
          ResourceType.USER,
          id,
          operatorId,
          true,
          undefined,
          undefined,
          undefined,
          existingUser.email ?? existingUser.username ?? id,
          { deactivatedBy: 'ADMIN', immediate: true }
        );
      }
      return { message: (I18nContext.current()?.t('success.user_deactivated_immediate_cleanup') ?? '用户已立即注销并彻底删除数据') };
    } catch (error) {
      // 失败也记（写库失败不阻塞业务）
      if (operatorId) {
        await this.auditLogService.log(
          AuditAction.USER_DEACTIVATE,
          ResourceType.USER,
          id,
          operatorId,
          false,
          error instanceof Error ? error.message : String(error),
          undefined,
          undefined,
          id,
          { deactivatedBy: 'ADMIN', immediate: true }
        );
      }
      this.logger.error(`用户立即注销失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async restore(id: string): Promise<IUserActionResponse> {
    try {
      const existingUser = await this.prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        throw new NotFoundException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      }
      if (!existingUser.deletedAt) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.not_deactivated_cannot_restore') ?? '用户未注销，无法恢复');
      }
      await this.prisma.user.update({ where: { id }, data: { deletedAt: null, status: 'ACTIVE', deactivatedBy: null } });
      this.logger.log(`用户恢复成功：${existingUser.email}`);
      this.eventEmitter.emit('user.restored', {
        userId: id, email: existingUser.email, timestamp: new Date(),
      } satisfies UserLifecycleEventPayload);
      return { message: (I18nContext.current()?.t('success.user_restored') ?? '用户已恢复') };
    } catch (error) {
      this.logger.error(`用户恢复失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async remove(id: string) {
    try {
      const existingUser = await this.prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        throw new NotFoundException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      }
      await this.userCleanupService.deleteUserCompletely(id);
      this.logger.log(`用户删除成功：${existingUser.email}`);
      return { message: (I18nContext.current()?.t('success.user_deleted') ?? '用户删除成功') };
    } catch (error) {
      this.logger.error(`用户删除失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async deactivate(
    userId: string,
    password?: string,
    phoneCode?: string,
    emailCode?: string,
    wechatCode?: string
  ): Promise<IUserActionResponse> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      }
      if (user.deletedAt) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.already_deactivated') ?? '账户已注销');
      }

      const params: VerificationParams = { password, phoneCode, emailCode, wechatCode };
      const matchingStrategies = this.verificationStrategies.filter((s) => s.canHandle(params));
      if (matchingStrategies.length === 0) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.select_verification_method') ?? '请选择一种验证方式');
      }

      let verified = false;
      for (const strategy of matchingStrategies) {
        if (!strategy.validateUser(user)) {
          throw new BadRequestException(this.getPrerequisiteError(strategy.type));
        }
        const result = await strategy.verify(user, params);
        if (!result.valid) {
          // 业务校验失败用 400：401 会被前端 fetch wrapper 当作凭证失效触发 token 刷新/登出
          throw new BadRequestException(result.message || this.getVerifyFailedError(strategy.type));
        }
        verified = true;
        break;
      }

      if (!verified) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.select_verification_method') ?? '请选择一种验证方式');
      }

      // 自助注销：保留绑定信息（手机/邮箱/微信）以便冷静期内任意渠道登录自动恢复，
      // PII 随 30 天后 userCleanup 彻底删除；deactivatedBy='SELF' 标记冷静期内可自动恢复
      await this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), status: 'INACTIVE', deactivatedBy: 'SELF' },
      });
      await this.prisma.refreshToken.deleteMany({ where: { userId } });

      this.logger.log(`用户账户已注销：${user.email || user.phone}`);
      this.eventEmitter.emit('user.deactivated', {
        userId, email: user.email, username: user.username, timestamp: new Date(),
      } satisfies UserLifecycleEventPayload);

      // 账号安全审计：自助注销成功（操作者=目标用户本人；保留绑定信息待冷静期恢复）
      await this.auditLogService.log(
        AuditAction.USER_DEACTIVATE,
        ResourceType.USER,
        userId,
        userId,
        true,
        undefined,
        undefined,
        undefined,
        user.email ?? user.phone ?? userId,
        { deactivatedBy: 'SELF' }
      );

      return { message: (I18nContext.current()?.t('success.account_deactivated') ?? '账户注销成功') };
    } catch (error) {
      // 失败也记（验证失败尝试有审查价值），写库失败不阻塞业务
      await this.auditLogService.log(
        AuditAction.USER_DEACTIVATE,
        ResourceType.USER,
        userId,
        userId,
        false,
        error instanceof Error ? error.message : String(error),
        undefined,
        undefined,
        userId,
        { deactivatedBy: 'SELF' }
      );
      this.logger.error(`账户注销失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async restoreAccount(
    userId: string,
    verificationMethod: 'password' | 'phoneCode' | 'emailCode',
    code: string
  ) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
      }
      if (!user.deletedAt) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.already_deactivated_cannot_restore') ?? '账户未注销，无需恢复');
      }
      // 仅自助注销可在冷静期内自助恢复；管理员软删需管理员手动恢复
      if (user.deactivatedBy !== 'SELF') {
        throw new BadRequestException(I18nContext.current()?.t('error.user.restore_requires_support') ?? '该账户需联系客服恢复');
      }

      // 冷静期与登录自动恢复一致：读运行时配置 userCancelGraceDays（默认 7 天），逾期需联系客服
      const graceDays = await this.runtimeConfigService.getValue<number>(
        'userCancelGraceDays',
        7
      );
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - graceDays);
      if (user.deletedAt < expiryDate) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.past_cooling_period') ?? '已过冷静期，无法恢复，请联系客服');
      }

      const params: VerificationParams = {};
      if (verificationMethod === 'password') params.password = code;
      else if (verificationMethod === 'phoneCode') params.phoneCode = code;
      else if (verificationMethod === 'emailCode') params.emailCode = code;

      const matching = this.verificationStrategies.filter((s) => s.canHandle(params));
      if (matching.length === 0) {
        throw new BadRequestException(I18nContext.current()?.t('error.user.invalid_verification_method') ?? '验证方式无效');
      }

      const strategy = matching[0];
      if (!strategy.validateUser(user)) {
        throw new BadRequestException(this.getRestorePrerequisiteError(strategy.type));
      }

      const result = await strategy.verify(user, params);
      if (!result.valid) {
        // 业务校验失败用 400：401 会被前端 fetch wrapper 当作凭证失效触发 token 刷新/登出
        throw new BadRequestException(result.message || this.getRestoreVerifyFailedError(strategy.type));
      }

      await this.prisma.user.update({ where: { id: userId }, data: { deletedAt: null, status: 'ACTIVE', deactivatedBy: null } });
      this.logger.log(`用户账户已恢复：${user.email || user.phone}`);
      return { message: (I18nContext.current()?.t('success.account_restored') ?? '账户恢复成功') };
    } catch (error) {
      this.logger.error(`账户恢复失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') {
    try {
      const user = await this.prisma.user.update({
        where: { id }, data: { status },
        select: {
          id: true, email: true, username: true, nickname: true, avatar: true,
          phone: true, phoneVerified: true, role: true, status: true, createdAt: true, updatedAt: true,
        },
      });
      this.logger.log(`用户状态更新成功：${user.email} -> ${status}`);
      return user;
    } catch (error) {
      this.logger.error(`用户状态更新失败：${error.message}`, error.stack);
      throw error;
    }
  }

  private getPrerequisiteError(type: string): string {
    const messages: Record<string, string> = {
      password: '该账户未设置密码，请选择其他验证方式',
      phoneCode: '该账户未绑定手机，请选择其他验证方式',
      emailCode: '该账户未绑定邮箱，请选择其他验证方式',
      wechatCode: '该账户未绑定微信，请选择其他验证方式',
    };
    return messages[type] || '验证条件不满足';
  }

  private getVerifyFailedError(type: string): string {
    const messages: Record<string, string> = {
      password: '密码不正确',
      phoneCode: '验证码不正确',
      emailCode: '邮箱验证码不正确或已过期',
      wechatCode: '微信验证失败',
    };
    return messages[type] || '验证失败';
  }

  private getRestorePrerequisiteError(type: string): string {
    const messages: Record<string, string> = {
      password: '该账户未设置密码',
      phoneCode: '该账户未绑定手机',
      emailCode: '该账户未绑定邮箱',
    };
    return messages[type] || '验证条件不满足';
  }

  private getRestoreVerifyFailedError(type: string): string {
    const messages: Record<string, string> = {
      password: '密码不正确',
      phoneCode: '验证码不正确',
      emailCode: '邮箱验证码不正确或已过期',
    };
    return messages[type] || '验证失败';
  }
}
