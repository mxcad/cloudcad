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
import { IsDefined, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { I18nContext } from 'nestjs-i18n';

/**
 * 更新运行时配置 DTO
 */
export class UpdateRuntimeConfigDto {
  @ApiProperty({
    description: '配置值（string | number | boolean | object）',
    type: Object,
    example: false,
  })
  @IsDefined({ message: () => I18nContext.current()?.t('validation.config_value_required') ?? '配置值不能为空' })
  val: string | number | boolean | Record<string, unknown>;
}

/**
 * 重置配置请求 DTO
 */
export class ResetCategoryDto {
  @ApiProperty({ description: '配置分类', example: 'mail' })
  @IsDefined({ message: () => I18nContext.current()?.t('validation.category_required') ?? '分类不能为空' })
  category: string;
}

/**
 * 应用安全模式 profile 请求 DTO
 */
export class ApplyProfileDto {
  @ApiProperty({
    description: '目标安全模式',
    enum: ['secure', 'normal'],
    example: 'secure',
  })
  @IsDefined({ message: () => I18nContext.current()?.t('validation.profile_required') ?? '模式不能为空' })
  @IsIn(['secure', 'normal'], { message: () => I18nContext.current()?.t('validation.profile_invalid') ?? '模式必须是 secure 或 normal' })
  profile: 'secure' | 'normal';
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

  @ApiPropertyOptional({
    description: '开关依赖声明：本项为 true 时列出的配置项必须同为 true',
    type: [String],
    example: ['mailEnabled'],
  })
  requires?: string[];

  @ApiPropertyOptional({
    description: '通道配置项标记：本项属于哪个通道（如 mail）',
    example: 'mail',
  })
  channel?: string;

  @ApiPropertyOptional({
    description: '通道开关标记：本项是哪个通道的开/关开关（开启须通道配置完整+测试通过）',
    example: 'mail',
  })
  channelSwitch?: string;
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

  @ApiPropertyOptional({
    description: '开关依赖声明：本项为 true 时列出的配置项必须同为 true',
    type: [String],
    example: ['mailEnabled'],
  })
  requires?: string[];

  @ApiPropertyOptional({
    description: '通道配置项标记：本项属于哪个通道（如 mail）',
    example: 'mail',
  })
  channel?: string;

  @ApiPropertyOptional({
    description: '通道开关标记：本项是哪个通道的开/关开关',
    example: 'mail',
  })
  channelSwitch?: string;
}

/**
 * 开关依赖违规（依赖方为开、被依赖项为关）
 */
export class RuntimeConfigDependencyViolationDto {
  @ApiProperty({
    description: '依赖方配置键（功能开关，如 requireEmailVerification）',
    example: 'requireEmailVerification',
  })
  dependent: string;

  @ApiProperty({
    description: '被依赖的配置键（通道/服务开关，如 mailEnabled）',
    example: 'mailEnabled',
  })
  required: string;
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

/**
 * 安全模式 profile 预览条目 DTO
 */
export class RuntimeProfilePreviewResponseDto {
  @ApiProperty({ description: '配置键名', example: 'sessionMaxAge' })
  key: string;

  @ApiProperty({
    description: '值类型',
    enum: ['string', 'number', 'boolean', 'json'],
    example: 'number',
  })
  type: string;

  @ApiProperty({ description: '分类', example: 'security' })
  category: string;

  @ApiProperty({
    description: '当前生效值（含 env 遮蔽后的实际生效值）',
    type: Object,
  })
  currentValue: string | number | boolean | Record<string, unknown>;

  @ApiProperty({
    description: '当前值生效来源',
    enum: ['runtime', 'env', 'default'],
    example: 'default',
  })
  source: string;

  @ApiProperty({
    description: '本次应用的目标值',
    type: Object,
  })
  targetValue: string | number | boolean | Record<string, unknown>;

  @ApiProperty({ description: '本次应用是否会改写该项' })
  willChange: boolean;

  @ApiProperty({ description: '该值曾被人工修改过' })
  isModified: boolean;

  @ApiProperty({
    description: 'env 层当前值；非 null 表示本 key 有 env 层值，应用 profile 后 env 不再决定生效值',
    type: Object,
    nullable: true,
  })
  envValue: string | number | boolean | Record<string, unknown> | null;
}

/**
 * 安全模式 profile 应用结果 DTO
 */
export class RuntimeProfileApplyResponseDto {
  @ApiProperty({
    description: '应用的 profile 名称',
    enum: ['secure', 'normal'],
    example: 'secure',
  })
  profile: string;

  @ApiProperty({ description: '实际写入的 key', type: [String] })
  applied: string[];

  @ApiProperty({ description: '值已等于目标值而跳过的 key', type: [String] })
  unchanged: string[];
}

/**
 * 通道状态 DTO（ADR-0082 D4）：配置完整度 + 验证记录
 */
export class ChannelStatusDto {
  @ApiProperty({ description: '通道名', example: 'mail' })
  channel: string;

  @ApiProperty({
    description: '配置是否完整（必填项生效值均非空）',
    example: true,
  })
  configComplete: boolean;

  @ApiProperty({
    description: '缺失（生效值为空）的必填配置键',
    type: [String],
    example: ['smtpHost', 'smtpPassword'],
  })
  missingKeys: string[];

  @ApiProperty({
    description: '是否存在有效的验证记录（测试通过后写入，配置变更即删除）',
    example: true,
  })
  verified: boolean;

  @ApiPropertyOptional({
    description: '最近一次测试通过时间',
    example: '2026-10-22T08:00:00.000Z',
    nullable: true,
  })
  verifiedAt: Date | null;

  @ApiPropertyOptional({
    description: '最近一次测试操作者 ID',
    nullable: true,
  })
  testedBy: string | null;
}

/**
 * 通道测试请求 DTO
 */
export class TestChannelDto {
  @ApiPropertyOptional({
    description: '测试发信收件人（缺省由通道动作自行决定，如 supportEmail）',
    example: 'admin@example.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  to?: string;
}

/**
 * 通道测试结果 DTO
 */
export class ChannelTestResultDto {
  @ApiProperty({ description: '通道名', example: 'mail' })
  channel: string;

  @ApiProperty({ description: '测试是否通过', example: true })
  ok: boolean;

  @ApiProperty({
    description: '成功说明或失败原因（面向操作员）',
    example: '测试邮件已发送至 admin@example.com',
  })
  message: string;
}
