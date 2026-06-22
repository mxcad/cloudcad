import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

const WECHAT_IP_WHITELIST = [
  '103.244.8.0/24',
  '103.244.52.0/24',
  // Add more WeChat IP ranges as needed
];

function ipInCIDR(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
  const ipNum = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  const rangeNum = range.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

@Injectable()
export class WechatIpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.connection?.remoteAddress || '';
    return WECHAT_IP_WHITELIST.some((cidr) => ipInCIDR(ip, cidr));
  }
}
