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
import { NodePermissionGuard } from '../common/guards/project-permission.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { NodePermission } from '../common/decorators/project-permission.decorator';
import {
  ProjectRole,
  ProjectPermission,
} from '../common/enums/permissions.enum';
import { FileSystemService } from './file-system.service';
import { ProjectPermissionService } from '../roles/project-permission.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { MoveNodeDto } from './dto/move-node.dto';
import { CopyNodeDto } from './dto/copy-node.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { QueryChildrenDto } from './dto/query-children.dto';

@Controller('file-system')
@UseGuards(JwtAuthGuard, NodePermissionGuard, PermissionsGuard)
@ApiTags('�ļ�ϵͳ')
@ApiBearerAuth()
export class FileSystemController {
  private readonly logger = new Logger(FileSystemController.name);

  constructor(
    private readonly fileSystemService: FileSystemService,
    private readonly projectPermissionService: ProjectPermissionService
  ) {}

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
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.EDITOR,
    ProjectRole.VIEWER
  )
  @ApiResponse({ status: 200, description: '��ȡ��Ŀ����ɹ�' })
  async getProject(@Param('projectId') projectId: string) {
    return this.fileSystemService.getProject(projectId);
  }

  @Patch('projects/:projectId')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiResponse({ status: 200, description: '������Ŀ�ɹ�' })
  async updateProject(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateNodeDto
  ) {
    return this.fileSystemService.updateProject(projectId, dto);
  }

  @Delete('projects/:projectId')
  @NodePermission(ProjectRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'ɾ����Ŀ�ɹ�' })
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
  @ApiResponse({ status: 200, description: '恢复项目成功' })
  async restoreTrashItems(@Body() body: { itemIds: string[] }) {
    return this.fileSystemService.restoreTrashItems(body.itemIds);
  }

  @Delete('trash/items')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '永久删除项目成功' })
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
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @ApiResponse({ status: 201, description: '�����ļ��гɹ�' })
  async createFolder(
    @Request() req,
    @Param('parentId') parentId: string,
    @Body() dto: CreateFolderDto
  ) {
    return this.fileSystemService.createFolder(req.user.id, parentId, dto);
  }

  @Get('nodes/:nodeId')
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.EDITOR,
    ProjectRole.VIEWER
  )
  @ApiResponse({ status: 200, description: '��ȡ�ڵ�����ɹ�' })
  async getNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getNodeTree(nodeId);
  }

  @Get('nodes/:nodeId/root')
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.EDITOR,
    ProjectRole.VIEWER
  )
  @ApiResponse({ status: 200, description: '��ȡ���ڵ�ɹ�' })
  async getRootNode(@Param('nodeId') nodeId: string) {
    return this.fileSystemService.getRootNode(nodeId);
  }

  @Get('nodes/:nodeId/children')
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.EDITOR,
    ProjectRole.VIEWER
  )
  @ApiResponse({ status: 200, description: '��ȡ�ӽڵ��б��ɹ�' })
  async getChildren(
    @Param('nodeId') nodeId: string,
    @Request() req,
    @Query() query?: QueryChildrenDto
  ) {
    return this.fileSystemService.getChildren(nodeId, req.user.id, query);
  }
  @Patch('nodes/:nodeId')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiResponse({ status: 200, description: '���½ڵ�ɹ�' })
  async updateNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto
  ) {
    return this.fileSystemService.updateNode(nodeId, dto);
  }

  @Delete('nodes/:nodeId')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'ɾ���ڵ�ɹ�' })
  async deleteNode(
    @Param('nodeId') nodeId: string,
    @Body() body?: { permanently?: boolean },
    @Query('permanently') permanentlyQuery?: boolean
  ) {
    const permanently = body?.permanently ?? permanentlyQuery ?? false;
    return this.fileSystemService.deleteNode(nodeId, permanently);
  }

  @Post('nodes/:nodeId/move')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiResponse({ status: 200, description: '�ƶ��ڵ�ɹ�' })
  async moveNode(@Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto) {
    return this.fileSystemService.moveNode(nodeId, dto.targetParentId);
  }

  @Post('nodes/:nodeId/copy')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @ApiResponse({ status: 201, description: '�����ڵ�ɹ�' })
  async copyNode(@Param('nodeId') nodeId: string, @Body() dto: CopyNodeDto) {
    return this.fileSystemService.copyNode(nodeId, dto.targetParentId);
  }

  @Post('files/upload')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @ApiResponse({ status: 201, description: '�ļ��ϴ��ɹ�' })
  async uploadFile(
    @Request() req,
    @Body()
    body: { parentId?: string; fileName?: string; fileContent?: string }
  ) {
    const { parentId, fileName, fileContent } = body;
    if (!fileName) {
      throw new BadRequestException('ȱ���ļ�����');
    }

    if (!parentId) {
      throw new BadRequestException('ȱ�ٸ��ڵ�ID');
    }

    const parentNode = await this.fileSystemService.getNode(parentId);
    if (!parentNode) {
      throw new NotFoundException('���ڵ㲻����');
    }

    if (!parentNode.isFolder) {
      throw new BadRequestException('ֻ���ϴ��ļ����ļ���');
    }

    let buffer: Buffer;
    if (fileContent) {
      buffer = Buffer.from(fileContent, 'base64');
    } else {
      buffer = Buffer.from(`�ļ�����: ${fileName}`, 'utf-8');
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
  @ApiResponse({ status: 200, description: '��ȡ�洢�ռ���Ϣ�ɹ�' })
  async getStorageInfo(@Request() req) {
    return this.fileSystemService.getUserStorageInfo(req.user.id);
  }

  @Get('projects/:projectId/members')
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.EDITOR,
    ProjectRole.VIEWER
  )
  @ApiOperation({ summary: '��ȡ��Ŀ��Ա�б�' })
  @ApiResponse({ status: 200, description: '��ȡ��Ա�б��ɹ�' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ���ʸ���Ŀ' })
  @ApiResponse({ status: 404, description: '��Ŀ������' })
  async getProjectMembers(@Param('projectId') projectId: string) {
    return this.fileSystemService.getProjectMembers(projectId);
  }

  @Post('projects/:projectId/members')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({ summary: '������Ŀ��Ա' })
  @ApiResponse({ status: 201, description: '���ӳ�Ա�ɹ�' })
  @ApiResponse({ status: 400, description: '�����������' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ�����ӳ�Ա' })
  @ApiResponse({ status: 404, description: '��Ŀ���û�������' })
  async addProjectMember(
    @Param('projectId') projectId: string,
    @Body() body: { userId: string; projectRoleId: string },
    @Request() req
  ) {
    const { userId, projectRoleId } = body;
    return this.fileSystemService.addProjectMember(
      projectId,
      userId,
      projectRoleId,
      req.user.id
    );
  }

  @Patch('projects/:projectId/members/:userId')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({ summary: '������Ŀ��Ա��ɫ' })
  @ApiResponse({ status: 200, description: '���³�Ա��ɫ�ɹ�' })
  @ApiResponse({ status: 400, description: '�����������' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ�޸��³�Ա��ɫ' })
  @ApiResponse({ status: 404, description: '��Ŀ���Ա������' })
  async updateProjectMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() body: { projectRoleId: string },
    @Request() req
  ) {
    const { projectRoleId } = body;
    return this.fileSystemService.updateProjectMember(
      projectId,
      userId,
      projectRoleId,
      req.user.id
    );
  }

  @Delete('projects/:projectId/members/:userId')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({ summary: '�Ƴ���Ŀ��Ա' })
  @ApiResponse({ status: 200, description: '�Ƴ���Ա�ɹ�' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ���Ƴ���Ա' })
  @ApiResponse({ status: 404, description: '��Ŀ���Ա������' })
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

  @Post('projects/:projectId/transfer')
  @NodePermission(ProjectRole.OWNER)
  @ApiOperation({ summary: 'ת����Ŀ����Ȩ' })
  @ApiResponse({ status: 200, description: 'ת�óɹ�' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ��ת��' })
  @ApiResponse({ status: 400, description: 'ת��Ŀ����Ч' })
  @ApiResponse({ status: 404, description: '��Ŀ���Ա������' })
  @HttpCode(HttpStatus.OK)
  async transferProjectOwnership(
    @Param('projectId') projectId: string,
    @Body('newOwnerId') newOwnerId: string,
    @Request() req
  ) {
    return this.fileSystemService.transferProjectOwnership(
      projectId,
      newOwnerId,
      req.user.id
    );
  }

  @Post('projects/:projectId/members/batch')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({ summary: '����������Ŀ��Ա' })
  @ApiResponse({ status: 201, description: '�������ӳ�Ա�ɹ�' })
  @ApiResponse({ status: 400, description: '�����������' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ�����ӳ�Ա' })
  @ApiResponse({ status: 404, description: '��Ŀ���û�������' })
  async batchAddProjectMembers(
    @Param('projectId') projectId: string,
    @Body() body: { members: Array<{ userId: string; projectRoleId: string }> },
    @Request() req
  ) {
    return this.fileSystemService.batchAddProjectMembers(
      projectId,
      body.members
    );
  }

  @Patch('projects/:projectId/members/batch')
  @NodePermission(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({ summary: '����������Ŀ��Ա��ɫ' })
  @ApiResponse({ status: 200, description: '�������³�Ա��ɫ�ɹ�' })
  @ApiResponse({ status: 400, description: '�����������' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ�޸��³�Ա��ɫ' })
  @ApiResponse({ status: 404, description: '��Ŀ���Ա������' })
  async batchUpdateProjectMembers(
    @Param('projectId') projectId: string,
    @Body() body: { updates: Array<{ userId: string; projectRoleId: string }> },
    @Request() req
  ) {
    return this.fileSystemService.batchUpdateProjectMembers(
      projectId,
      body.updates
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
   * ��ȡ�ļ�����ͼ��ͨ�� Session ��֤��
   * ���� img.src ֱ�ӷ��ʣ�������Զ�Я�� Cookie
   */
  @Get('nodes/:nodeId/thumbnail')
  @ApiOperation({ summary: '��ȡ�ļ�����ͼ' })
  @ApiResponse({ status: 200, description: '��ȡ����ͼ�ɹ�', type: 'stream' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ���ʸ��ļ�' })
  @ApiResponse({ status: 404, description: '�ļ�������' })
  async getThumbnail(
    @Param('nodeId') nodeId: string,
    @Request() req: any,
    @Res() res: any
  ) {
    const userId = req.session?.userId;

    if (!userId) {
      throw new UnauthorizedException('δ��¼');
    }

    const hasAccess = await this.fileSystemService.checkFileAccess(
      nodeId,
      userId
    );

    if (!hasAccess) {
      throw new ForbiddenException('��Ȩ���ʸ��ļ�');
    }

    const node = await this.fileSystemService.getNode(nodeId);

    if (!node || node.isFolder || !node.path) {
      throw new NotFoundException('�ļ�������');
    }

    const extension = node.extension?.toLowerCase() || '';
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

    if (!imageExtensions.includes(extension)) {
      throw new BadRequestException('���ļ�����ͼƬ�ļ�');
    }

    let storagePath = node.path;
    if (node.path.startsWith('files/')) {
      if (node.fileHash) {
        // ʹ���� MxCAD ����ͼ�ϴ�һ�µ�·����ʽ: {hash}.{extension}
        const extension = node.extension?.toLowerCase() || '';
        storagePath = `mxcad/file/${node.fileHash}${extension}`;
        this.logger.log(`·��ת��: ${node.path} -> ${storagePath}`);
      }
    }

    const stream = await this.fileSystemService.getFileStream(storagePath);

    const mimeType = this.getMimeType(node.name);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    stream.pipe(res);
  }

  /**
   * ���ؽڵ㣨�ļ���Ŀ¼��
   * �ļ�ֱ�����أ�Ŀ¼ѹ��Ϊ ZIP ����
   */
  @Options('nodes/:nodeId/download')
  @ApiOperation({ summary: '���ؽӿ� OPTIONS Ԥ��' })
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
    res.setHeader('Access-Control-Max-Age', '86400'); // 24Сʱ
    res.status(204).end();
  }

  @Get('nodes/:nodeId/download')
  @ApiOperation({ summary: '���ؽڵ㣨�ļ���Ŀ¼��' })
  @ApiResponse({ status: 200, description: '���سɹ�', type: 'stream' })
  @ApiResponse({ status: 401, description: 'δ��¼' })
  @ApiResponse({ status: 403, description: '��Ȩ���ʸýڵ�' })
  @ApiResponse({ status: 404, description: '�ڵ㲻����' })
  async downloadNode(
    @Param('nodeId') nodeId: string,
    @Request() req: any,
    @Res() res: any
  ) {
    const userId = req.user?.id || req.session?.userId;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!userId) {
      throw new UnauthorizedException('δ��¼');
    }

    try {
      const { stream, filename, mimeType } =
        await this.fileSystemService.downloadNode(nodeId, userId);

      // ������������Ӧͷ���ٿ�ʼ����
      // 1. CORS ͷ����������ǰ�棩
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

      this.logger.log(`[����] CORS ͷ������: ${origin}`);

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

      // 4. Cache-Control �� ETag
      const node = await this.fileSystemService.getNode(nodeId);
      if (node && !node.isFolder && (node.fileHash || node.id)) {
        const etag = `"${node.fileHash || node.id}"`;
        res.setHeader('ETag', etag);

        // ��� If-None-Match
        if (req.headers['if-none-match'] === etag) {
          if (typeof (stream as any).destroy === 'function') {
            (stream as any).destroy();
          }
          return res.status(304).end();
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        // ���ڶ�̬���ɵ� ZIP��������
        res.setHeader('Cache-Control', 'no-cache');
      }

      // ��¼���ؿ�ʼ
      this.logger.log(
        `���ؿ�ʼ: ${filename} (${nodeId}) by user ${userId} from IP ${clientIp}`
      );

      // ��ʽ����
      stream.pipe(res);

      // ������
      stream.on('error', (error) => {
        this.logger.error(`�ļ�����������: ${error.message}`, error.stack);

        // ����������Դ
        if (typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }

        if (!res.headersSent) {
          res.status(500).json({ message: '�ļ�����ʧ��' });
        } else if (!res.writableEnded) {
          // �����Ӧ�ѷ��͵�δ���������Խ�����Ӧ
          res.end();
        }
      });

      // ��¼�������
      stream.on('finish', () => {
        this.logger.log(
          `�������: ${filename} (${nodeId}) by user ${userId}, size: ${node?.size || 0} bytes`
        );
      });
    } catch (error) {
      this.logger.error(
        `����ʧ��: ${nodeId} by user ${userId} - ${error.message}`,
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
          message: error.message || '�ļ�����ʧ��',
        });
      }
    }
  }

  // ========== 项目权限检查端点 ==========

  /**
   * 获取用户在项目中的所有权限
   */
  @Get('projects/:projectId/permissions')
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.EDITOR,
    ProjectRole.VIEWER
  )
  @ApiOperation({ summary: '获取用户在项目中的所有权限' })
  @ApiResponse({ status: 200, description: '成功获取用户权限' })
  async getUserProjectPermissions(
    @Request() req,
    @Param('projectId') projectId: string
  ) {
    const permissions = await this.projectPermissionService.getUserPermissions(
      req.user.id,
      projectId
    );
    return {
      projectId,
      userId: req.user.id,
      permissions,
    };
  }

  /**
   * 检查用户是否具有特定权限
   */
  @Get('projects/:projectId/permissions/check')
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.EDITOR,
    ProjectRole.VIEWER
  )
  @ApiOperation({ summary: '检查用户是否具有特定权限' })
  @ApiResponse({ status: 200, description: '权限检查结果' })
  async checkProjectPermission(
    @Request() req,
    @Param('projectId') projectId: string,
    @Query('permission') permission: ProjectPermission
  ) {
    if (!permission) {
      throw new BadRequestException('缺少 permission 参数');
    }

    const hasPermission = await this.projectPermissionService.checkPermission(
      req.user.id,
      projectId,
      permission
    );

    return {
      projectId,
      userId: req.user.id,
      permission,
      hasPermission,
    };
  }

  /**
   * 获取用户在项目中的角色
   */
  @Get('projects/:projectId/role')
  @NodePermission(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.EDITOR,
    ProjectRole.VIEWER
  )
  @ApiOperation({ summary: '获取用户在项目中的角色' })
  @ApiResponse({ status: 200, description: '成功获取用户角色' })
  async getUserProjectRole(
    @Request() req,
    @Param('projectId') projectId: string
  ) {
    const role = await this.projectPermissionService.getUserRole(
      req.user.id,
      projectId
    );

    return {
      projectId,
      userId: req.user.id,
      role,
    };
  }
}
