///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';

/**
 * SVN 提交记录中的变更路径 DTO
 */
export class SvnLogPathDto {
  @ApiProperty({
    description: '变更动作类型',
    enum: ['A', 'M', 'D', 'R'],
    example: 'A',
  })
  action: 'A' | 'M' | 'D' | 'R';

  @ApiProperty({
    description: '路径类型',
    enum: ['file', 'dir'],
    example: 'file',
  })
  kind: 'file' | 'dir';

  @ApiProperty({
    description: '变更路径',
    example: '/path/to/file.dwg',
  })
  path: string;
}
