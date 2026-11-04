import { t } from '@/languages';

/**
 * 转换失败提示的唯一映射出口（移动端，对齐 PC 的 lib/conversionError.ts）。
 *
 * 后端对每次转换失败结构化下发 `errorCategory`（失败性质分类）+ `error`（具体错误）。
 * 移动端打开本地 .dwg/.dxf 走无节点公开转换链路，历史上一律弹笼统的「转换失败」，
 * 用户看不出是「文件本身有问题」还是「服务/引擎没起来」。这里把 errorCategory 归成
 * 两个用户可见桶 + 对应文案 + 是否可重试，供打开/插入块等消费点共用。
 *
 * errorCategory 取值与 @cloudcad/contracts 的 CONVERSION_FAILURE_CATEGORIES 一致
 * （timeout/killed/not-started/output-unparseable/content-error/unknown）；入参收窄为
 * string 是因无节点 SSE payload 透传的是松散 string。
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
  if (errorCategory === 'content-error') {
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
