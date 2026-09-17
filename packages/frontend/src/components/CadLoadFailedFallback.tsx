///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Button } from '@/components/ui';
import { t } from '@/languages';

/**
 * CAD 编辑器懒加载链失败后的回退 UI。
 *
 * lazy import 由 importWithTimeout 包装，超时/失败耗尽后 reject 落到
 * ErrorBoundary 显示本组件。全局 ErrorBoundary 的「重试」在这里无效：
 * lazy promise 被 reject 后 React 不会重新调用 factory，可靠恢复只有
 * 刷新页面。
 */
export function CadLoadFailedFallback() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-primary)' }}
    >
      <p style={{ color: 'var(--text-primary)' }}>
        {t('CAD 编辑器加载失败，请刷新页面重试')}
      </p>
      <Button
        variant="primary"
        size="sm"
        className="mt-4"
        onClick={() => window.location.reload()}
      >
        {t('刷新页面')}
      </Button>
    </div>
  );
}
