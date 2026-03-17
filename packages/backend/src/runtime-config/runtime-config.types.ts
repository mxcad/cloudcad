///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 运行时配置值类型
 */
export type RuntimeConfigValueType = 'string' | 'number' | 'boolean';

/**
 * 运行时配置分类
 */
export type RuntimeConfigCategory = 
  | 'mail' 
  | 'support' 
  | 'file' 
  | 'user' 
  | 'system';

/**
 * 运行时配置项定义
 */
export interface RuntimeConfigDefinition {
  key: string;
  type: RuntimeConfigValueType;
  category: RuntimeConfigCategory;
  description: string;
  defaultValue: string | number | boolean;
  isPublic: boolean;
}

/**
 * 运行时配置项（API 返回格式）
 */
export interface RuntimeConfigItem {
  key: string;
  value: string | number | boolean;
  type: RuntimeConfigValueType;
  category: RuntimeConfigCategory;
  description: string | null;
  isPublic: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}
