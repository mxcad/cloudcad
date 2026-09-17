import * as crypto from 'crypto';

/**
 * TOTP 双因素（RFC 6238）自实现，基于 Node 内置 crypto（#415）
 *
 * 为何不用 otplib：otplib 默认 crypto/base32 插件依赖纯 ESM 的
 * @noble/@scure 包，本仓后端为 CommonJS 运行时（tsconfig module=commonjs，
 * Node 20），`require` ESM-only 包会抛 ERR_REQUIRE_ESM——生产与 Jest 均不可用。
 * TOTP 算法本身简单且稳定（HMAC-SHA1 + 动态截断），用 Node crypto 自实现
 * 零外部依赖，生产与测试行为一致。
 *
 * 参数与主流验证器 App 兼容：SHA1 / 6 位 / 30s 周期，±1 时间窗（±30s）。
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** base32 编码（RFC 4648，无填充，Google Authenticator 兼容） */
export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < data.length; i++) {
    value = (value << 5) | data[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** base32 解码（RFC 4648，容忍大小写/空白/填充） */
export function base32Decode(str: string): Uint8Array {
  const clean = str.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error(`非法 base32 字符: ${ch}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

/** 生成随机 TOTP 密钥（Base32 字符串，160 bit） */
export function generateTotpSecret(): string {
  return base32Encode(new Uint8Array(crypto.randomBytes(20)));
}

/**
 * 计算指定时间步的 TOTP 动态码（HMAC-SHA1 + 动态截断，RFC 4226/6238）。
 */
function computeCode(key: Uint8Array, counter: number, digits: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto
    .createHmac('sha1', Buffer.from(key))
    .update(msg)
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}

/**
 * 计算指定时刻的 TOTP 动态码（默认当前时刻）。
 * 用于测试构造有效码、运维 CLI 调试核对。
 */
export function currentTotpCode(
  secretBase32: string,
  options: { epoch?: number; period?: number; digits?: number } = {}
): string {
  const period = options.period ?? 30;
  const digits = options.digits ?? 6;
  const epoch = options.epoch ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / period);
  return computeCode(base32Decode(secretBase32), counter, digits);
}

/**
 * 验证 TOTP 动态码（±1 时间窗：currentStep ± 1，容忍客户端时钟漂移 ±30s）。
 * 恒定时间比较，避免时序侧信道。
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  options: { period?: number; digits?: number; epoch?: number } = {}
): boolean {
  const period = options.period ?? 30;
  const digits = options.digits ?? 6;
  const epoch = options.epoch ?? Math.floor(Date.now() / 1000);
  const key = base32Decode(secretBase32);
  const currentStep = Math.floor(epoch / period);
  for (let i = -1; i <= 1; i++) {
    const expected = computeCode(key, currentStep + i, digits);
    if (constantTimeEqual(expected, token)) {
      return true;
    }
  }
  return false;
}

/** 恒定时间字符串比较（长度不同直接 false） */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}
