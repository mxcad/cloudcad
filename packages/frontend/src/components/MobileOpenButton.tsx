/**
 * 「用手机端打开」入口：把当前 PC 页面翻译成移动端 URL 并在新标签打开。
 *
 * 与 performMobileRedirectIfNeeded（自动跳转）共用 buildMobileRedirectUrl 唯一出口，
 * 不另写一份翻译逻辑。不可映射（桌面管理端等）或配置开关关闭时不渲染——
 * 那条路径上不存在「手机版本」，显示按钮只会给出空白页。
 *
 * 注意：刻意不传 markRedirect。`_redirect=1` 是「桌面端自动跳转」标记，
 * 移动端据此**关闭自身标签页**（见 mobile useUser.ts）；这里是新标签手动打开，
 * 带上该标记会让刚打开的页面自己关掉。
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { Tooltip } from './ui/Tooltip';
import { Button } from './ui/Button';
import { t } from '@/languages';
import {
  buildMobileRedirectUrl,
  getMobileRedirectConfig,
} from '../utils/mobileRedirect';

export function MobileOpenButton() {
  const location = useLocation();
  const [mobileUrl, setMobileUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMobileRedirectConfig().then((config) => {
      if (cancelled) return;
      setMobileUrl(
        buildMobileRedirectUrl({
          config,
          pathname: location.pathname,
          search: location.search,
          credentials: {
            accessToken: localStorage.getItem('accessToken'),
            refreshToken: localStorage.getItem('refreshToken'),
            user: localStorage.getItem('user'),
          },
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

  if (!mobileUrl) return null;

  return (
    <div className="p-0.5">
      <Tooltip content={t('用手机端打开')}>
        <Button
          variant="secondary"
          className="relative rounded-xl transition-all duration-300 ease-out
                     hover:scale-110 active:scale-95
                     hover:bg-[var(--bg-tertiary)] group"
          aria-label={t('用手机端打开')}
          onClick={() => window.open(mobileUrl, '_blank', 'noopener')}
        >
          <Smartphone
            size={20}
            className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-500)]"
          />
        </Button>
      </Tooltip>
    </div>
  );
}
