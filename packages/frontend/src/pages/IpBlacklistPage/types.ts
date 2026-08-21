///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * IP 黑名单条目（对应后端 IpBlacklistEntryResponseDto）
 *
 * 注意：SDK 生成的 expiresAt 类型为 object | null（Swagger 对 Date 的序列化缺陷），
 * 实际 JSON 序列化为 ISO 8601 字符串，此处显式声明为 string | null。
 */
export interface IpBlacklistEntry {
  id: string;
  ip: string;
  source: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}

/** 添加黑名单条目的表单数据 */
export interface IpBlacklistEntryForm {
  ip: string;
  reason: string;
  expiresAt?: string;
}
