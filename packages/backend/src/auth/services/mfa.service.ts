import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { generateTotpSecret, verifyTotp } from './totp';
import type { AppConfig } from '../../config/app.config';
import { DatabaseService } from '../../database/database.service';

/**
 * TOTP secret 密文存储格式：enc:v1:<iv base64>:<ciphertext base64>:<authTag base64>
 * 前缀含冒号，解析时先剥离前缀再按冒号切分剩余 3 段（base64 不含冒号，可安全切分）。
 */
const CIPHER_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;

/**
 * TOTP 双因素鉴别服务（仅管理员入口，#415 等保 8.1.4.1(d)）
 *
 * - secret 以 AES-256-GCM 密文存库（密钥取自 TOTP_ENCRYPTION_KEY，缺省回退 JWT_SECRET，
 *   经 SHA-256 归一化为 32 字节），不落明文；
 * - TOTP 算法见 ./totp（Node crypto 自实现，RFC 6238，SHA1/6位/30s，±1 时间窗）；
 * - setup 幂等：已存 secret 未启用时复用（二维码稳定，无需重复扫码）；
 * - bind = 首码验证 + 置启用标志，成功后由调用方写 MFA_BIND 审计。
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly encryptionKey: Buffer;
  private readonly issuer: string;

  constructor(
    private readonly prisma: DatabaseService,
    configService: ConfigService<AppConfig>
  ) {
    const rawKey =
      configService.get<string>('totp.encryptionKey', { infer: true }) ?? '';
    this.encryptionKey = crypto.createHash('sha256').update(rawKey).digest();
    this.issuer =
      configService.get<string>('product.name', { infer: true }) ?? 'CloudCAD';
  }

  /** 查询 TOTP 启用状态 */
  async isTotpEnabled(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabled: true },
    });
    return user?.totpEnabled ?? false;
  }

  /**
   * 绑定准备：生成（或复用未启用的既有）secret 并密文存库，返回明文 secret
   * 与 otpauth 链接（前端据此渲染二维码，扫码后由验证器 App 本地生成动态码）。
   */
  async setup(
    userId: string
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, totpSecret: true, totpEnabled: true },
    });
    if (!user) {
      throw new Error(`TOTP setup 失败：用户不存在 ${userId}`);
    }
    if (user.totpEnabled) {
      throw new Error('TOTP 已启用，无需重复绑定');
    }

    // 幂等复用：已存 secret 未启用时解密复用，避免每次进入绑定页换码
    let secret: string;
    if (user.totpSecret) {
      secret = await this.decrypt(user.totpSecret);
    } else {
      secret = generateTotpSecret();
      await this.prisma.user.update({
        where: { id: userId },
        data: { totpSecret: await this.encrypt(secret) },
      });
    }

    const otpauthUrl = this.buildOtpauthUrl(user.username, secret);

    this.logger.log(`TOTP 绑定准备完成: user=${userId}`);
    return { secret, otpauthUrl };
  }

  /** 构建 otpauth:// 链接（RFC 6238 标准参数，主流验证器 App 均可解析） */
  private buildOtpauthUrl(username: string, secret: string): string {
    const params = new URLSearchParams({
      secret,
      issuer: this.issuer,
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
    const label = `${this.issuer}:${username}`;
    return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
  }

  /**
   * 验证动态码（±1 时间窗）。无 secret 或格式非法均返回 false（不抛错，
   * 由调用方决定错误码与限流）。
   */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const normalized = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      return false;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true },
    });
    if (!user?.totpSecret) {
      return false;
    }
    let secret: string;
    try {
      secret = await this.decrypt(user.totpSecret);
    } catch (error) {
      this.logger.error(
        `TOTP secret 解密失败（密钥可能已轮换）: user=${userId} - ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
    try {
      return verifyTotp(secret, normalized);
    } catch {
      return false;
    }
  }

  /**
   * 首码验证并激活：验证通过则置 totpEnabled=true（绑定完成，后续登录必须带码）。
   * 返回 false 表示码错误（调用方走限流 + 失败审计）。
   */
  async bind(userId: string, code: string): Promise<boolean> {
    if (!(await this.verifyCode(userId, code))) {
      return false;
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
    this.logger.log(`TOTP 绑定激活: user=${userId}`);
    return true;
  }

  /** AES-256-GCM 加密，输出 enc:v1:<iv>:<ciphertext>:<authTag>（均 base64） */
  private async encrypt(plaintext: string): Promise<string> {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
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
  private async decrypt(stored: string): Promise<string> {
    if (!stored.startsWith(CIPHER_PREFIX)) {
      throw new Error(`TOTP 密文格式非法: ${stored.slice(0, 16)}...`);
    }
    const parts = stored.slice(CIPHER_PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new Error(`TOTP 密文格式非法: ${stored.slice(0, 16)}...`);
    }
    const [ivB64, ciphertextB64, tagB64] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
