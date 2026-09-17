import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { AppConfig } from '../../config/app.config';

/**
 * PII 密文存储格式（与 TOTP secret 一致）：enc:v1:<iv base64>:<ciphertext base64>:<authTag base64>
 * 前缀含版本位，为密钥轮换预留（轮换时新密文用新版本前缀，旧版按 v1 解密）。
 */
const CIPHER_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;

/**
 * 密钥解析：env 显式设置时必须解码为恰好 32 字节（64 位 hex 或 base64），
 * 否则启动即抛错（等保 8.1.4.8 密钥长度校验）；未设置时 SHA-256 归一化回退
 * （开发环境可用，生产部署应显式设置独立密钥，见 .env.example 注释）。
 * TODO(#424): 密钥轮换策略未实现——轮换需密文版本位 + 双密钥并行解密窗口。
 */
export function resolvePiiKey(raw: string | undefined, fallback: string): Buffer {
  if (raw && raw.trim() !== '') {
    const trimmed = raw.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
    throw new Error(
      `PII 密钥必须为 32 字节（64 位 hex 或 base64 编码），实际解码为 ${decoded.length} 字节`
    );
  }
  return crypto.createHash('sha256').update(fallback).digest();
}

/** 手机号归一化：去全部空白、去 +86 前缀（库内存储口径：11 位裸号） */
export function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/^\+86/, '');
}

/** 邮箱归一化：trim + 小写 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 手机号掩码：138****5678（不足 7 位原样返回，防越界） */
export function maskPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) return phone;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

/** 邮箱掩码：j***@example.com（用户名段仅保留首字符；无 @ 时仅保留首字符） */
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  if (at <= 0) return normalized.length > 0 ? `${normalized[0]}***` : '';
  return `${normalized[0]}***${normalized.slice(at)}`;
}

/** 登录账号（email/phone/username 混合）掩码：含 @ 按邮箱掩码、符合手机号形态按手机号掩码，否则原样（用户名非 PII） */
export function maskAccount(account: string): string {
  if (!account) return account;
  if (account.includes('@')) return maskEmail(account);
  if (/^(\+?86)?1[3-9]\d{9}$/.test(account.replace(/\s+/g, ''))) {
    return maskPhone(account);
  }
  return account;
}

/** AES-256-GCM 加密，输出 enc:v1:<iv>:<ciphertext>:<authTag>（均 base64） */
export function encryptPii(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    CIPHER_PREFIX +
    [
      iv.toString('base64'),
      ciphertext.toString('base64'),
      tag.toString('base64'),
    ].join(':')
  );
}

/** 解密 enc:v1 格式密文；格式非法或 authTag 校验失败抛错 */
export function decryptPii(stored: string, key: Buffer): string {
  if (!stored.startsWith(CIPHER_PREFIX)) {
    throw new Error(`PII 密文格式非法: ${stored.slice(0, 16)}...`);
  }
  const parts = stored.slice(CIPHER_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error(`PII 密文格式非法: ${stored.slice(0, 16)}...`);
  }
  const [ivB64, ciphertextB64, tagB64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** HMAC-SHA256 归一化索引（hex）——查询等值匹配用 */
export function hmacIndex(normalizedValue: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(normalizedValue).digest('hex');
}

/**
 * PII 字段级加密服务（#417 等保 8.1.4.8）
 *
 * - users.phone / users.email 以 AES-256-GCM 密文落库（enc:v1 格式），明文列保留至收缩阶段；
 * - 查询走 HMAC-SHA256(归一化值) hex 索引列（phoneHmac/emailHmac）等值匹配；
 * - 审计 details 的 phone/email 写入口用 maskPhone/maskEmail 部分掩码。
 */
@Injectable()
export class PiiCryptoService {
  private readonly logger = new Logger(PiiCryptoService.name);
  private readonly encryptionKey: Buffer;
  private readonly hmacKey: Buffer;

  constructor(configService: ConfigService<AppConfig>) {
    const encHex = configService.get<string>('pii.encryptionKey', {
      infer: true,
    });
    const hmacHex = configService.get<string>('pii.hmacKey', { infer: true });
    this.encryptionKey = this.keyFromHex(encHex, 'encryptionKey');
    this.hmacKey = this.keyFromHex(hmacHex, 'hmacKey');
    this.logger.log('PII 加密就绪: AES-256-GCM + HMAC-SHA256 索引');
  }

  private keyFromHex(hex: string | undefined, name: string): Buffer {
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(`PII ${name} 必须为 32 字节 hex（64 字符），当前非法`);
    }
    return Buffer.from(hex, 'hex');
  }

  /** AES-256-GCM 加密，输出 enc:v1:<iv>:<ciphertext>:<authTag>（均 base64） */
  encrypt(plaintext: string): string {
    return encryptPii(plaintext, this.encryptionKey);
  }

  /** 解密 enc:v1 格式密文；格式非法或 authTag 校验失败抛错 */
  decrypt(stored: string): string {
    return decryptPii(stored, this.encryptionKey);
  }

  /** HMAC-SHA256 归一化索引（hex）——查询等值匹配用 */
  hmacIndexValue(normalizedValue: string): string {
    return hmacIndex(normalizedValue, this.hmacKey);
  }

  /** 手机号 → 索引值（归一化 + HMAC） */
  phoneHmacIndex(phone: string): string {
    return hmacIndex(normalizePhone(phone), this.hmacKey);
  }

  /** 邮箱 → 索引值（归一化 + HMAC） */
  emailHmacIndex(email: string): string {
    return hmacIndex(normalizeEmail(email), this.hmacKey);
  }

  /**
   * 写入派生字段：data 含 phone/email 键时补齐加密列与索引列（双写阶段明文列照常保留）。
   * 值为 null 时同步清空派生列（解绑场景）。
   */
  derivePiiFields(data: {
    phone?: string | null;
    email?: string | null;
  }): Partial<
    Record<'phoneEnc' | 'phoneHmac' | 'emailEnc' | 'emailHmac', string | null>
  > {
    const derived: Partial<
      Record<'phoneEnc' | 'phoneHmac' | 'emailEnc' | 'emailHmac', string | null>
    > = {};
    if (data.phone !== undefined) {
      derived.phoneEnc = data.phone ? this.encrypt(data.phone) : null;
      derived.phoneHmac = data.phone ? this.phoneHmacIndex(data.phone) : null;
    }
    if (data.email !== undefined) {
      derived.emailEnc = data.email ? this.encrypt(data.email) : null;
      derived.emailHmac = data.email ? this.emailHmacIndex(data.email) : null;
    }
    return derived;
  }
}
