import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { UpdateNodeDto } from '../file-system/dto/update-node.dto';
import { NodeNameService } from './node-name.service';
import { NodeMutationGuard } from './node-mutation.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class NodeUpdateService {
  private readonly logger = new Logger(NodeUpdateService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly nodeNameService: NodeNameService,
    private readonly nodeMutationGuard: NodeMutationGuard,
    private readonly auditLogService: AuditLogService
  ) {}

  async updateNode(nodeId: string, dto: UpdateNodeDto, userId?: string) {
    try {
      const currentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          name: true,
          nodeType: true,
          extension: true,
          parentId: true,
          ownerId: true,
        },
      });

      if (!currentNode) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }

      if (userId) {
        await this.nodeMutationGuard.assertMutationAllowed(userId, 'update', {
          node: { id: nodeId },
        });
      }

      if (dto.name && dto.name !== currentNode.name) {
        if (currentNode.nodeType === NodeType.FILE && currentNode.extension) {
          const newExtension = path.extname(dto.name).toLowerCase();
          const currentExtension = currentNode.extension.toLowerCase();

          if (newExtension && newExtension !== currentExtension) {
            throw new BadRequestException(
              `不允许修改文件扩展名。文件扩展名必须保持为 ${currentExtension}`
            );
          }

          if (!newExtension && currentExtension) {
            dto.name = `${dto.name}${currentExtension}`;
          }
        }

        await this.nodeNameService.checkNameUniqueness(
          dto.name,
          currentNode.ownerId,
          currentNode.nodeType !== NodeType.FILE &&
            currentNode.nodeType !== NodeType.FOLDER
            ? null
            : currentNode.parentId,
          nodeId
        );
      }

      const node = await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: { name: dto.name, description: dto.description },
        include: {
          owner: { select: { id: true, username: true, nickname: true } },
        },
      });

      this.logger.log(`节点更新成功: ${node.name}`);
      // 重命名审计（NODE_RENAME）：仅名称实际变化时记（只改描述不记）；
      // 仅项目内节点记录（个人空间/公共资源库不记）；无操作者（匿名）不记
      if (dto.name && dto.name !== currentNode.name && userId) {
        await this.auditLogService.logProjectNodeAction(
          AuditAction.NODE_RENAME,
          nodeId,
          userId,
          {
            oldName: currentNode.name,
            newName: node.name,
          },
          currentNode.nodeType === NodeType.FOLDER
            ? ResourceType.FOLDER
            : ResourceType.FILE
        );
      }
      return node;
    } catch (error) {
      this.logger.error(`节点更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

export { NodeNameService } from './node-name.service';
export { NodeTrashService } from './node-trash.service';
export { NodeCopyMoveService } from './node-copy-move.service';
