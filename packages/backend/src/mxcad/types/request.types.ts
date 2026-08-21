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

import type { Request as ExpressRequest } from 'express';
import type { AuthenticatedUser } from '../../common/types/request.types';

/**
 * 扩展 Express Request 类型，添加自定义属性
 */
export interface AuthenticatedRequest extends Omit<ExpressRequest, 'session'> {
  /** 用户信息 */
  user?: AuthenticatedUser;
  /** 会话信息 */
  session?: {
    userId?: string;
    [key: string]: unknown;
  };
}

/**
 * MxCAD 模块的 Request 类型
 */
export type MxCadRequest = AuthenticatedRequest;
