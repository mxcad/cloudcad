import type { InjectionToken } from '@nestjs/common';

/**
 * 跨层 DI token（单一事实源）。
 *
 * 这些 token 被 Layer2 模块（如 file-system）与 Layer3 模块（mxcad）共同消费。
 * 符号定义在此（Layer1 common），两侧都从本文件取值，避免 Layer2 值导入 Layer3
 * 造成的依赖方向违规（ADR-0007）。mxcad 侧通过 re-export 保持既有引用不变，
 * 保证全应用只有同一个 Symbol 实例，DI 解析一致。
 */

/** 文件转换服务注入令牌（IMxcadConversionService 实现） */
export const MXCAD_CONVERSION_SERVICE: InjectionToken =
  Symbol('MXCAD_CONVERSION_SERVICE');
