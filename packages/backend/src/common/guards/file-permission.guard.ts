import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FILE_PERMISSION_KEY } from '../decorators/file-permission.decorator';
import { FileAccessRole } from '../enums/permissions.enum';
import { PermissionCacheService } from '../services/permission-cache.service';
import {
  PermissionService,
  UserWithPermissions,
} from '../services/permission.service';

@Injectable()
export class FilePermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
    private cacheService: PermissionCacheService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<FileAccessRole[]>(
      FILE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles) {
      return true; // 没有文件权限要求，允许访问
    }

    const request = context.switchToHttp().getRequest();
    const user: UserWithPermissions = request.user;

    if (!user) {
      throw new ForbiddenException('用户未认证');
    }

    // 从请求参数中获取文件ID
    const fileId = this.extractFileId(request);
    if (!fileId) {
      throw new BadRequestException('缺少文件ID参数');
    }

    // 先检查缓存
    const cachedRole = this.cacheService.getFileAccessRole(user.id, fileId);
    if (cachedRole && requiredRoles.includes(cachedRole)) {
      request.fileId = fileId;
      return true;
    }

    const hasPermission = await this.permissionService.hasFileRole(
      user,
      fileId,
      requiredRoles
    );

    if (!hasPermission) {
      throw new ForbiddenException('用户没有足够的文件权限');
    }

    // 将文件信息添加到请求中，供后续使用
    request.fileId = fileId;
    return true;
  }

  private extractFileId(request: any): string | null {
    // 从路由参数中获取
    if (request.params?.fileId !== undefined && request.params?.fileId !== null) {
      return request.params.fileId;
    }

    // 从查询参数中获取
    if (request.query?.fileId !== undefined && request.query?.fileId !== null) {
      return request.query.fileId;
    }

    // 从请求体中获取
    if (request.body?.fileId !== undefined && request.body?.fileId !== null) {
      return request.body.fileId;
    }

    // 从请求体中的files数组获取（批量操作）
    if (request.body?.files?.length > 0) {
      return request.body.files[0]; // 返回第一个文件ID用于权限检查
    }

    return null;
  }
}
