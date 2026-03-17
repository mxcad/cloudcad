///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import type { Request as ExpressRequest } from 'express';

/**
 * 扩展 Express Request 类型，添加自定义属性
 */
export interface AuthenticatedRequest extends Omit<ExpressRequest, 'session'> {
  /** 用户信息 */
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
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
