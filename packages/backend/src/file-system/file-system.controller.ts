import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Options,
  Body,
  Param,
  Request,
  Res,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';

import {
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileSystemService } from './file-system.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { MoveNodeDto } from './dto/move-node.dto';
import { CopyNodeDto } from './dto/copy-node.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { QueryChildrenDto } from './dto/query-children.dto';

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
  async getProjects(@Request() req, @Query() query?: QueryProjectsDto) {
    return this.fileSystemService.getUserProjects(req.user.id, query);
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
  async getChildren(
    @Param('nodeId') nodeId: string,
    @Request() req,
    @Query() query?: QueryChildrenDto
  ) {
    return this.fileSystemService.getChildren(nodeId, req.user.id, query);
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

    const parentNode = await this.fileSystemService.getNode(parentId);
    if (!parentNode) {
      throw new NotFoundException('父节点不存在');
    }

    if (!parentNode.isFolder) {
      throw new BadRequestException('只能上传文件到文件夹');
    }

    let projectId = parentId;
    if (!parentNode.isRoot) {
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

    const hasPermission = await this.fileSystemService.checkProjectPermission(
      projectId,
      req.user.id,
      ['OWNER', 'ADMIN', 'MEMBER']
    );

    if (!hasPermission) {
      throw new ForbiddenException('没有权限上传文件到此项目');
    }

    let buffer: Buffer;
    if (fileContent) {
      buffer = Buffer.from(fileContent, 'base64');
    } else {
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

  @Get('projects/:projectId/members')
  @ApiOperation({ summary: '获取项目成员列表' })
  @ApiResponse({ status: 200, description: '获取成员列表成功' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权访问该项目' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async getProjectMembers(@Param('projectId') projectId: string) {
    return this.fileSystemService.getProjectMembers(projectId);
  }

  @Post('projects/:projectId/members')
  @ApiOperation({ summary: '添加项目成员' })
  @ApiResponse({ status: 201, description: '添加成员成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限添加成员' })
  @ApiResponse({ status: 404, description: '项目或用户不存在' })
  async addProjectMember(
    @Param('projectId') projectId: string,
    @Body() body: { userId: string; role: string },
    @Request() req
  ) {
    const { userId, role } = body;
    return this.fileSystemService.addProjectMember(
      projectId,
      userId,
      role,
      req.user.id
    );
  }

  @Patch('projects/:projectId/members/:userId')
  @ApiOperation({ summary: '更新项目成员角色' })
  @ApiResponse({ status: 200, description: '更新成员角色成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限更新成员角色' })
  @ApiResponse({ status: 404, description: '项目或成员不存在' })
  async updateProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body('role') role: string,
    @Request() req
  ) {
    return this.fileSystemService.updateProjectMember(
      projectId,
      userId,
      role,
      req.user.id
    );
  }

  @Delete('projects/:projectId/members/:userId')
  @ApiOperation({ summary: '移除项目成员' })
  @ApiResponse({ status: 200, description: '移除成员成功' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权限移除成员' })
  @ApiResponse({ status: 404, description: '项目或成员不存在' })
  @HttpCode(HttpStatus.OK)
  async removeProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Request() req
  ) {
    return this.fileSystemService.removeProjectMember(
      projectId,
      userId,
      req.user.id
    );
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

  /**
   * 获取文件缩略图（通过 Session 认证）
   * 用于 img.src 直接访问，浏览器自动携带 Cookie
   */
  @Get('nodes/:nodeId/thumbnail')
  @ApiOperation({ summary: '获取文件缩略图' })
  @ApiResponse({ status: 200, description: '获取缩略图成功', type: 'stream' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权访问该文件' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getThumbnail(
    @Param('nodeId') nodeId: string,
    @Request() req: any,
    @Res() res: any
  ) {
    const userId = req.session?.userId;

    if (!userId) {
      throw new UnauthorizedException('未登录');
    }

    const hasAccess = await this.fileSystemService.checkFileAccess(
      nodeId,
      userId
    );

    if (!hasAccess) {
      throw new ForbiddenException('无权访问该文件');
    }

    const node = await this.fileSystemService.getNode(nodeId);

    if (!node || node.isFolder || !node.path) {
      throw new NotFoundException('文件不存在');
    }

    const extension = node.extension?.toLowerCase() || '';
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

    if (!imageExtensions.includes(extension)) {
      throw new BadRequestException('该文件不是图片文件');
    }

    let storagePath = node.path;
    if (node.path.startsWith('files/')) {
      if (node.fileHash) {
        storagePath = `mxcad/file/${node.fileHash}/${node.name}`;
        this.logger.log(`路径转换: ${node.path} -> ${storagePath}`);
      }
    }

    const stream = await this.fileSystemService.getFileStream(storagePath);

    const mimeType = this.getMimeType(node.name);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    stream.pipe(res);
  }

  /**
   * 下载节点（文件或目录）
   * 文件直接下载，目录压缩为 ZIP 下载
   */
  @Options('nodes/:nodeId/download')
  @ApiOperation({ summary: '下载接口 OPTIONS 预检' })
  async downloadNodeOptions(@Request() req: any, @Res() res: any) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    res.setHeader('Access-Control-Max-Age', '86400'); // 24小时
    res.status(204).end();
  }

  @Get('nodes/:nodeId/download')
  @ApiOperation({ summary: '下载节点（文件或目录）' })
  @ApiResponse({ status: 200, description: '下载成功', type: 'stream' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '无权访问该节点' })
  @ApiResponse({ status: 404, description: '节点不存在' })
  async downloadNode(
    @Param('nodeId') nodeId: string,
    @Request() req: any,
    @Res() res: any
  ) {
    const userId = req.user?.id || req.session?.userId;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!userId) {
      throw new UnauthorizedException('未登录');
    }

    try {
      const { stream, filename, mimeType } =
        await this.fileSystemService.downloadNode(nodeId, userId);

      // 先设置所有响应头，再开始传输
      // 1. CORS 头（必须在最前面）
      const origin = req.headers.origin || '*';
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      );

      this.logger.log(`[下载] CORS 头已设置: ${origin}`);

      // 2. Content-Type
      res.setHeader('Content-Type', mimeType);

      // 3. Content-Disposition
      const encodedFilename = encodeURIComponent(filename);
      // eslint-disable-next-line no-control-regex
      const fallbackFilename = filename.replace(/[^\x00-\x7F]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
      );

      // 4. Cache-Control 和 ETag
      const node = await this.fileSystemService.getNode(nodeId);
      if (node && !node.isFolder && (node.fileHash || node.id)) {
        const etag = `"${node.fileHash || node.id}"`;
        res.setHeader('ETag', etag);

        // 检查 If-None-Match
        if (req.headers['if-none-match'] === etag) {
          if (typeof (stream as any).destroy === 'function') {
            (stream as any).destroy();
          }
          return res.status(304).end();
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        // 对于动态生成的 ZIP，不缓存
        res.setHeader('Cache-Control', 'no-cache');
      }

      // 记录下载开始
      this.logger.log(
        `下载开始: ${filename} (${nodeId}) by user ${userId} from IP ${clientIp}`
      );

      // 流式传输
      stream.pipe(res);

      // 错误处理
      stream.on('error', (error) => {
        this.logger.error(`文件下载流错误: ${error.message}`, error.stack);

        // 尝试清理资源
        if (typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }

        if (!res.headersSent) {
          res.status(500).json({ message: '文件下载失败' });
        } else if (!res.writableEnded) {
          // 如果响应已发送但未结束，尝试结束响应
          res.end();
        }
      });

      // 记录下载完成
      stream.on('finish', () => {
        this.logger.log(
          `下载完成: ${filename} (${nodeId}) by user ${userId}, size: ${node?.size || 0} bytes`
        );
      });
    } catch (error) {
      this.logger.error(
        `下载失败: ${nodeId} by user ${userId} - ${error.message}`,
        error.stack
      );

      if (!res.headersSent) {
        const status =
          error instanceof NotFoundException
            ? 404
            : error instanceof ForbiddenException
              ? 403
              : 500;
        res.status(status).json({
          message: error.message || '文件下载失败',
        });
      }
    }
  }
}
