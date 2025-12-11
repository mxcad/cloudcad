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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-fastify';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FilePermission } from '../common/decorators/file-permission.decorator';
import { ProjectPermission } from '../common/decorators/project-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  FileAccessRole,
  ProjectMemberRole,
  UserRole,
} from '../common/enums/permissions.enum';
import { FilePermissionGuard } from '../common/guards/file-permission.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FilesService } from './files.service';

@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(
    ProjectMemberRole.OWNER,
    ProjectMemberRole.ADMIN,
    ProjectMemberRole.MEMBER
  )
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  uploadFile(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('projectId') projectId: string
  ) {
    return this.filesService.upload(req.user.id, file, projectId);
  }

  @Get()
  @Roles(UserRole.USER, UserRole.ADMIN)
  findAll(@Request() req) {
    return this.filesService.findAll(req.user.id);
  }

  @Get('project/:projectId')
  @UseGuards(ProjectPermissionGuard)
  @ProjectPermission(
    ProjectMemberRole.OWNER,
    ProjectMemberRole.ADMIN,
    ProjectMemberRole.MEMBER,
    ProjectMemberRole.VIEWER
  )
  findByProject(@Param('projectId') projectId: string) {
    return this.filesService.findByProject(projectId);
  }

  @Get(':fileId')
  @UseGuards(FilePermissionGuard)
  @FilePermission(
    FileAccessRole.OWNER,
    FileAccessRole.EDITOR,
    FileAccessRole.VIEWER
  )
  findOne(@Param('fileId') fileId: string) {
    return this.filesService.findOne(fileId);
  }

  @Get(':fileId/download')
  @UseGuards(FilePermissionGuard)
  @FilePermission(
    FileAccessRole.OWNER,
    FileAccessRole.EDITOR,
    FileAccessRole.VIEWER
  )
  download(@Param('fileId') fileId: string) {
    return this.filesService.download(fileId);
  }

  @Patch(':fileId')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER, FileAccessRole.EDITOR)
  update(@Param('fileId') fileId: string, @Body() updateFileDto: any) {
    return this.filesService.update(fileId, updateFileDto);
  }

  @Delete(':fileId')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('fileId') fileId: string) {
    return this.filesService.remove(fileId);
  }

  @Post(':fileId/share')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER, FileAccessRole.EDITOR)
  shareFile(
    @Param('fileId') fileId: string,
    @Body() shareData: { userId: string; role: string }
  ) {
    return this.filesService.shareFile(fileId, shareData);
  }

  @Get(':fileId/access')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER)
  getFileAccess(@Param('fileId') fileId: string) {
    return this.filesService.getFileAccess(fileId);
  }

  @Patch(':fileId/access/:userId')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER)
  updateFileAccess(
    @Param('fileId') fileId: string,
    @Param('userId') userId: string,
    @Body('role') role: string
  ) {
    return this.filesService.updateFileAccess(fileId, userId, role);
  }

  @Delete(':fileId/access/:userId')
  @UseGuards(FilePermissionGuard)
  @FilePermission(FileAccessRole.OWNER)
  @HttpCode(HttpStatus.OK)
  removeFileAccess(
    @Param('fileId') fileId: string,
    @Param('userId') userId: string
  ) {
    return this.filesService.removeFileAccess(fileId, userId);
  }
}
