import type { InjectionToken } from '@nestjs/common';

/**
 * 文件转换服务注入令牌
 * 符号定义在 common/di-tokens（单一事实源，供 Layer2 与 Layer3 共同消费），
 * 此处 re-export 保持既有 mxcad 侧引用不变。
 */
export { MXCAD_CONVERSION_SERVICE } from '../../common/di-tokens';

/**
 * 文件保存服务注入令牌
 * 用于注入 IMxcadSaveService 实现
 */
export const MXCAD_SAVE_SERVICE: InjectionToken =
  Symbol('MXCAD_SAVE_SERVICE');
