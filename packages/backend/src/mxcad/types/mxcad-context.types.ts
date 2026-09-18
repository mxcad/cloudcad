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

import type { ConversionRequest } from '@cloudcad/contracts';

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
  /** 客户端 IP（游客转换频率限制按 IP 计数，ADR-0043） */
  ip?: string;
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
 *
 * 引擎输入字段部分从 @cloudcad/contracts 的 ConversionRequest 派生
 * （= ENGINE_INPUT_FIELDS 唯一清单的映射类型，ADR-0064/0069）：
 * 新增引擎字段只改 contracts 一处，本入口形状随之变化，convertServerFile 的
 * 映射漏字段会在编译期报错，而非运行期静默丢弃（368ca55 漏抄裁剪框 6 字段
 * 致 cut_dwg/print_to_pdf 静默回 {"message":"false"} 的成因）。
 *
 * 注意：为了兼容旧 API，同时支持驼峰命名和下划线命名（srcpath/src_file_md5）。
 */
export interface ConvertServerFileParam extends ConversionRequest {
  /** @deprecated 使用 srcPath 代替 */
  srcpath?: string;
  /** @deprecated 使用 fileHash 代替 */
  src_file_md5?: string;
  /** 节点ID */
  nodeId: string;
  /** 发起转换的用户 ID（游客/匿名不传）；用于导出下载方向（mxweb→其他）的会员门控 */
  userId?: string;
  /** 是否异步 */
  async?: string;
  /** 结果回调 URL */
  resultposturl?: string;
  /** 任务优先级，'high' 优先执行（默认），'low' 仅在高优队列空闲时执行 */
  priority?: 'high' | 'low';
}
