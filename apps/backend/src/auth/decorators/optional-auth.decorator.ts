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

import { SetMetadata } from '@nestjs/common';

/**
 * 可选认证装饰器
 *
 * 标记接口为"可选认证"模式：
 * - 如果用户已登录（Token 或 Session），则验证并附加用户信息到 request.user
 * - 如果用户未登录，不抛出异常，允许请求继续（request.user 为 undefined）
 *
 * 使用场景：
 * - 公开资源库的缩略图访问（公开资源库允许匿名，项目文件需要登录）
 * - 公开文档的预览访问
 *
 * @example
 * ```ts
 * @Get('nodes/:nodeId/thumbnail')
 * @OptionalAuth()
 * async getThumbnail(@Param('nodeId') nodeId: string, @Request() req) {
 *   // req.user 可能为 undefined
 *   if (!req.user) {
 *     // 检查是否为公开资源库
 *   }
 * }
 * ```
 */
export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
