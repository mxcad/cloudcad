import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

function resolveWhitelist(): string[] {
  const env = process.env.WECHAT_IP_WHITELIST;
  if (env) return env.split(',').map((s) => s.trim());
  return [
    '103.244.8.0/24',
    '103.244.52.0/24',
  ];
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
  // 使用无符号右移构建掩码，避免 2**32 溢出
  const mask = bits === 0 ? 0 : ~((-1) >>> bits);
  const ipNum = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  const rangeNum = range.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

@Injectable()
export class WechatIpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip = getClientIp(req);
    const whitelist = resolveWhitelist();
    return whitelist.some((cidr) => ipInCIDR(ip, cidr));
  }
}
