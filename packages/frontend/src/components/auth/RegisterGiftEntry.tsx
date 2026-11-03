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

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';
import { t } from '@/languages';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

/**
 * RegisterGiftEntry — 注册送会员营销入口（「引导去登录区域」统一出口）。
 *
 * 侧边栏登录闸门卡片（LoginPromptCard）与「需要登录」弹窗（LoginPrompt）
 * 共用。读运行时配置：活动开启（registerGiftEnabled && months>0）时显示，
 * 点击跳 PC 注册页；关闭时返回 null。营销文案复用登录/注册页同款 i18n key。
 */
export const RegisterGiftEntry: React.FC<{ className?: string }> = ({
  className,
}) => {
  const navigate = useNavigate();
  const { config } = useRuntimeConfig();

  if (!config.registerGiftEnabled || config.registerGiftMonths <= 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/register')}
      data-testid="register-gift-entry"
      className={`flex items-center justify-center gap-1.5 w-full py-1.5 text-sm font-medium cursor-pointer hover:underline ${
        className ?? ''
      }`}
      style={{ color: 'var(--accent-700)' }}
    >
      <Gift size={15} className="shrink-0" />
      <span>
        {t('注册即送 VIP1 免费试用 {months} 个月', {
          months: String(config.registerGiftMonths),
        })}
      </span>
      <ChevronRight size={15} className="shrink-0" />
    </button>
  );
};

export default RegisterGiftEntry;
