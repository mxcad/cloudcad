///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology, Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * MxCAD 服务上下文
 * 用于传递用户、节点等信息
 */
export interface MxCadContext {
  /** 用户ID */
  userId: string;
  /** 用户名 */
  username?: string;
  /** 用户角色 */
  role?: string;
  /** 用户角色（FileSystemNodeContext 兼容，必需字段） */
  userRole: string;
  /** 节点ID */
  nodeId: string;
  /** 文件大小（可选，用于秒传） */
  fileSize?: number;
  /** 冲突策略（可选，用于批量导入） */
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';
}

/**
 * 带可选字段的 MxCAD 服务上下文
 * 用于某些方法的参数
 */
export interface MxCadContextOptional {
  /** 用户ID */
  userId?: string;
  /** 用户名 */
  username?: string;
  /** 用户角色 */
  role?: string;
  /** 节点ID */
  nodeId?: string;
}

/**
 * 服务器文件转换参数
 * 注意：为了兼容旧 API，同时支持驼峰命名和下划线命名
 */
export interface ConvertServerFileParam {
  /** 源文件路径 */
  srcPath: string;
  /** @deprecated 使用 srcPath 代替 */
  srcpath?: string;
  /** 文件哈希 */
  fileHash: string;
  /** @deprecated 使用 fileHash 代替 */
  src_file_md5?: string;
  /** 节点ID */
  nodeId: string;
  /** 是否创建预加载数据 */
  createPreloadingData?: boolean;
  /** 输出文件名 */
  outname?: string;
  /** 命令 */
  cmd?: string;
  /** 宽度 */
  width?: string | number;
  /** 高度 */
  height?: string | number;
  /** 颜色策略 */
  colorPolicy?: string;
  /** 输出 JPG */
  outjpg?: string;
  /** 是否异步 */
  async?: string;
  /** 结果回调 URL */
  resultposturl?: string;
}
