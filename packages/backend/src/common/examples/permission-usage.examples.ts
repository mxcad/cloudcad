/**
 * CloudCAD 权限系统使用示例
 *
 * 本文件展示了如何在控制器中使用系统权限和项目权限
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
import { NodePermission } from '../decorators/project-permission.decorator';
import { Roles } from '../decorators/roles.decorator';
import { ProjectRole, SystemRole } from '../enums/permissions.enum';
import { NodePermissionGuard } from '../guards/project-permission.guard';
import { RolesGuard } from '../guards/roles.guard';

// ===== 示例1: 基于用户角色的权限控制 =====
@Controller('example/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserPermissionExampleController {
  // 只有管理员可以访问
  @Get('admin-only')
  @Roles(SystemRole.ADMIN)
  adminOnlyEndpoint() {
    return { message: '只有管理员可以访问此接口' };
  }

  // 管理员和普通用户都可以访问
  @Get('user-or-admin')
  @Roles(SystemRole.USER, SystemRole.ADMIN)
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
  @Roles(SystemRole.USER, SystemRole.ADMIN)
  createProject(@Request() req, @Body() projectData: any) {
    return {
      message: '创建项目成功',
      userId: req.user.id,
      projectData,
    };
  }

  // 查看项目详情 - 需要项目成员权限
  @Get(':projectId')
  @UseGuards(NodePermissionGuard)
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.VIEWER
  )
  getProjectDetails(@Param('projectId') projectId: string) {
    return {
      message: '获取项目详情成功',
      projectId,
    };
  }

  // 更新项目 - 需要项目管理权限
  @Patch(':projectId')
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
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
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER)
  deleteProject(@Param('projectId') projectId: string) {
    return {
      message: '项目删除成功',
      projectId,
    };
  }

  // 管理项目成员 - 需要项目管理权限
  @Post(':projectId/members')
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  addProjectMember(
    @Param('projectId') projectId: string,
    @Body() memberData: { userId: string; role: ProjectRole }
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
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
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
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER)
  getFile(@Param('fileId') fileId: string) {
    return {
      message: '获取文件信息成功',
      fileId,
    };
  }

  // 下载文件 - 需要文件读取权限
  @Get(':fileId/download')
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER, ProjectRole.EDITOR, ProjectRole.VIEWER)
  downloadFile(@Param('fileId') fileId: string) {
    return {
      message: '文件下载成功',
      fileId,
    };
  }

  // 编辑文件 - 需要文件编辑权限
  @Patch(':fileId')
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER, ProjectRole.EDITOR)
  updateFile(@Param('fileId') fileId: string, @Body() updateData: any) {
    return {
      message: '文件更新成功',
      fileId,
      updateData,
    };
  }

  // 删除文件 - 只有文件所有者可以操作
  @Delete(':fileId')
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER)
  deleteFile(@Param('fileId') fileId: string) {
    return {
      message: '文件删除成功',
      fileId,
    };
  }

  // 分享文件给其他用户 - 需要文件管理权限
  @Post(':fileId/share')
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER, ProjectRole.EDITOR)
  shareFile(
    @Param('fileId') fileId: string,
    @Body() shareData: { userId: string; role: ProjectRole }
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
  @Roles(SystemRole.ADMIN) // 首先检查用户角色
  @UseGuards(NodePermissionGuard) // 然后检查项目权限
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  performAdminAction(@Param('projectId') projectId: string) {
    return {
      message: '管理员操作执行成功',
      projectId,
      requires: ['ADMIN role', 'Project OWNER or ADMIN'],
    };
  }

  // 批量文件操作 - 需要项目权限和文件权限
  @Post('projects/:projectId/batch-operation')
  @UseGuards(NodePermissionGuard)
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
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
 * 1. 用户角色权限（系统权限）：
 *    - @Roles(SystemRole.ADMIN) - 只有管理员
 *    - @Roles(SystemRole.USER, SystemRole.ADMIN) - 普通用户和管理员
 *
 * 2. 项目权限：
 *    - @NodePermission(ProjectRole.OWNER) - 项目所有者
 *    - @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN) - 所有者和管理员
 *    - @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.VIEWER) - 所有成员
 *
 * 3. 权限检查顺序：
 *    - 首先检查JWT认证
 *    - 然后检查用户角色（如果指定了@Roles）
 *    - 最后检查项目权限
 *
 * 4. 项目ID获取：
 *    - 项目ID从请求参数、查询参数或请求体中自动提取
 *
 * 5. 权限类型：
 *    - 系统权限：用于后台管理功能（用户管理、角色管理、字体管理等）
 *    - 项目权限：用于项目和文件管理功能，与系统权限完全解耦
 */
