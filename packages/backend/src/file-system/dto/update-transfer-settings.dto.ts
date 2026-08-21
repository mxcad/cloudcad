import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CrossProjectTransferMode } from '@cloudcad/db';

const TRANSFER_MODES = Object.values(CrossProjectTransferMode);

/**
 * 跨项目转移设置更新 DTO（6 域模式矩阵，全部可选=部分更新）
 */
export class UpdateTransferSettingsDto {
  @ApiPropertyOptional({
    description: '出向：本项目文件 → 其他项目',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferOutToProject?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '出向：本项目文件 → 个人空间（默认禁止，防图纸私有化）',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferOutToPersonalSpace?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '出向：本项目文件 → 公共资源库（发布，默认仅复制）',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferOutToLibrary?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '入向：其他项目文件 → 本项目',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferInFromProject?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '入向：个人空间文件 → 本项目',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferInFromPersonalSpace?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '入向：公共资源库文件 → 本项目',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferInFromLibrary?: CrossProjectTransferMode;
}
