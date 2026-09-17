/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';
import type { IpWhitelistPreset } from './types';

/** 管理员 IP 白名单每页条数（与后端 ListIpWhitelistQueryDto 默认一致） */
export const IP_WHITELIST_PAGE_SIZE = 20;

/** 条目来源展示映射（manual=界面添加，auto=首次启动系统默认，file=服务器本地文件兜底） */
export const IP_WHITELIST_SOURCE_META: Record<
  string,
  { label: string }
> = {
  manual: { label: t('手动添加') },
  auto: { label: t('系统默认') },
  file: { label: t('本地文件') },
};

/**
 * 快速添加预设组：一键放行整段网络，免去逐个填写 CIDR。
 *
 * IPv4 与 IPv6 必须成对给出——后端 cidrContains 要求版本一致，
 * 单给 0.0.0.0/0 会漏掉纯 IPv6 客户端。
 */
export const IP_WHITELIST_PRESETS: IpWhitelistPreset[] = [
  {
    key: 'lan',
    label: t('局域网'),
    description: t('放行内网网段（10/8、172.16/12、192.168/16 与 IPv6 私网）'),
    reason: t('快速添加：局域网网段'),
    ips: [
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      'fc00::/7',
      'fe80::/10',
    ],
  },
  {
    key: 'all',
    label: t('全网'),
    description: t('放行全部 IPv4 与 IPv6 地址'),
    reason: t('快速添加：全局可访问'),
    ips: ['0.0.0.0/0', '::/0'],
  },
];

/** 本地文件条目 ID 前缀（与后端 FILE_ENTRY_ID_PREFIX 保持一致） */
export const FILE_ENTRY_ID_PREFIX = 'file:';
