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

/**
 * MxCAD 转换结果。
 *
 * 结构定义在 @cloudcad/contracts 的 conversion/mxcad-engine-contract.ts（与 conversion-service
 * runner 共用同一份，ADR-0064/0069）。此处 import + re-export，既建立本地绑定供下方
 * ConversionResult.ret 使用，又保留历史命名出口，调用方无需改动。
 */
import type {
  MxCadConversionResult,
  ConversionFailureCategory,
} from '@cloudcad/contracts';

export type { MxCadConversionResult };

/**
 * 文件转换抽象接口
 * 解耦具体的转换工具实现（MxCAD、其他CAD转换工具等）
 */
export interface ConversionResult {
  /** 是否成功 */
  isOk: boolean;
  /** 转换结果数据 */
  ret: MxCadConversionResult;
  /** 错误信息 */
  error?: string;
  /**
   * 失败是否为瞬态（true = 超时 / mxcadassembly 进程未启动 / 输出无法解析等环境性失败）。
   *
   * 与 conversion-service `ConversionExecutionError.deterministic` 语义对齐：
   * - transient=true → 环境性失败，重试可能成功（引擎配置/路径/资源问题）；
   * - transient=false → 确定性内容失败（引擎返回非 0 code，如 read file error），
   *   同一输入重试注定再失败。
   *
   * 用于：① 调用方日志/上报区分「环境性失败（可重试）」与「确定性内容失败」；
   * ② 面板按 transient 展示不同的错误文案与重试提示。
   * 注：两类失败都保留 FAILED 节点（不再硬删），transient 不决定节点生死；
   * 且不再据此短路后续转换——同内容重新提交仍会真实调用引擎（ADR-0067：无永久失败机制）。
   * 此前进程内路径两类失败无法区分，超时也被判成「解析输出失败」。
   */
  transient?: boolean;
  /**
   * 失败性质分类（结构化，@cloudcad/contracts）。
   *
   * 与 transient 同源但保留完整粒度：transient 是「可重试/不可重试」的二值派生，
   * errorCategory 是六值分类（timeout/killed/not-started/output-unparseable/
   * content-error/unknown），供审计按失败类型告警、面板按 content-error 门控重试。
   * 仅 FAILED 有意义；成功路径为 undefined。
   */
  errorCategory?: ConversionFailureCategory;
}

export interface ConversionOptions {
  /** 源文件路径 */
  srcPath: string;
  /** 文件哈希 */
  fileHash: string;
  /**
   * bin→mxweb 方向的输出目录（引擎字段 outpath，与 ConversionRequest 对齐）。
   * buildEngineParams 见 outpath 存在即走 binToMxweb 分支（不携带内容哈希）。
   */
  outpath?: string;
  /** 发起转换的用户 ID（游客/匿名不传）；用于导出下载方向（mxweb→其他）的会员门控 */
  userId?: string;
  /** 是否创建预加载数据 */
  createPreloadingData?: boolean;
  /** 压缩选项 */
  compression?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 输出文件名（用于 savedwg、savepdf、print_to_pdf、cut_dwg、cut_mxweb 等接口）
   * 支持的格式：
   * - .mxweb - MxCAD Web 格式（默认）
   * - .dwg - AutoCAD DWG 格式
   * - .dxf - AutoCAD DXF 格式
   * - .pdf - PDF 格式
   * 示例： "output.mxweb", "drawing.dwg", "preview.pdf"
   */
  outname?: string;
  /** 命令类型（用于特定转换操作）
   * 可选值：
   * - "print_to_pdf" - 打印为 PDF
   * - "cut_dwg" - 裁剪 DWG 文件
   * - "cut_mxweb" - 裁剪 MXWEB 文件
   */
  cmd?: string;
  /** PDF 输出宽度（像素）
   * 用于 print_to_pdf 和 savepdf 接口
   * 默认值： "2000"
   */
  width?: string;
  /** PDF 输出高度（像素）
   * 用于 print_to_pdf 和 savepdf 接口
   * 默认值： "2000"
   */
  height?: string;
  /** 颜色策略
   * 用于 print_to_pdf 和 savepdf 接口
   * 可选值：
   * - "mono" - 单色（黑白，默认）
   * - "color" - 彩色
   */
  colorPolicy?: string;
  /** JPG 输出参数（传递给 cadtojpg 工具）
   * 用于 /convert 接口，生成 JPG 预览图
   * 参数格式：命令行参数字符串，多个参数用空格分隔
   * 支持的参数（根据 cadtojpg 工具支持情况）：
   * - width - 输出宽度（像素）
   * - height - 输出高度（像素）
   * - quality - JPEG 质量（0-100）
   * 示例： "width=800 height=600 quality=90"
   * 注意：此参数仅用于调用 cadtojpg 工具，不影响主转换输出
   */
  outjpg?: string;
  /** 是否异步转换 */
  async?: string;
  /** 异步结果回调 URL */
  resultposturl?: string;
  /** 追踪 ID */
  traceid?: string;
  /** 旋转角度（用于 print_to_pdf） */
  roate_angle?: number;
  /** 视角角度（用于 print_to_pdf） */
  view_angle?: number;
  /** 裁剪框点 1 X */
  bd_pt1_x?: string;
  /** 裁剪框点 1 Y */
  bd_pt1_y?: string;
  /** 裁剪框点 2 X */
  bd_pt2_x?: string;
  /** 裁剪框点 2 Y */
  bd_pt2_y?: string;
  /** 当前打开文件的 MD5 */
  open_file_md5?: string;
  /** 布局名称 */
  layout_name?: string;
  /** 是否创建裁剪块 */
  create_clip_block?: boolean;
  /** DWG/DXF 版本号 */
  dwgVersion?: number;
  /** 转换失败时用于保存调试信息的节点ID（目录名） */
  debugNodeId?: string;
  /** 任务优先级，'high' 优先执行（默认），'low' 仅在高优队列空闲时执行 */
  priority?: 'high' | 'low';
  /** 跳过导出下载方向（mxweb→其他）的会员门控。
   * 仅用于转换方向推导会被误判为"导出下载"的内部转换（如保存时生成 bin 文件：mxweb→bin）。
   * 用户主动触发的导出下载（savepdf/savedwg/批量下载等）禁止设置此标志。 */
  skipExportGate?: boolean;
}
