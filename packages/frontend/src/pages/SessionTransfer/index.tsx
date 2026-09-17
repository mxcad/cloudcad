///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright notice.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 桌面端 EXE → 系统浏览器 会话转移的透明交接路由（无表单、无交互，仅 loading 一闪而过）。
 *
 * 流程：
 *  ① 进入路由先清旧凭证（localStorage 五键）+ 取消旧主动刷新定时器——
 *     「清旧」与「写新」是两步独立有序操作，避免先写新再清旧误删刚写入的新值；
 *  ② 调 /auth/session-transfer/consume 消费一次性凭证（后端销毁旧会话并签发新会话，
 *     同时下发新 httpOnly cookie）；
 *  ③ 写入新凭证（localStorage 三键）；
 *  ④ 整页刷新（location.replace），AuthContext 从干净 localStorage 重建，避免 setState 竞态。
 *
 * 失败（凭证过期/无效）→ 极简错误页 + 「前往登录」按钮。
 */

import { getCopyrightLine } from '@/constants/appConfig';
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sessionTransferControllerConsume } from '@/api-sdk';
import { setAccessToken, setRefreshToken } from '@/utils/tokenUtils';
import { cancelProactiveRefresh } from '@/config/tokenRefresh';
import { useBrandConfig } from '../../contexts/BrandContext';
import { Button } from '@/components/ui/Button';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { AlertCircle, Loader2 } from 'lucide-react';
import styles from '../DeviceAuthorize.module.css';

const DEFAULT_REDIRECT = '/profile';

export const SessionTransfer: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { config: brandConfig } = useBrandConfig();
  const appName = brandConfig?.title || 'CloudCAD';
  const appLogo = brandConfig?.logo || '/logo.png';

  // redirect 参数消毒：new URL 解析后只取同源 pathname+search+hash（防开放重定向，
  // 与 DeviceAuthorize 一致）；缺省 /profile。
  const rawRedirect = searchParams.get('redirect') || '';
  let redirectTarget = DEFAULT_REDIRECT;
  if (rawRedirect) {
    try {
      const url = new URL(rawRedirect, window.location.origin);
      redirectTarget =
        url.pathname + url.search + url.hash || DEFAULT_REDIRECT;
    } catch {
      redirectTarget = DEFAULT_REDIRECT;
    }
  }

  const [state, setState] = useState<'loading' | 'error'>(
    token ? 'loading' : 'error'
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? '' : t('缺少转移凭证')
  );
  // 防重入：交接流程只执行一次（StrictMode 双调用 / 依赖抖动不得重复清凭证）
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) {
      return;
    }
    attempted.current = true;

    // ① 清旧凭证（五键）+ 取消旧主动刷新定时器
    cancelProactiveRefresh();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('personalSpaceId');
    localStorage.removeItem('mxcad-personal-space-id');

    (async () => {
      try {
        // ② 消费凭证，后端销毁旧会话并签发新会话（同时下发新 httpOnly cookie）
        const result = await sessionTransferControllerConsume({
          body: { token },
        });
        // SDK 默认不抛错：失败时错误在 result.error，必须抛出才能进入错误分支
        if (result.error) throw result.error;
        const data = result.data!;
        // ③ 写入新凭证（localStorage 三键）
        setAccessToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        // ④ 整页刷新，AuthContext 从干净 localStorage 重建
        window.location.replace(redirectTarget);
      } catch (err: unknown) {
        setErrorMessage(getErrorMessage(err) || t('会话转移失败，请重试'));
        setState('error');
      }
    })();
  }, [token, redirectTarget]);

  const renderLogo = () => (
    <div className={styles.logoSection}>
      <div className={styles.logoWrapper}>
        <div className={styles.logoGlow} />
        <img src={appLogo} alt={appName} className={styles.logoImage} />
      </div>
      <h1 className={styles.appTitle}>{appName}</h1>
    </div>
  );

  const renderLoading = () => (
    <div className={styles.authCard}>
      {renderLogo()}
      <div className={styles.deviceContent}>
        <div className={styles.deviceIconWrap}>
          <Loader2 size={32} className={styles.spinIcon} />
        </div>
        <h2 className={styles.deviceTitle}>{t('正在切换账号...')}</h2>
        <p className={styles.deviceSubtitle}>{t('正在为您切换登录状态')}</p>
      </div>
    </div>
  );

  const renderError = () => (
    <div className={styles.authCard}>
      {renderLogo()}
      <div className={styles.supportContent}>
        <div className={`${styles.supportIcon} ${styles.errorIconBg}`}>
          <AlertCircle size={28} />
        </div>
        <h2 className={styles.supportTitle}>{t('会话转移失败')}</h2>
        <p className={styles.supportSubtitle}>{errorMessage}</p>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => {
            window.location.href = '/login';
          }}
        >
          {t('前往登录')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={styles.authPage}>
      <div className={styles.authContainer}>
        {state === 'loading' ? renderLoading() : renderError()}
        <p className={styles.copyright}>
          {getCopyrightLine(appName)}
        </p>
      </div>
    </div>
  );
};

export default SessionTransfer;
