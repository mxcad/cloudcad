import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';

/** 默认白名单：仅覆盖微信支付历史回源段（部分） */
const DEFAULT_WHITELIST = ['103.244.8.0/24', '103.244.52.0/24'];

function resolveWhitelist(): string[] {
  const env = process.env.WECHAT_IP_WHITELIST;
  if (env) return env.split(',').map((s) => s.trim());
  return DEFAULT_WHITELIST;
}

/**
 * 强制模式开关（默认 log-only 放行）。
 * 微信官方商户文档《回调通知注意事项》明确：回调出口 IP 段不固定且会变更，
 * 不可依赖 IP 白名单做强校验，回调可信性以商户密钥验签为准。
 * 实例：2026-08-19 生产故障——真实微信回调 IP 不在默认白名单被 403 拒绝，
 * 订单停留 PENDING，用户已扣款但会员未开通。
 * 安全边界：本 Guard 仅是附加防御层；核心屏障是
 * WechatPayGateway.verifyWebhook 的签名校验（MD5/HMAC-SHA256 + 商户 API key），
 * 无 API key 无法伪造合法签名，故 log-only 放行不降低回调可信性。
 */
function resolveEnforceMode(): boolean {
  return process.env.WECHAT_IP_GUARD_ENFORCE === 'true';
}

function getClientIp(req: any): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const ip = forwarded.split(',')[0].trim();
    if (ip) return ip;
  }
  return req.ip || req.connection?.remoteAddress || '';
}

function ipInCIDR(ip: string, cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;
  const [range, bitsStr] = parts;
  const bits = parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  // 使用无符号右移构建掩码，避免 2**32 溢出；bits=32 时左移位数不取模
  const mask = bits === 0 ? 0 : ((0xFFFFFFFF << (32 - bits)) >>> 0);
  const ipNum = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  const rangeNum = range.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

@Injectable()
export class WechatIpGuard implements CanActivate {
  private readonly logger = new Logger(WechatIpGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip = getClientIp(req);
    const whitelist = resolveWhitelist();
    const inWhitelist = whitelist.some((cidr) => ipInCIDR(ip, cidr));

    if (inWhitelist) return true;

    // 白名单外来源必须留痕（无论放行或拒绝），为回调丢失/资损排查提供线索。
    // 注意：getClientIp 取 X-Forwarded-For 首个值可被伪造，enforce 模式要求
    // 部署在反向代理已剥离不可信 XFF 头的环境，否则白名单可被绕过。
    if (resolveEnforceMode()) {
      this.logger.warn(
        `wechat webhook rejected by IP guard (enforce mode): ip=${ip}`
      );
      return false;
    }

    this.logger.warn(
      `wechat webhook from non-whitelisted IP, passed in log-only mode: ip=${ip}. ` +
        `Set WECHAT_IP_GUARD_ENFORCE=true to enforce the whitelist`
    );
    return true;
  }
}
