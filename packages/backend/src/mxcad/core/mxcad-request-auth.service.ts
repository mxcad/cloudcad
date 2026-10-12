import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { I18nContext } from 'nestjs-i18n';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import type { MxCadRequest } from '../types/request.types';

/** 宽松解析结果：请求方对应的 ACTIVE 用户身份。 */
export interface MxCadResolvedUser {
  userId: string;
  userRole: string | null;
}

/**
 * MxCAD 请求的授权用户解析与节点访问判定（单一事实源）。
 *
 * 此前「请求 → 授权 userId」有三份形状：MxCadRequestContextBuilder
 * .validateTokenAndGetUserId（Bearer-only）、ExtRefValidatorService
 * .validateTokenAndGetUserId（session 优先 + Bearer）、以及
 * buildContextFromRequest 的内联变体（失败降级匿名）；`checkFileAccessPermission`
 * 另存两份，且第三参恒等于 userId（调用点全传 `node.id, userId, userId`）。
 * 这两组能力当时挂在 I_EXTERNAL_REF_FACADE 后面，导致非外部参照的消费者
 * （mxcad-file-access）为做一次普通鉴权必须先注入外部参照 DI token。
 */
@Injectable()
export class MxCadRequestAuthService {
  private readonly logger = new Logger(MxCadRequestAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly permissionService: FileSystemPermissionService,
  ) {}

  /**
   * 严格模式：解析出 ACTIVE 用户的 userId。session 用户优先，其次 Bearer。
   * 无凭据 / token 无效 / 用户不存在 / 用户被禁用 → 抛 UnauthorizedException。
   */
  async resolveUserId(request: MxCadRequest): Promise<string> {
    const subjectId = request.user?.id ?? (await this.subjectIdFromBearer(request));
    return (await this.assertActiveUser(subjectId)).id;
  }

  /**
   * 宽松模式：解析出 ACTIVE 用户身份；无凭据 / 用户不存在 / 用户被禁用返回 null
   * （由调用方降级为匿名）。token 本身无效或过期仍向上抛——与
   * buildContextFromRequest 既有语义一致，TokenExpiredError 不静默吞掉。
   */
  async resolveUserOrGuest(request: MxCadRequest): Promise<MxCadResolvedUser | null> {
    const authorization = request.headers.authorization;
    if (!authorization) return null;

    const token = authorization.replace('Bearer ', '');
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token) as { sub: string };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`JWT 验证失败，降级为匿名访问: ${(error as Error).message}`);
      return null;
    }

    try {
      const user = await this.assertActiveUser(payload.sub);
      return { userId: user.id, userRole: user.roleId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`解析用户失败，降级为匿名访问: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 节点访问角色判定。原 `checkFileAccessPermission(nodeId, userId, checkUserId)`
   * 的第三参恒等于 userId，已删除该死参。
   */
  async canAccessNode(userId: string, nodeId: string): Promise<boolean> {
    try {
      const role = await this.permissionService.getNodeAccessRole(userId, nodeId);
      return role !== null;
    } catch (error) {
      this.logger.error(`检查文件访问权限失败: ${(error as Error).message}`, error);
      return false;
    }
  }

  /** Bearer token → subject id；缺失或无效抛 UnauthorizedException。 */
  private async subjectIdFromBearer(request: MxCadRequest): Promise<string> {
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.missing_auth_header') ??
          '缺少Authorization header'
      );
    }

    const token = authorization.replace('Bearer ', '');
    try {
      return (this.jwtService.verify(token) as { sub: string }).sub;
    } catch {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.jwt_invalid') ?? 'JWT token无效或已过期'
      );
    }
  }

  /** subject id → ACTIVE 用户；不存在或已禁用抛 UnauthorizedException（文案区分）。 */
  private async assertActiveUser(subjectId: string): Promise<{
    id: string;
    roleId: string | null;
  }> {
    const userData = await this.fileSystemNodeService.findUserById(subjectId, {
      id: true,
      roleId: true,
      status: true,
    });

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

    return { id: userData.id, roleId: userData.roleId ?? null };
  }
}
