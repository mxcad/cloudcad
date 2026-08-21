import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * VIP 专属功能未授权异常（HTTP 403，业务码 VIP_FEATURE_REQUIRED）。
 *
 * 用于导出下载方向（mxweb → 其他格式）转换的会员门控：
 * 非 VIP 用户（含游客）在运行时开关未开放时触发，前端据此弹购买会员引导。
 */
export class VipFeatureRequiredException extends HttpException {
  constructor(message: string, feature?: string) {
    super(
      {
        code: 'VIP_FEATURE_REQUIRED',
        message,
        ...(feature ? { feature } : {}),
      },
      HttpStatus.FORBIDDEN,
    );
    this.name = 'VipFeatureRequiredException';
  }
}
