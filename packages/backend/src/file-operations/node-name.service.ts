import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class NodeNameService {
  private readonly logger = new Logger(NodeNameService.name);

  constructor(private readonly prisma: DatabaseService) {}

  async checkNameUniqueness(
    name: string,
    userId: string,
    parentId: string | null,
    excludeNodeId?: string
  ): Promise<void> {
    if (!parentId) {
      const existingProject = await this.prisma.fileSystemNode.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          ownerId: userId,
          nodeType: NodeType.PROJECT,
          deletedAt: null,
          ...(excludeNodeId && { id: { not: excludeNodeId } }),
        },
        select: { id: true },
      });

      if (existingProject) {
        throw new BadRequestException(I18nContext.current()?.t('error.project.already_exists') ?? '已存在同名项目，请使用其他名称');
      }
      return;
    }

    const existingNode = await this.prisma.fileSystemNode.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        parentId,
        deletedAt: null,
        ...(excludeNodeId && { id: { not: excludeNodeId } }),
      },
      select: { id: true, nodeType: true },
    });

    if (existingNode) {
      throw new BadRequestException(
        existingNode.nodeType === NodeType.FOLDER
          ? '同级目录已存在同名文件夹'
          : '同级目录已存在同名文件'
      );
    }
  }

  async generateUniqueName(
    parentId: string,
    baseName: string,
    isFolder: boolean
  ): Promise<string> {
    const existingNodes = await this.prisma.fileSystemNode.findMany({
      where: { parentId, deletedAt: null },
      select: { name: true },
    });

    const existingNames = new Set(existingNodes.map((n) => n.name));

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    if (!isFolder) {
      const lastDotIndex = baseName.lastIndexOf('.');
      if (lastDotIndex === -1) {
        return this.generateNumberedName(baseName, existingNames);
      }
      const nameWithoutExt = baseName.substring(0, lastDotIndex);
      const extension = baseName.substring(lastDotIndex);

      const generateFullName = (counter: number) =>
        `${nameWithoutExt} (${counter})${extension}`;

      let maxCounter = 0;
      const escapedNameWithoutExt = nameWithoutExt.replace(
        /[.*+?^${}()|[\]\\]/g, '\\$&'
      );
      const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `^${escapedNameWithoutExt} \((\d+)\)${escapedExtension}$`
      );

      for (const name of existingNames) {
        const match = name.match(pattern);
        if (match) {
          const counter = parseInt(match[1], 10);
          if (counter > maxCounter) {
            maxCounter = counter;
          }
        }
      }

      let counter = maxCounter + 1;
      let newName: string;
      do {
        newName = generateFullName(counter);
        counter++;
      } while (existingNames.has(newName));
      return newName;
    }

    return this.generateNumberedName(baseName, existingNames);
  }

  private generateNumberedName(
    baseName: string,
    existingNames: Set<string>
  ): string {
    const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let maxCounter = 0;
    const pattern = new RegExp(`^${escapedBaseName} \((\d+)\)$`);

    for (const name of existingNames) {
      const match = name.match(pattern);
      if (match) {
        const counter = parseInt(match[1], 10);
        if (counter > maxCounter) {
          maxCounter = counter;
        }
      }
    }

    let counter = maxCounter + 1;
    let newName: string;
    do {
      newName = `${baseName} (${counter})`;
      counter++;
    } while (existingNames.has(newName));
    return newName;
  }
}
