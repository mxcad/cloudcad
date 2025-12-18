/**
 * CloudCAD 权限系统使用示例
 *
 * 本文件展示了如何在控制器中使用三层权限系统
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FilePermission } from '../decorators/file-permission.decorator';
import { ProjectPermission } from '../decorators/project-permission.decorator';
import { Roles } from '../decorators/roles.decorator';
import {
  FileAccessRole,
  ProjectMemberRole,
  UserRole,
} from '../enums/permissions.enum';
import { FilePermissionGuard } from '../guards/file-permission.guard';
import { ProjectPermissionGuard } from '../guards/project-permission.guard';
import { RolesGuard } from '../guards/roles.guard';

// ===== 示例1: 基于用户角色的权限控制 =====
@Controller('example/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserPermissionExampleController {
  // 只有管理员可以访问
  @Get('admin-only')
  @Roles(UserRole.ADMIN)
  adminOnlyEndpoint() {
    return { message: '只有管理员可以访问此接口' };
  }

  // 管理员和普通用户都可以访问
  @Get('user-or-admin')
  @Roles(UserRole.USER, UserRole.ADMIN)
  userOrAdminEndpoint() {
    return { message: '管理员和普通用户都可以访问此接口' };
  }

  // 所有认证用户都可以访问（不指定角色要求）
  @Get('all-users')
  allAuthenticatedUsers() {
    return { message: '所有认证用户都可以访问' };
  }
}

// ===== 示例2: 项目级权限控制 =====
@Controller('example/projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectPermissionExampleController {
  // 创建项目 - 需要用户角色
  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN)
  createProject(@Request() req, @Body() projectData: any) {
    return {
      message: '创建项目成功',
      userId: req.user.id,
      projectData,
    };
  }

  // 查看项目详情 - 需要项目成员权限
  @Get(':projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(
    ProjectMemberRole.OWNER,
    ProjectMemberRole.ADMIN,
    ProjectMemberRole.MEMBER,
    ProjectMemberRole.VIEWER
  )
  getProjectDetails(@Param('projectId') projectId: string) {
    return {
      message: '获取项目详情成功',
      projectId,
    };
  }

  // 更新项目 - 需要项目管理权限
  @Patch(':projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN)
  updateProject(
    @Param('projectId') projectId: string,
    @Body() updateData: any
  ) {
    return {
      message: '项目更新成功',
      projectId,
      updateData,
    };
  }

  // 删除项目 - 只有项目所有者可以操作
  @Delete(':projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER)
  deleteProject(@Param('projectId') projectId: string) {
    return {
      message: '项目删除成功',
      projectId,
    };
  }

  // 管理项目成员 - 需要项目管理权限
  @Post(':projectId/members')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN)
  addProjectMember(
    @Param('projectId') projectId: string,
    @Body() memberData: { userId: string; role: ProjectMemberRole }
  ) {
    return {
      message: '项目成员添加成功',
      projectId,
      memberData,
    };
  }
}

// ===== 示例3: 文件级权限控制 =====
@Controller('example/files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilePermissionExampleController {
  // 上传文件到项目 - 需要项目写入权限
  @Post('upload/:projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(
    ProjectMemberRole.OWNER,
    ProjectMemberRole.ADMIN,
    ProjectMemberRole.MEMBER
  )
  uploadFileToProject(
    @Request() req,
    @Param('projectId') projectId: string,
    @Body() fileData: any
  ) {
    return {
      message: '文件上传成功',
      projectId,
      userId: req.user.id,
      fileData,
    };
  }

  // 查看文件 - 需要文件读取权限
  @Get(':fileId')
  @UseGuards(FilePermissionGuard)
  @FilePermission(
    FileAccessRole.OWNER,
    FileAccessRole.EDITOR,
    FileAccessRole.VIEWER
  )
  getFile(@Param('fileId') fileId: string) {
    return {
      message: '获取文件信息成功',
      fileId,
    };
  }

  // 下载文件 - 需要文件读取权限
  @Get(':fileId/download')
  @UseGuards(FilePermissionGuard)
  @FilePermission(
    FileAccessRole.OWNER,
    FileAccessRole.EDITOR,
    FileAccessRole.VIEWER
  )
  downloadFile(@Param('fileId') fileId: string) {
    return {
      message: '文件下载成功',
      fileId,
    };
  }

  // 编辑文件 - 需要文件编辑权限
  @Patch(':fileId')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER, FileAccessRole.EDITOR)
  updateFile(@Param('fileId') fileId: string, @Body() updateData: any) {
    return {
      message: '文件更新成功',
      fileId,
      updateData,
    };
  }

  // 删除文件 - 只有文件所有者可以操作
  @Delete(':fileId')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER)
  deleteFile(@Param('fileId') fileId: string) {
    return {
      message: '文件删除成功',
      fileId,
    };
  }

  // 分享文件给其他用户 - 需要文件管理权限
  @Post(':fileId/share')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER, FileAccessRole.EDITOR)
  shareFile(
    @Param('fileId') fileId: string,
    @Body() shareData: { userId: string; role: FileAccessRole }
  ) {
    return {
      message: '文件分享成功',
      fileId,
      shareData,
    };
  }
}

// ===== 示例4: 复合权限控制 =====
@Controller('example/complex')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplexPermissionExampleController {
  // 复杂权限检查：用户角色 + 项目权限
  @Post('projects/:projectId/admin-actions')
  @Roles(UserRole.ADMIN) // 首先检查用户角色
  @UseGuards(ProjectPermissionGuard) // 然后检查项目权限
  @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN)
  performAdminAction(@Param('projectId') projectId: string) {
    return {
      message: '管理员操作执行成功',
      projectId,
      requires: ['ADMIN role', 'Project OWNER or ADMIN'],
    };
  }

  // 批量文件操作 - 需要项目权限和文件权限
  @Post('projects/:projectId/batch-operation')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN)
  batchFileOperation(
    @Param('projectId') projectId: string,
    @Body() operationData: { fileIds: string[]; operation: string }
  ) {
    // 在实际实现中，这里还需要检查每个文件的权限
    return {
      message: '批量操作执行成功',
      projectId,
      fileCount: operationData.fileIds.length,
      operation: operationData.operation,
    };
  }
}

/**
 * 权限系统使用说明：
 *
 * 1. 用户角色权限：
 *    - @Roles(UserRole.ADMIN) - 只有管理员
 *    - @Roles(UserRole.USER, UserRole.ADMIN) - 普通用户和管理员
 *
 * 2. 项目权限：
 *    - @ProjectPermission(ProjectMemberRole.OWNER) - 项目所有者
 *    - @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN) - 所有者和管理员
 *    - @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN, ProjectMemberRole.MEMBER, ProjectMemberRole.VIEWER) - 所有成员
 *
 * 3. 文件权限：
 *    - @FilePermission(FileAccessRole.OWNER) - 文件所有者
 *    - @FilePermission(FileAccessRole.OWNER, FileAccessRole.EDITOR) - 所有者和编辑者
 *    - @FilePermission(FileAccessRole.OWNER, FileAccessRole.EDITOR, FileAccessRole.VIEWER) - 所有有权限的用户
 *
 * 4. 权限检查顺序：
 *    - 首先检查JWT认证
 *    - 然后检查用户角色（如果指定了@Roles）
 *    - 最后检查资源权限（项目或文件）
 *
 * 5. 资源ID获取：
 *    - 项目ID从请求参数、查询参数或请求体中自动提取
 *    - 文件ID从请求参数、查询参数或请求体中自动提取
 */
