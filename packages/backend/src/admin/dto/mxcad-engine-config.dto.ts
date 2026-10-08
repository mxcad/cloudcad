///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateCoordinateLogDto {
  @ApiProperty({
    description:
      '是否启用协同详细日志（写入引擎 mxcad_ini.json 的 coordinate_log_enable）',
    example: false,
  })
  @IsBoolean({ message: 'enabled 必须是布尔值' })
  enabled: boolean;
}

export class MxcadEngineConfigDto {
  @ApiProperty({
    description: '协同详细日志是否启用（与引擎 mxcad_ini.json 实时一致）',
    example: false,
  })
  enabled: boolean;

  @ApiProperty({
    description:
      '引擎本机数据目录（日志位置，来自引擎 about 探测）；探测失败时为 null',
    example: 'C:/Users/MxDrawHome/AppData/Local/MxWebCAD/',
    nullable: true,
    type: String,
  })
  logPath: string | null;
}
