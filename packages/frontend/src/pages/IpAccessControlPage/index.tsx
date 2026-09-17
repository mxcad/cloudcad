/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { useSearchParams } from 'react-router-dom';
import { TabButton, Tabs } from '@/components/ui';
import { SystemPermission } from '@/constants/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePermission } from '@/hooks/usePermission';
import { t } from '@/languages';
import IpBlacklistPage from '../IpBlacklistPage';
import IpWhitelistPage from '../IpWhitelistPage';
import SecurityAccessAttemptPage from '../SecurityAccessAttemptPage';
import { IP_ACCESS_TABS, type IpAccessTab } from './types';

const TAB_LABELS: Record<IpAccessTab, string> = {
  blacklist: t('IP 黑名单'),
  whitelist: t('管理员 IP 白名单'),
  attempts: t('高危访问尝试'),
};

/** 各 Tab 所需权限位（高危尝试沿用白名单权限位，与后端 controller 一致） */
const TAB_PERMISSIONS: Record<IpAccessTab, SystemPermission> = {
  blacklist: SystemPermission.SYSTEM_IP_BLACKLIST_MANAGE,
  whitelist: SystemPermission.SYSTEM_IP_WHITELIST_MANAGE,
  attempts: SystemPermission.SYSTEM_IP_WHITELIST_MANAGE,
};

/** 默认落点：管理员登录后原 /admin/ip-whitelist 的等价入口 */
const DEFAULT_TAB: IpAccessTab = 'whitelist';

/**
 * IP 访问控制——原「IP 黑名单」「管理员 IP 白名单」「高危访问尝试」三个独立菜单与页面
 * 合并为单一入口，页内以 Tab 区分，三个子页面通过 `embedded` 复用。
 *
 * Tab 状态走 URL 查询参数（`?tab=`），便于管理员登录后的落地跳转与外链直达；
 * 参数非法或无对应权限时回退到默认 Tab（白名单，与原登录落点一致），
 * 默认 Tab 本身也无权限时再取第一个可见 Tab。
 * 跨 Tab 的联动（高危尝试一键加白/拉黑会写入白/黑名单）由各 hook 按 queryKey
 * 失效对应列表完成，切回 Tab 即重新拉取，无需在此额外同步。
 */
export default function IpAccessControlPage() {
  useDocumentTitle(t('IP 访问控制'));
  const { hasPermission } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();

  const visibleTabs = IP_ACCESS_TABS.filter((tab) =>
    hasPermission(TAB_PERMISSIONS[tab])
  );
  const firstVisible: IpAccessTab | undefined = visibleTabs[0];
  const defaultTab: IpAccessTab = visibleTabs.includes(DEFAULT_TAB)
    ? DEFAULT_TAB
    : (firstVisible ?? DEFAULT_TAB);

  const rawTab = searchParams.get('tab');
  const activeTab: IpAccessTab =
    visibleTabs.find((tab) => tab === rawTab) ?? defaultTab;

  const changeTab = (tab: IpAccessTab) => setSearchParams({ tab });

  return (
    <div className="h-full flex flex-col overflow-hidden p-6 text-text-secondary">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0 mb-4">
          <h1 className="text-2xl font-bold text-text-primary">
            {t('IP 访问控制')}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {t('管理员登录白名单、IP 黑名单与高危访问尝试记录')}
          </p>
        </div>

        <div className="flex-shrink-0 mb-4">
          <Tabs>
            {visibleTabs.map((tab) => (
              <TabButton
                key={tab}
                active={activeTab === tab}
                onClick={() => changeTab(tab)}
              >
                {TAB_LABELS[tab]}
              </TabButton>
            ))}
          </Tabs>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {activeTab === 'blacklist' && <IpBlacklistPage embedded />}
          {activeTab === 'whitelist' && <IpWhitelistPage embedded />}
          {activeTab === 'attempts' && <SecurityAccessAttemptPage embedded />}
        </div>
      </div>
    </div>
  );
}
