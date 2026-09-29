///////////////////////////////////////////////////////////////////////////////
// 格式决策单一出口（下载/导出方向的目标格式）。
//
// 此前同一批决策散在 4 个文件：mxweb/original 直取 vs 转换的路由判断、pdfParams
// 默认值（'2000'/'2000'/'mono'）组装、format→targetExt 映射、DTO 格式白名单，
// 各写一份且互不引用——漏抄一份即静默丢参数或产出错误格式（368ca55 漏抄 6 字段、
// conversion-runner 的 targetExt 三元把未知格式当成 PDF 产物均属此类）。
// 本模块是这些决策的唯一事实源，调用方只消费其输出。
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { CadDownloadFormat } from '../dto/download-node.dto';

/** 下载/批量下载支持的目标格式白名单（DTO 校验与路由判断共用） */
export const OUTPUT_FORMATS = [
  'mxweb',
  'dwg',
  'dxf',
  'pdf',
  'original',
] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** PDF 引擎参数默认值（2000x2000、单色） */
export const PDF_DEFAULT_WIDTH = '2000';
export const PDF_DEFAULT_HEIGHT = '2000';
export const PDF_DEFAULT_COLOR_POLICY = 'mono';

/** 可转换的源文件扩展名（mxweb 快照 → dwg/dxf/pdf）；其余扩展名无格式转换 */
export const CONVERTIBLE_SOURCE_EXTS = ['.dwg', '.dxf', '.mxweb'] as const;

/** 源文件扩展名是否可转换（供下载路由的 isCadFile 判断） */
export function isConvertibleSourceExt(ext: string): boolean {
  return (CONVERTIBLE_SOURCE_EXTS as readonly string[]).includes(ext);
}

/**
 * 直取格式（不转换）：mxweb/original 走源文件直通，不触发转换，
 * 也不属于导出下载方向（会员门控只看非直取格式）。
 */
export function isDirectFormat(format: string): boolean {
  return format === 'mxweb' || format === 'original';
}

/** 目标格式的引擎参数（宽/高/颜色策略、dwg/dxf 版本） */
export interface OutputFormatParams {
  width?: string;
  height?: string;
  colorPolicy?: string;
  dwgVersion?: number;
}

export interface ResolvedOutputFormat {
  /** true = 需转换（dwg/dxf/pdf）；false = 直取源文件（mxweb/original） */
  needsConversion: boolean;
  /** 转换格式对应的下载枚举（缓存 paramKey/引擎参数共用）；直取格式为 undefined */
  cadFormat?: CadDownloadFormat;
  /** 转换产物扩展名（'.pdf'/'.dwg'/'.dxf'）；直取格式为空串（无转换产物） */
  targetExt: string;
  /**
   * 引擎参数（默认值已应用）：pdf 补齐 2000/2000/mono；dwg/dxf 仅透传 dwgVersion
   * （无版本时为 undefined，调用方不得下发空参数对象）。
   */
  engineParams?: OutputFormatParams;
}

/**
 * 未支持/不可转换格式的统一报错文案（i18n 键 error.file_extra.download_format_unsupported_detail）。
 * FormatPolicy 内部抛错与转换层（conversion-runner 等）的降级错误结果共用，避免各写一份。
 */
export function formatUnsupportedMessage(format: string): string {
  return (
    I18nContext.current()?.t(
      'error.file_extra.download_format_unsupported_detail',
      { args: { format } }
    ) ?? `不支持的下载格式: ${format}`
  );
}

/**
 * 解析目标格式的全部决策（路由、扩展名、枚举、引擎参数默认值）。
 * 未知格式显式抛错——静默回退会把未知格式当成 PDF 产出错误内容。
 */
export function resolveOutputFormat(
  format: string,
  params?: OutputFormatParams
): ResolvedOutputFormat {
  switch (format) {
    case 'mxweb':
    case 'original':
      return { needsConversion: false, targetExt: '' };
    case 'dwg':
    case 'dxf': {
      const engineParams: OutputFormatParams = {};
      if (params?.dwgVersion) engineParams.dwgVersion = params.dwgVersion;
      return {
        needsConversion: true,
        cadFormat:
          format === 'dwg' ? CadDownloadFormat.DWG : CadDownloadFormat.DXF,
        targetExt: `.${format}`,
        engineParams:
          Object.keys(engineParams).length > 0 ? engineParams : undefined,
      };
    }
    case 'pdf':
      return {
        needsConversion: true,
        cadFormat: CadDownloadFormat.PDF,
        targetExt: '.pdf',
        engineParams: {
          width: params?.width || PDF_DEFAULT_WIDTH,
          height: params?.height || PDF_DEFAULT_HEIGHT,
          colorPolicy: params?.colorPolicy || PDF_DEFAULT_COLOR_POLICY,
        },
      };
    default:
      throw new BadRequestException(formatUnsupportedMessage(format));
  }
}

/**
 * 转换格式 → 产物扩展名（'.dwg'/'.dxf'/'.pdf'），供缓存文件名/产物名使用。
 * 直取格式（mxweb/original）没有转换产物，传入即抛错。
 */
export function conversionTargetExt(format: CadDownloadFormat): string {
  const resolved = resolveOutputFormat(format);
  if (!resolved.needsConversion || !resolved.targetExt) {
    throw new BadRequestException(formatUnsupportedMessage(format));
  }
  return resolved.targetExt;
}
