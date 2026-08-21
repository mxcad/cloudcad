import type { InjectionToken } from '@nestjs/common';

/**
 * 文件转换服务注入令牌
 * 用于注入 IMxcadConversionService 实现
 */
export const MXCAD_CONVERSION_SERVICE: InjectionToken =
  Symbol('MXCAD_CONVERSION_SERVICE');

/**
 * 文件保存服务注入令牌
 * 用于注入 IMxcadSaveService 实现
 */
export const MXCAD_SAVE_SERVICE: InjectionToken =
  Symbol('MXCAD_SAVE_SERVICE');
