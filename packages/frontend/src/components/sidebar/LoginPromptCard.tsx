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
import { Button } from '../ui/Button';
import { t } from '@/languages';
import styles from './sidebar.module.css';

interface LoginPromptCardProps {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  /** 提供时在卡片底部渲染「立即登录」按钮（游客闸门入口） */
  onLogin?: () => void;
}

/**
 * LoginPromptCard — 侧边栏内联「登录闸门卡片」的唯一视图（A8）。
 *
 * SidebarContainer 原有 4 份逐字内联的卡片（我的项目/个人空间/协同登录卡
 * + 协同不可用提示卡）收敛到此；登录按钮行为统一走 useLoginGate.handleLoginClick。
 */
export const LoginPromptCard: React.FC<LoginPromptCardProps> = ({
  icon,
  title,
  description,
  onLogin,
}) => {
  return (
    <div className={styles.loginPromptContainer}>
      <div className={styles.loginPromptContent}>
        <div className={styles.loginPromptIcon}>{icon}</div>
        <h3 className={styles.loginPromptTitle}>{title}</h3>
        <p className={styles.loginPromptDescription}>{description}</p>
        {onLogin && (
          <Button
            variant="primary"
            size="sm"
            onClick={onLogin}
            className={styles.loginPromptButton}
          >
            {t('立即登录')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default LoginPromptCard;
