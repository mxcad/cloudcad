import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';

import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileSystemService } from './file-system.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { MoveNodeDto } from './dto/move-node.dto';

@Controller('file-system')
@UseGuards(JwtAuthGuard)
@ApiTags('文件系统')
@ApiBearerAuth()
export class FileSystemController {
  private readonly logger = new Logger(FileSystemController.name);

  constructor(private readonly fileSystemService: FileSystemService) {}

  @Post('projects')
  @ApiResponse({ status: 201, description: '项目创建成功' })
  async createProject(@Request() req, @Body() dto: CreateProjectDto) {
    return this.fileSystemService.createProject(req.user.id, dto);
  }

  @Get('projects')
  @ApiResponse({ status: 200, description: '获取项目列表成功' })
  async getProjects(@Request() req) {
    return this.fileSystemService.getUserProjects(req.user.id);
  }

  @Get('projects/:projectId')
  @ApiResponse({ status: 200, description: '获取项目详情成功' })
  async getProject(@Param('projectId') projectId: string) {
    return this.fileSystemService.getProject(projectId);
  }

  @Patch('projects/:projectId')
  @ApiResponse({ status: 200, description: '更新项目成功' })
  async updateProject(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateNodeDto
  ) {
    return this.fileSystemService.updateProject(projectId, dto);
  }

  @Delete('projects/:projectId')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '删除项目成功' })
  async deleteProject(@Param('projectId') projectId: string) {
    return this.fileSystemService.deleteProject(projectId);
  }

  @Post('nodes/:parentId/folders')
  @ApiResponse({ status: 201, description: '创建文件夹成功' })
  async createFolder(
    @Request() req,
    @Param('parentId') parentId: string,
    @Body() dto: CreateFolderDto
  ) {
    return this.fileSystemService.createFolder(req.user.id, parentId, dto);
  }

  @Get('nodes/:nodeId')
  @ApiResponse({ status: 200, description: '获取节点详情成功' })
  async getNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getNodeTree(nodeId);
  }

  @Get('nodes/:nodeId/children')
  @ApiResponse({ status: 200, description: '获取子节点列表成功' })
  async getChildren(@Param('nodeId') nodeId: string, @Request() req) {
    return this.fileSystemService.getChildren(nodeId, req.user.id);
  }

  @Patch('nodes/:nodeId')
  @ApiResponse({ status: 200, description: '更新节点成功' })
  async updateNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto
  ) {
    return this.fileSystemService.updateNode(nodeId, dto);
  }

  @Delete('nodes/:nodeId')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '删除节点成功' })
  async deleteNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.deleteNode(nodeId);
  }

  @Post('nodes/:nodeId/move')
  @ApiResponse({ status: 200, description: '移动节点成功' })
  async moveNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto) {
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  @Post('files/upload')
  @ApiResponse({ status: 201, description: '文件上传成功' })
  async uploadFile(
    @Request() req,
    @Body()
    body: { projectId?: string; fileName?: string; fileContent?: string }
  ) {
    const { projectId, fileName, fileContent } = body;

    if (!fileName) {
      throw new BadRequestException('缺少文件名称');
    }

    if (!projectId) {
      throw new BadRequestException('缺少项目ID');
    }

    // 验证项目是否存在且用户有权限
    const project = await this.fileSystemService.getProject(projectId);
    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    // 检查用户是否是项目成员
    const hasPermission = await this.fileSystemService.checkProjectPermission(
      projectId,
      req.user.id,
      ['OWNER', 'ADMIN', 'MEMBER']
    );

    if (!hasPermission) {
      throw new ForbiddenException('没有权限上传文件到此项目');
    }

    // 将文件内容转为 buffer
    let buffer: Buffer;
    if (fileContent) {
      // 如果是 base64 编码的内容
      buffer = Buffer.from(fileContent, 'base64');
    } else {
      // 如果没有内容，创建一个空的文本文件作为占位符
      buffer = Buffer.from(`文件内容: ${fileName}`, 'utf-8');
    }

    const mockFile = {
      originalname: fileName,
      filename: `${Date.now()}-${fileName}`,
      mimetype: this.getMimeType(fileName),
      size: buffer.length,
      buffer: buffer,
    } as any;

    return this.fileSystemService.uploadFile(req.user.id, projectId, mockFile);
  }

  @Get('storage')
  @ApiResponse({ status: 200, description: '获取存储空间信息成功' })
  async getStorageInfo(@Request() req) {
    return this.fileSystemService.getUserStorageInfo(req.user.id);
  }

  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      dwg: 'application/acad',
      dxf: 'application/dxf',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      txt: 'text/plain',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}
