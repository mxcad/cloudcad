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

/**
 * 检查分片响应 DTO
 */
export class CheckChunkResponseDto {
  @ApiProperty({ description: '分片是否存在' })
  exist: boolean;
}

/**
 * 上传分片响应 DTO
 */
export class UploadChunkResponseDto {
  @ApiProperty({ description: '上传结果', example: 'success' })
  ret: string;

  @ApiProperty({ description: '是否为最后一个分片', required: false })
  isLastChunk?: boolean;
}

/**
 * 合并完成响应 DTO（返回文件信息）
 */
export class MergeCompleteResponseDto {
  @ApiProperty({ description: '操作结果', example: 'success' })
  ret: string;

  @ApiProperty({ description: '文件哈希' })
  hash: string;

  @ApiProperty({ description: '原始文件名' })
  fileName: string;
}

/**
 * 临时令牌信息（Redis 存储结构）
 */
export interface TempTokenInfo {
  /** 文件路径 */
  filePath: string;
  /** 原始文件名 */
  fileName: string;
  /** 文件大小 */
  fileSize: number;
  /** 创建时间戳 */
  createdAt: number;
}
