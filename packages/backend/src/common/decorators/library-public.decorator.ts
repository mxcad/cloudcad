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
 * 公共资源库公开访问装饰器
 *
 * 标记接口为"公共资源库节点公开访问"模式：
 * - 当请求目标节点属于公共资源库（图纸库/图块库，含库内文件/文件夹）时，
 *   RequireProjectPermissionGuard 直接放行，不要求 LIBRARY_*_MANAGE 系统权限
 * - 当请求目标节点不属于公共资源库时，仍走原有项目权限校验
 *
 * 使用场景（公共资源库读公开设计，见 LibraryController 注释）：
 * - 缩略图读取（未登录用户 / 普通用户均可浏览库缩略图）
 * - 缩略图上传（打开库图纸时前端生成并补传缩略图，属于读场景辅助操作）
 *
 * @example
 * ```ts
 * @Get('nodes/:nodeId/thumbnail')
 * @Public()
 * @LibraryPublicAccess()
 * async getThumbnail(...) { ... }
 * ```
 */
export const IS_LIBRARY_PUBLIC_KEY = 'isLibraryPublicAccess';
export const LibraryPublicAccess = () => SetMetadata(IS_LIBRARY_PUBLIC_KEY, true);
