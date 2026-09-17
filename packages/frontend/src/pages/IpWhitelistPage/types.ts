/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

/**
 * 管理员 IP 白名单条目（对应后端 IpWhitelistEntryResponseDto）
 *
 * 注意：
 * - expiresAt 实际 JSON 序列化为 ISO 8601 字符串，此处显式声明为 string | null；
 * - source 为 'manual'（界面添加）、'auto'（首次启动系统默认）或 'file'（服务器本地文件兜底条目）；
 * - 本地文件条目的 id 形如 "file:<ip>"，不可经接口移除（需直接编辑服务器文件）。
 */
export interface IpWhitelistEntry {
  id: string;
  ip: string;
  source: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}

/** 添加白名单条目的表单数据 */
export interface IpWhitelistEntryForm {
  ip: string;
  reason: string;
  expiresAt?: string;
}

/**
 * 快速添加预设组：一次放行整段网络。
 *
 * `label` / `description` 为已翻译的展示文案（由 constants.ts 经 t() 提供），
 * `reason` 是写入后端的加白原因。
 */
export interface IpWhitelistPreset {
  key: string;
  label: string;
  description: string;
  reason: string;
  ips: string[];
}
