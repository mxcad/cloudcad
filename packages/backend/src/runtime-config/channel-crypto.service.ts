///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { AppConfig } from '../config/app.config';

/**
 * 通道秘密密文存储格式（与 PII 的 enc:v1 同构、独立前缀）：
 * chan:v1:<iv base64>:<ciphertext base64>:<authTag base64>
 * 前缀含版本位，为密钥轮换预留（轮换时新密文用新版本前缀，旧版按 v1 解密）。
 *
 * 通道密钥与 PII 密钥刻意独立：通道秘密（SMTP 口令等）是运维凭据，与用户 PII
 * 的爆炸半径、轮换周期不同，共用密钥会让一侧泄露连带解密另一侧。
 */
const CIPHER_PREFIX = 'chan:v1:';
const IV_LENGTH = 12;

/**
 * 密钥解析：env 显式设置时必须解码为恰好 32 字节（64 位 hex 或 base64），
 * 否则启动即抛错（与 PII 密钥同一长度校验口径）；未设置时 SHA-256 归一化回退
 * （开发环境可用，生产部署应显式设置独立密钥，见 .env.example 注释）。
 */
export function resolveChannelKey(
  raw: string | undefined,
  fallback: string
): Buffer {
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
      `通道加密密钥必须为 32 字节（64 位 hex 或 base64 编码），实际解码为 ${decoded.length} 字节`
    );
  }
  return crypto.createHash('sha256').update(fallback).digest();
}

/**
 * 通道秘密掩码：保留首尾各 2 字符（规格主形态）；较短值只保留首尾各 1 字符，
 * 避免短口令被掩码暴露大半；空值返回空串（前端以非空判定「已配置」）。
 */
export function maskChannelSecret(value: string): string {
  if (!value) {
    return '';
  }
  if (value.length <= 2) {
    return '****';
  }
  if (value.length < 6) {
    return `${value[0]}****${value[value.length - 1]}`;
  }
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

/**
 * 通道秘密加密服务（ADR-0082 #493）
 *
 * - 运行时配置里 `input.secret` 标记的键（SMTP 口令等）以 AES-256-GCM 密文落库
 *   （chan:v1 格式），历史日志同存密文；
 * - 内部消费方经 RuntimeConfigService.getValue 取回明文；
 * - 管理端 API 响应只回掩码（首尾 2 字符），公开配置端点永不包含 secret 键。
 */
@Injectable()
export class ChannelCryptoService {
  private readonly encryptionKey: Buffer;

  constructor(configService: ConfigService<AppConfig>) {
    const hex = configService.get<string>('channel.encryptionKey', {
      infer: true,
    });
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(
        '通道加密密钥必须为 32 字节 hex（64 字符），当前非法'
      );
    }
    this.encryptionKey = Buffer.from(hex, 'hex');
  }

  /** AES-256-GCM 加密，输出 chan:v1:<iv>:<ciphertext>:<authTag>（均 base64） */
  encrypt(plaintext: string): string {
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

  /** 解密 chan:v1 格式密文；格式非法或 authTag 校验失败抛错 */
  decrypt(stored: string): string {
    if (!stored.startsWith(CIPHER_PREFIX)) {
      throw new Error(`通道密文格式非法: ${stored.slice(0, 16)}...`);
    }
    const parts = stored.slice(CIPHER_PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new Error(`通道密文格式非法: ${stored.slice(0, 16)}...`);
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

  /** 判断值是否为通道秘密密文（区分「DB 落库密文」与「env 层明文」） */
  isCiphertext(value: string): boolean {
    return value.startsWith(CIPHER_PREFIX);
  }
}
