import type { InjectionToken } from '@nestjs/common';

/**
 * 转换访问门控接口：导出下载方向（mxweb → 其他格式）的会员授权检查。
 *
 * 定义在 Layer1（CommonModule 基础设施）以遵守 ADR-0007 三层依赖方向：
 * 转换服务（Layer3 MxcadModule/ConversionModule）与 VIP 模块（Layer2）
 * 都只依赖 Layer1 的此抽象，互不反向依赖；实现由 VIP 模块提供，
 * 转换服务通过 @Optional() 注入（未注入实现时跳过门控，测试/内部场景）。
 */
export interface IConversionAccessGuard {
  /**
   * 断言导出下载方向转换被允许：VIP 放行；非 VIP（含游客）在运行时开关
   * freeExportDownloadEnabled 打开后放行，否则抛 VipFeatureRequiredException（403）。
   * @param userId 登录用户 ID；游客/匿名不传
   */
  assertExportDownloadAllowed(userId?: string): Promise<void>;
}

/** 转换访问门控注入令牌（@Optional()，未注入时跳过门控） */
export const CONVERSION_ACCESS_GUARD: InjectionToken =
  Symbol('CONVERSION_ACCESS_GUARD');
