///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, Min } from 'class-validator';

/**
 * 更新存储配额 DTO
 */
export class UpdateStorageQuotaDto {
  @ApiProperty({
    description: '节点 ID（用户个人空间根节点、项目根节点或公共资源库节点）',
    example: 'cm3xk8z0r000008l6g8qj9z5x',
  })
  @IsString()
  nodeId: string;

  @ApiProperty({
    description: '配额大小（GB），0 表示使用系统默认值',
    example: 100, // 100GB
  })
  @IsNumber()
  @Min(0)
  quota: number;
}
