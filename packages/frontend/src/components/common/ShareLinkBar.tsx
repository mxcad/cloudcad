import React, { useCallback, useRef } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useCopy, type UseCopyOptions } from '@/hooks/useCopy';
import { t } from '@/languages';

export interface ShareLinkBarProps {
  /** 完整可复制链接（已含 origin） */
  url: string;
  /** 只读输入框的无障碍名称（如「协同链接」） */
  label: string;
  /** 列表/批量行内不显示提示文案，默认显示 */
  showHint?: boolean;
  /** 复制反馈配置（toast 文案等）；「手动复制」降级由本组件内置 */
  copyOptions?: Omit<UseCopyOptions, 'onUnrecoverable'>;
}

/**
 * 分享链接条：二维码下方的链接展示 + 复制入口，分享图纸与分享协同共用。
 *
 * 链接以只读输入框呈现，DOM 中保留完整链接以便手动选中复制；按钮复制在
 * 内网 http（clipboard 不可用）/ iframe 受限 / webview 下三条路径全失败时，
 * 自动聚焦并全选输入框，把最终降级交给用户。
 */
export const ShareLinkBar: React.FC<ShareLinkBarProps> = ({
  url,
  label,
  showHint = true,
  copyOptions,
}) => {
  const urlInputRef = useRef<HTMLInputElement>(null);

  const focusForManualCopy = useCallback(() => {
    requestAnimationFrame(() => {
      const input = urlInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
  }, []);

  const { copied, copy } = useCopy({
    ...copyOptions,
    onUnrecoverable: focusForManualCopy,
  });

  const handleCopy = useCallback(() => {
    void copy(url);
  }, [copy, url]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
        }}
      >
        <Input
          ref={urlInputRef}
          readOnly
          size="sm"
          leftIcon={Link2}
          value={url}
          onFocus={(e) => e.target.select()}
          aria-label={label}
        />
        <Button
          variant="secondary"
          size="xs"
          icon={copied ? Check : Copy}
          onClick={handleCopy}
        >
          {copied ? t('已复制') : t('复制')}
        </Button>
      </div>
      {showHint && (
        <div
          style={{
            width: '100%',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            textAlign: 'center',
          }}
        >
          {t('若按钮复制不可用，可手动选中上方链接复制')}
        </div>
      )}
    </>
  );
};

export default ShareLinkBar;
