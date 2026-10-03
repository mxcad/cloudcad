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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

/**
 * 更新运行时配置 DTO
 */
export class UpdateRuntimeConfigDto {
  @ApiProperty({
    description: '配置值（string | number | boolean | object）',
    type: Object,
    example: false,
  })
  @IsDefined({ message: '配置值不能为空' })
  val: string | number | boolean | Record<string, unknown>;
}

/**
 * 重置配置请求 DTO
 */
export class ResetCategoryDto {
  @ApiProperty({ description: '配置分类', example: 'mail' })
  @IsDefined({ message: '分类不能为空' })
  category: string;
}

/**
 * 枚举可选项
 */
export class ConfigEnumOptionDto {
  @ApiProperty({ description: '值', example: 'off' })
  value: string;

  @ApiProperty({ description: '显示标签', example: '关闭' })
  label: string;
}

/**
 * 类型感知的输入控件元数据
 */
export class ConfigInputMetaDto {
  @ApiPropertyOptional({ description: '数字下限', example: 1 })
  min?: number;

  @ApiPropertyOptional({ description: '数字上限', example: 1000 })
  max?: number;

  @ApiPropertyOptional({ description: '数字步长', example: 100 })
  step?: number;

  @ApiPropertyOptional({ description: '单位', example: 'MB' })
  unit?: string;

  @ApiPropertyOptional({
    description: '枚举可选项（存在时前端渲染下拉）',
    type: [ConfigEnumOptionDto],
  })
  options?: ConfigEnumOptionDto[];

  @ApiPropertyOptional({ description: '字符串最大长度', example: 200 })
  maxLength?: number;

  @ApiPropertyOptional({ description: '多行文本' })
  multiline?: boolean;

  @ApiPropertyOptional({ description: '占位提示', example: '多个邮箱用逗号分隔' })
  placeholder?: string;

  @ApiPropertyOptional({ description: '输入时遮罩' })
  secret?: boolean;

  @ApiPropertyOptional({ description: '允许空值（清空回到默认值）' })
  allowNull?: boolean;
}

/**
 * 运行时配置项响应 DTO
 */
export class RuntimeConfigResponseDto {
  @ApiProperty({ description: '配置键名', example: 'mailEnabled' })
  key: string;

  @ApiProperty({
    description: '配置值（string | number | boolean | object）',
    type: Object,
    example: false,
  })
  value: string | number | boolean | Record<string, unknown>;

  @ApiProperty({
    description: '值类型',
    enum: ['string', 'number', 'boolean', 'json'],
    example: 'boolean',
  })
  type: string;

  @ApiProperty({ description: '分类', example: 'mail' })
  category: string;

  @ApiPropertyOptional({ description: '配置说明', example: '邮件服务开关' })
  description?: string;

  @ApiProperty({ description: '是否公开给前端', example: true })
  isPublic: boolean;

  @ApiPropertyOptional({ description: '最后修改人 ID' })
  updatedBy?: string;

  @ApiProperty({
    description: '最后更新时间',
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: '定义默认值',
    type: Object,
    example: false,
  })
  defaultValue?: string | number | boolean | Record<string, unknown>;

  @ApiPropertyOptional({
    description: '当前值生效来源',
    enum: ['runtime', 'env', 'default'],
    example: 'runtime',
  })
  source?: string;

  @ApiPropertyOptional({
    description: '是否被显式修改过（区别于安装时写入的默认行）',
  })
  isModified?: boolean;

  @ApiPropertyOptional({
    description: 'env 层当前值（若配置了 envKey 且 env 已设置）',
    type: Object,
    nullable: true,
  })
  envValue?: string | number | boolean | Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: '显示层级',
    enum: ['user', 'admin', 'advanced'],
    example: 'admin',
  })
  tier?: string;

  @ApiPropertyOptional({
    description: '输入控件元数据',
    type: ConfigInputMetaDto,
  })
  input?: ConfigInputMetaDto;

  @ApiPropertyOptional({
    description: '影响说明：改了会怎样',
    example: '关闭后邮件验证码发送全部停止',
  })
  impact?: string;

  @ApiPropertyOptional({
    description: '危险项：改动需二次确认',
    example: true,
  })
  dangerous?: boolean;

  @ApiPropertyOptional({
    description: '改动是否即时生效',
    example: true,
  })
  hot?: boolean;
}

/**
 * 运行时配置定义 DTO
 */
export class RuntimeConfigDefinitionDto {
  @ApiProperty({ description: '配置键名', example: 'mailEnabled' })
  key: string;

  @ApiProperty({
    description: '值类型',
    enum: ['string', 'number', 'boolean', 'json'],
    example: 'boolean',
  })
  type: string;

  @ApiProperty({ description: '分类', example: 'mail' })
  category: string;

  @ApiProperty({ description: '配置说明', example: '邮件服务开关' })
  description: string;

  @ApiProperty({
    description: '默认值',
    type: Object,
    example: false,
  })
  defaultValue: string | number | boolean | Record<string, unknown>;

  @ApiProperty({ description: '是否公开给前端', example: true })
  isPublic: boolean;

  @ApiPropertyOptional({
    description: '显示层级',
    enum: ['user', 'admin', 'advanced'],
    example: 'admin',
  })
  tier?: string;

  @ApiPropertyOptional({
    description: '输入控件元数据',
    type: ConfigInputMetaDto,
  })
  input?: ConfigInputMetaDto;

  @ApiPropertyOptional({ description: '影响说明' })
  impact?: string;

  @ApiPropertyOptional({ description: '危险项标记' })
  dangerous?: boolean;

  @ApiPropertyOptional({ description: '即时生效标记' })
  hot?: boolean;

  @ApiPropertyOptional({
    description: '底层 env 变量名（部署期默认值层）',
    example: 'SESSION_MAX_AGE',
  })
  envKey?: string;
}

/**
 * 配置修改历史记录 DTO
 */
export class RuntimeConfigHistoryDto {
  @ApiProperty({ description: '记录 ID' })
  id: string;

  @ApiProperty({ description: '配置键名', example: 'maxFileSize' })
  key: string;

  @ApiPropertyOptional({ description: '修改前值（JSON 字符串）' })
  oldValue?: string;

  @ApiProperty({ description: '修改后值（JSON 字符串）' })
  newValue: string;

  @ApiPropertyOptional({ description: '操作人 ID' })
  operatorId?: string;

  @ApiPropertyOptional({ description: '操作人 IP' })
  operatorIp?: string;

  @ApiProperty({
    description: '修改时间',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;
}
