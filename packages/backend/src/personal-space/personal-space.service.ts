///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FileSystemNode, NodeType, ProjectStatus } from '@cloudcad/db';

/** 个人空间根节点的统一显示名（术语已从「我的图纸」统一为「个人空间」） */
export const PERSONAL_SPACE_NAME = '个人空间';

/** 旧版默认根名（惰性迁移：仍叫此名的存量根在访问时改写为新名） */
const LEGACY_PERSONAL_SPACE_NAME = '我的图纸';

@Injectable()
export class PersonalSpaceService {
  private readonly logger = new Logger(PersonalSpaceService.name);

  constructor(private database: DatabaseService) {}

  /**
   * 创建个人空间
   *
   * 个人空间是账号专属空间：权限按 ownerId 判断
   * （PersonalPermissionStrategy / RequireProjectPermissionGuard /
   * PrismaPermissionStore.getUserProjectPermissions），
   * 不建项目成员行、不复制项目角色（ADR-00XX）。
   */
  async createPersonalSpace(userId: string): Promise<FileSystemNode> {
    return this.database.fileSystemNode.create({
      data: {
        name: PERSONAL_SPACE_NAME,
        nodeType: NodeType.PERSONAL_SPACE,
        projectStatus: ProjectStatus.ACTIVE,
        ownerId: userId,
      },
    });
  }

  /**
   * 获取用户个人空间（不存在则自动创建）
   *
   * 存量根名迁移：旧版默认名「我的图纸」在首次访问时惰性改写为
   * 「个人空间」（幂等，仅命中未自定义过的默认名，不碰用户改名后的根）。
   */
  async getPersonalSpace(userId: string): Promise<FileSystemNode> {
    const personalSpace = await this.database.fileSystemNode.findFirst({
      where: { ownerId: userId, nodeType: NodeType.PERSONAL_SPACE },
    });

    if (!personalSpace) {
      this.logger.warn(`用户 ${userId} 没有个人空间，尝试创建`);
      return this.createPersonalSpace(userId);
    }

    if (personalSpace.name === LEGACY_PERSONAL_SPACE_NAME) {
      try {
        return await this.database.fileSystemNode.update({
          where: { id: personalSpace.id },
          data: { name: PERSONAL_SPACE_NAME },
        });
      } catch (error) {
        this.logger.warn(
          `个人空间根名惰性迁移失败（不影响本次返回）: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return personalSpace;
  }

  /**
   * 判断节点是否为私人空间
   */
  isPersonalSpace(nodeType: NodeType): boolean {
    return nodeType === NodeType.PERSONAL_SPACE;
  }
}
