import {
  cidrContains,
  isValidIpOrCidr,
  normalizeIp,
} from '../../ip-blacklist/ip-blacklist.utils';

/**
 * 客户端 IP 提取（单一实现，供各控制器/上下文构建器复用）：
 * X-Forwarded-For 首个地址优先（经代理时），其次 x-real-ip，最后回退 socket 地址。
 * 用于游客转换频率限制按 IP 计数（ADR-0043）等场景。
 *
 * 注意：本函数信任客户端可控的 X-Forwarded-For 头（getClientIp 语义），
 * 仅适用于黑名单/限流等 fail-open 场景。**安全边界（如管理员登录 IP 白名单）
 * 必须使用 getAdminClientIp**，避免伪造 XFF 绕过。
 */
export function getClientIp(req: {
  headers?: Record<string, unknown>;
  ip?: string;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}): string {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return String(forwardedFor[0]).trim();
  }
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]!.trim();
  }
  const realIp = req.headers?.['x-real-ip'];
  if (Array.isArray(realIp) && realIp.length > 0) {
    return String(realIp[0]).trim();
  }
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return (
    (req.ip as string) ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/** 请求对象的最小结构（真实对端 + 可选头） */
interface IpRequestLike {
  headers?: Record<string, unknown>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}

/** 真实 TCP 对端地址（不可被客户端伪造） */
function getSocketRemoteAddress(req: IpRequestLike): string | undefined {
  return req.socket?.remoteAddress || req.connection?.remoteAddress;
}

/** 命中可信代理段（精确 IP 或 CIDR，版本一致） */
function matchesTrustedProxy(remoteAddress: string, trustedProxies: string[]): boolean {
  const normalized = normalizeIp(remoteAddress);
  if (!normalized) return false;
  return trustedProxies.some((proxy) => {
    const proxyIp = normalizeIp(proxy);
    if (!proxyIp) return false;
    return proxyIp.includes('/')
      ? cidrContains(proxy, normalized)
      : proxyIp === normalized;
  });
}

/** 从 X-Forwarded-For 链取最右侧地址（由最近的受信代理追加，客户端无法伪造最右项） */
function getRightmostForwardedFor(req: IpRequestLike): string | undefined {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwardedFor)
    ? String(forwardedFor[forwardedFor.length - 1])
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',').pop()
      : undefined;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return normalizeIp(raw.trim());
}

/**
 * 安全客户端 IP 提取（用于管理员登录 IP 白名单等安全边界判定）
 *
 * 核心原则：基于**不可伪造**的真实连接地址，绝不信赖客户端可控的 XFF 头。
 * - 取 TCP 层真实对端地址（req.socket.remoteAddress，客户端无法伪造）；
 * - 若真实对端命中「可信反向代理段」（配置 adminIpWhitelist.trustedProxies，
 *   默认 127.0.0.1/::1），说明请求经受信代理转发，此时才信任
 *   X-Forwarded-For **最右侧**地址（该地址由最近的可信代理追加，
 *   客户端伪造注入在最左侧的最右项不受影响）；
 * - 其余情形（直连客户端）一律返回真实对端地址，伪造 XFF 无效。
 *
 * 修复：直接信任 X-Forwarded-For 首个地址 + app.set('trust proxy', true) 的组合，
 * 在直连部署下可被客户端伪造头绕过白名单（安全漏洞）。
 */
export function getAdminClientIp(
  req: IpRequestLike,
  trustedProxies: string[]
): string {
  const remoteAddress = getSocketRemoteAddress(req);
  if (!remoteAddress) return 'unknown';

  const normalized = normalizeIp(remoteAddress);
  if (matchesTrustedProxy(remoteAddress, trustedProxies)) {
    // 经可信代理：取 XFF 最右侧（可信代理追加的真实客户端 IP）
    return getRightmostForwardedFor(req) || normalized;
  }
  return normalized || 'unknown';
}

/** 过滤合法可信代理项（供配置校验复用，非法项跳过） */
export function sanitizeTrustedProxies(values: string[]): string[] {
  return [...new Set(values.filter((v) => isValidIpOrCidr(v)))];
}
