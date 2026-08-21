import { Injectable, Logger } from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import type {
  MutationAction,
  OwnershipNode,
  OwnershipPermissionStrategy,
} from '../interfaces/ownership-permission-strategy.interface';
import { isOwnershipRootType } from '../interfaces';
import { ProjectPermissionStrategy } from '../strategies/project-permission.strategy';
import { PersonalPermissionStrategy } from '../strategies/personal-permission.strategy';
import { LibraryPermissionStrategy } from '../strategies/library-permission.strategy';

@Injectable()
export class OwnershipPermissionFactory {
  private readonly logger = new Logger(OwnershipPermissionFactory.name);

  constructor(
    private readonly projectStrategy: ProjectPermissionStrategy,
    private readonly personalStrategy: PersonalPermissionStrategy,
    private readonly libraryStrategy: LibraryPermissionStrategy,
  ) {}

  /**
   * 按归属根类型分派策略：根类型节点（项目/个人空间/资源库根）用自身 nodeType；
   * 库内/个人空间内的 FILE/FOLDER 按其归属根（rootNodeType）分派，
   * 避免库内节点被误判为项目权限（实例：库内目录创建子目录必须走资源库策略）。
   */
  getStrategy(node: OwnershipNode): OwnershipPermissionStrategy {
    const nodeType = isOwnershipRootType(node.nodeType)
      ? node.nodeType
      : (node.rootNodeType ?? node.nodeType);
    switch (nodeType) {
      case NodeType.LIBRARY_DRAWING:
      case NodeType.LIBRARY_BLOCK:
        return this.libraryStrategy;
      case NodeType.PERSONAL_SPACE:
        return this.personalStrategy;
      case NodeType.PROJECT:
      case NodeType.FILE:
      case NodeType.FOLDER:
        return this.projectStrategy;
      default:
        throw new Error(`Unknown ownership node type: ${nodeType}`);
    }
  }

  async assertCan(
    userId: string,
    action: MutationAction,
    node: OwnershipNode
  ): Promise<void> {
    await this.getStrategy(node).assertCan(userId, action, node);
  }
}
