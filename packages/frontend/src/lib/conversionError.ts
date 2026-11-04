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

import { t } from '@/languages';

/**
 * 转换失败提示的唯一映射出口。
 *
 * 后端对每次转换失败结构化下发 `errorCategory`（失败性质分类）+ `error`（具体错误），
 * 但历史上打开图纸的失败 toast 把它们全部折叠成一句兜底「该文件转换失败，请检查文件内容」，
 * 用户看不出是「文件本身有问题」还是「服务/引擎没起来」。
 *
 * 这里把 errorCategory 归成两个用户可见桶 + 对应文案 + 是否可重试，供打开图纸的
 * 三条失败链路（节点 waitForFileReady / 编辑器 useCadFileLoader / 游客 mxcadOpenFile）
 * 与转换面板共用，避免各处再各自兜底。
 *
 * errorCategory 取值与 @cloudcad/contracts 的 CONVERSION_FAILURE_CATEGORIES 一致
 * （timeout/killed/not-started/output-unparseable/content-error/unknown）；入参收窄为
 * string 是因 store 的 ConversionTask 与无节点 SSE payload 透传的是松散 string。
 */

/** 转换失败的两大可见桶 */
export type ConversionErrorKind = 'content' | 'service';

/** 归类结果：桶 + 用户可见主文案 + 是否可重试 + 可选的具体错误细节 */
export interface ConversionErrorInfo {
  kind: ConversionErrorKind;
  /** 主文案（按桶区分，已 i18n） */
  message: string;
  /** 是否建议用户重试（content-error 重试无意义） */
  canRetry: boolean;
  /** 后端返回的具体错误（次要行，诊断用；无则 undefined） */
  detail?: string;
}

/** content-error = 引擎真跑了、判定为文件内容问题，重试注定再失败 */
function isContentError(errorCategory?: string): boolean {
  return errorCategory === 'content-error';
}

/**
 * 把一次转换失败映射成用户可见信息。
 *
 * @param errorCategory 失败性质分类（后端结构化下发，可能为空/未分类）
 * @param error 后端返回的具体错误（次要诊断行，可空）
 */
export function describeConversionError(
  errorCategory?: string,
  error?: string
): ConversionErrorInfo {
  if (isContentError(errorCategory)) {
    return {
      kind: 'content',
      message: t('图纸文件内容异常，转换无法完成，请检查文件或重新导出后再试'),
      canRetry: false,
      detail: error,
    };
  }
  if (errorCategory === 'timeout') {
    return {
      kind: 'service',
      message: t('图纸转换超时，请稍后重试或减小图纸规模'),
      canRetry: true,
      detail: error,
    };
  }
  // killed / not-started / output-unparseable / unknown / 未分类：环境性、引擎或服务侧异常
  return {
    kind: 'service',
    message: t('转换服务异常，请稍后重试；多次失败请联系管理员'),
    canRetry: true,
    detail: error,
  };
}
