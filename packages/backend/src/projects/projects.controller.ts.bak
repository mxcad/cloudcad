import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectPermission } from '../common/decorators/project-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ProjectMemberRole, UserRole } from '../common/enums/permissions.enum';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req, @Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(req.user.id, createProjectDto);
  }

  @Get()
  @Roles(UserRole.USER, UserRole.ADMIN)
  findAll(@Request() req) {
    return this.projectsService.findAll(req.user.id);
  }

  @Get(':projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(
    ProjectMemberRole.OWNER,
    ProjectMemberRole.ADMIN,
    ProjectMemberRole.MEMBER,
    ProjectMemberRole.VIEWER
  )
  findOne(@Param('projectId') projectId: string) {
    return this.projectsService.findOne(projectId);
  }

  @Patch(':projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN)
  update(@Param('projectId') projectId: string, @Body() updateProjectDto: any) {
    return this.projectsService.update(projectId, updateProjectDto);
  }

  @Delete(':projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('projectId') projectId: string) {
    return this.projectsService.remove(projectId);
  }

  @Post(':projectId/members')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN)
  addMember(
    @Param('projectId') projectId: string,
    @Body() memberData: { userId: string; role: string }
  ) {
    return this.projectsService.addMember(projectId, memberData);
  }

  @Get(':projectId/members')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(
    ProjectMemberRole.OWNER,
    ProjectMemberRole.ADMIN,
    ProjectMemberRole.MEMBER,
    ProjectMemberRole.VIEWER
  )
  getMembers(@Param('projectId') projectId: string) {
    return this.projectsService.getMembers(projectId);
  }

  @Patch(':projectId/members/:userId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN)
  updateMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body('role') role: string
  ) {
    return this.projectsService.updateMember(projectId, userId, role);
  }

  @Delete(':projectId/members/:userId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  removeMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string
  ) {
    return this.projectsService.removeMember(projectId, userId);
  }
}
