import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CsrfProtected } from "../../auth/decorators/csrf-protected.decorator";
import { RequireProjectPermission } from "../../common/decorators/require-project-permission.decorator";
import { ProjectPermission } from "../../common/enums/permissions.enum";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequireProjectPermissionGuard } from "../../common/guards/require-project-permission.guard";
import { IPROJECT_PERMISSION_SERVICE, IProjectPermissionService } from "../../roles/interfaces/project-permission-service.interface";
import { ProjectMemberService } from "../project-member/project-member.service";
import { AddProjectMemberDto } from "../dto/add-project-member.dto";
import { UpdateProjectMemberDto } from "../dto/update-project-member.dto";
import {
  OperationSuccessDto,
  ProjectMemberDto,
  ProjectUserPermissionsDto,
} from "../dto/file-system-response.dto";
import { I18nContext } from 'nestjs-i18n';

@Controller('file-system')
@UseGuards(RequireProjectPermissionGuard, PermissionsGuard)
@ApiTags("文件系统 - 成员")
@ApiBearerAuth()
export class MemberController {
  private readonly logger = new Logger(MemberController.name);

  constructor(
    private readonly projectMemberService: ProjectMemberService,
    @Inject(IPROJECT_PERMISSION_SERVICE) private readonly projectPermissionService: IProjectPermissionService,
  ) {}

  @Get('projects/:projectId/members')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取项目成员列表' })
  @ApiResponse({
    status: 200,
    description: '获取成员列表成功',
    type: [ProjectMemberDto],
  })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限访问该项目' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async getProjectMembers(@Param('projectId') projectId: string) {
    return this.projectMemberService.getProjectMembers(projectId);
  }

  @Post("projects/:projectId/members")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @CsrfProtected()
  @ApiOperation({ summary: "添加项目成员" })
  @ApiResponse({
    status: 201,
    description: "添加成员成功",
    type: ProjectMemberDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限添加成员" })
  @ApiResponse({ status: 404, description: "项目或用户不存在" })
  async addProjectMember(
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
    @Request() req,
  ) {
    const { userId, projectRoleId } = dto;
    return this.projectMemberService.addProjectMember(
      projectId,
      userId,
      projectRoleId,
      req.user.id,
    );
  }

  @Patch("projects/:projectId/members/:userId")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_ASSIGN)
  @CsrfProtected()
  @ApiOperation({ summary: "更新项目成员角色" })
  @ApiResponse({
    status: 200,
    description: "更新成员角色成功",
    type: ProjectMemberDto,
  })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限修改成员角色" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        projectRoleId: { type: "string", description: "项目角色ID" },
        roleId: { type: "string", description: "角色ID（兼容旧字段）" },
        roleName: { type: "string", description: "角色名称" },
      },
    },
  })
  @ApiResponse({ status: 404, description: "项目或成员不存在" })
  async updateProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateProjectMemberDto & { roleId?: string },
    @Request() req,
  ) {
    const projectRoleId = dto.projectRoleId || dto.roleId;
    if (!projectRoleId) {
      throw new BadRequestException(I18nContext.current()?.t('error.file_extra.missing_permission_param') ?? "projectRoleId 或 roleId 不能为空");
    }
    return this.projectMemberService.updateProjectMember(
      projectId,
      userId,
      projectRoleId,
      req.user.id,
    );
  }

  @Delete("projects/:projectId/members/:userId")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @CsrfProtected()
  @ApiOperation({ summary: "移除项目成员" })
  @ApiResponse({
    status: 200,
    description: "移除成员成功",
    type: OperationSuccessDto,
  })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限移除成员" })
  @ApiResponse({ status: 404, description: "项目或成员不存在" })
  @HttpCode(HttpStatus.OK)
  async removeProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    return this.projectMemberService.removeProjectMember(
      projectId,
      userId,
      req.user.id,
    );
  }

  @Post("projects/:projectId/transfer")
  @RequireProjectPermission(ProjectPermission.PROJECT_TRANSFER)
  @CsrfProtected()
  @ApiOperation({ summary: "转移项目所有权" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        newOwnerId: { type: "string", description: "新所有者用户ID" },
      },
      required: ["newOwnerId"],
    },
  })
  @ApiResponse({ status: 200, description: "转移所有权成功" })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限转移项目所有权" })
  @ApiResponse({ status: 404, description: "项目或用户不存在" })
  async transferProject(
    @Param('projectId') projectId: string,
    @Body() body: { newOwnerId: string },
    @Request() req,
  ) {
    return this.projectMemberService.transferProjectOwnership(
      projectId,
      body.newOwnerId,
      req.user.id,
    );
  }

  @Post("projects/:projectId/members/batch")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_MANAGE)
  @CsrfProtected()
  @ApiOperation({ summary: "批量添加项目成员" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        members: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "string", description: "用户ID" },
              projectRoleId: { type: "string", description: "项目角色ID" },
            },
          },
          description: "要添加的成员列表",
        },
      },
      required: ["members"],
    },
  })
  @ApiResponse({ status: 201, description: "批量添加成员成功" })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限添加成员" })
  @ApiResponse({ status: 404, description: "项目不存在" })
  async addProjectMembersBatch(
    @Param('projectId') projectId: string,
    @Body() body: { members: Array<{ userId: string; projectRoleId: string }> },
    @Request() req,
  ) {
    return this.projectMemberService.batchAddProjectMembers(
      projectId,
      body.members,
      req.user.id,
    );
  }

  @Patch("projects/:projectId/members/batch")
  @RequireProjectPermission(ProjectPermission.PROJECT_MEMBER_ASSIGN)
  @CsrfProtected()
  @ApiOperation({ summary: "批量更新项目成员角色" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        members: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "string", description: "用户ID" },
              projectRoleId: { type: "string", description: "项目角色ID" },
            },
          },
          description: "要更新的成员列表",
        },
      },
      required: ["members"],
    },
  })
  @ApiResponse({ status: 200, description: "批量更新成员角色成功" })
  @ApiResponse({ status: 400, description: "请求参数错误" })
  @ApiResponse({ status: 401, description: "未登录" })
  @ApiResponse({ status: 403, description: "无权限修改成员角色" })
  @ApiResponse({ status: 404, description: "项目或成员不存在" })
  async updateProjectMembersBatch(
    @Param('projectId') projectId: string,
    @Body() body: { members: Array<{ userId: string; projectRoleId: string }> },
    @Request() req,
  ) {
    return this.projectMemberService.batchUpdateProjectMembers(
      projectId,
      body.members,
      req.user.id,
    );
  }

  @Get("projects/:projectId/permissions")
  @ApiOperation({
    summary: "获取用户在项目中的权限和角色",
    description: "一次请求返回用户在项目内的全部权限列表和角色，不再需要单独调 check/role 端点",
  })
  @ApiResponse({
    status: 200,
    description: "成功获取用户权限和角色",
    type: ProjectUserPermissionsDto,
  })
  async getUserProjectPermissions(
    @Request() req,
    @Param('projectId') projectId: string,
  ) {
    const [permissions, role] = await Promise.all([
      this.projectPermissionService.getUserPermissions(req.user.id, projectId),
      this.projectPermissionService.getUserRole(req.user.id, projectId),
    ]);

    return {
      projectId,
      userId: req.user.id,
      role,
      permissions,
    };
  }
}
