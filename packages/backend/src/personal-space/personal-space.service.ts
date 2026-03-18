///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关资料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FileSystemNode, ProjectStatus } from '@prisma/client';

@Injectable()
export class PersonalSpaceService {
  private readonly logger = new Logger(PersonalSpaceService.name);

  constructor(private database: DatabaseService) {}

  /**
   * 创建私人空间
   */
  async createPersonalSpace(userId: string): Promise<FileSystemNode> {
    const ownerRole = await this.database.projectRole.findFirst({
      where: { name: 'PROJECT_OWNER', isSystem: true }
    });

    if (!ownerRole) {
      throw new InternalServerErrorException('PROJECT_OWNER 角色不存在');
    }

    return this.database.fileSystemNode.create({
      data: {
        name: '我的图纸',
        isFolder: true,
        isRoot: true,
        personalSpaceKey: userId,
        projectStatus: ProjectStatus.ACTIVE,
        ownerId: userId,
        projectMembers: {
          create: {
            userId,
            projectRoleId: ownerRole.id,
          }
        }
      }
    });
  }

  /**
   * 获取用户私人空间（不存在则自动创建）
   */
  async getPersonalSpace(userId: string): Promise<FileSystemNode> {
    const personalSpace = await this.database.fileSystemNode.findUnique({
      where: { personalSpaceKey: userId }
    });

    if (!personalSpace) {
      this.logger.warn(`用户 ${userId} 没有私人空间，尝试创建`);
      return this.createPersonalSpace(userId);
    }

    return personalSpace;
  }

  /**
   * 判断节点是否为私人空间
   */
  isPersonalSpace(personalSpaceKey: string | null): boolean {
    return personalSpaceKey !== null;
  }
}
