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
import { CopyNodeDto } from './dto/copy-node.dto';

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
  async deleteProject(
    @Param('projectId') projectId: string,
    @Body() body: { permanently?: boolean }
  ) {
    return this.fileSystemService.deleteProject(projectId, body?.permanently);
  }

  // ============ 回收站相关 API ============

  @Get('trash')
  @ApiResponse({ status: 200, description: '获取回收站列表成功' })
  async getTrash(@Request() req) {
    return this.fileSystemService.getTrashItems(req.user.id);
  }

  @Post('trash/restore')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '批量恢复成功' })
  async restoreTrashItems(@Body() body: { itemIds: string[] }) {
    return this.fileSystemService.restoreTrashItems(body.itemIds);
  }

  @Delete('trash/items')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '批量彻底删除成功' })
  async permanentlyDeleteTrashItems(@Body() body: { itemIds: string[] }) {
    return this.fileSystemService.permanentlyDeleteTrashItems(body.itemIds);
  }

  @Delete('trash')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '清空回收站成功' })
  async clearTrash(@Request() req) {
    return this.fileSystemService.clearTrash(req.user.id);
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
  async deleteNode(
    @Param('nodeId') nodeId: string,
    @Body() body: { permanently?: boolean }
  ) {
    return this.fileSystemService.deleteNode(nodeId, body?.permanently);
  }

  @Post('nodes/:nodeId/move')
  @ApiResponse({ status: 200, description: '移动节点成功' })
  async moveNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto) {
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  @Post('nodes/:nodeId/copy')
  @ApiResponse({ status: 201, description: '拷贝节点成功' })
  async copyNode(@Param('nodeId') nodeId: string, @Body() dto: CopyNodeDto) {
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
  }

  @Post('files/upload')
  @ApiResponse({ status: 201, description: '文件上传成功' })
  async uploadFile(
    @Request() req,
    @Body()
    body: { parentId?: string; fileName?: string; fileContent?: string }
  ) {
    const { parentId, fileName, fileContent } = body;
    if (!fileName) {
      throw new BadRequestException('缺少文件名称');
    }

    if (!parentId) {
      throw new BadRequestException('缺少父节点ID');
    }

    // 验证父节点是否存在且是文件夹
    const parentNode = await this.fileSystemService.getNode(parentId);
    if (!parentNode) {
      throw new NotFoundException('父节点不存在');
    }

    if (!parentNode.isFolder) {
      throw new BadRequestException('只能上传文件到文件夹');
    }

    // 获取项目根节点ID（用于权限检查）
    let projectId = parentId;
    if (!parentNode.isRoot) {
      // 如果不是根节点，需要向上查找项目根节点
      let currentNode = parentNode;
      while (currentNode.parentId) {
        currentNode = await this.fileSystemService.getNode(
          currentNode.parentId
        );
        if (currentNode.isRoot) {
          projectId = currentNode.id;
          break;
        }
      }
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

    return this.fileSystemService.uploadFile(req.user.id, parentId, mockFile);
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
