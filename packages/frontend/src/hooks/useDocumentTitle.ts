import { useEffect, useRef } from 'react';
import { APP_NAME } from '../constants/appConfig';

/**
 * 设置页面标题的 Hook
 * @param title 页面标题（不包含应用名称）
 * @param skip 是否跳过设置标题（用于 CAD 编辑器等特殊页面）
 *
 * @example
 * // 设置标题为 "登录 - 梦想网页CAD实时协同平台"
 * useDocumentTitle('登录');
 *
 * // 跳过标题设置（CAD 编辑器页面）
 * useDocumentTitle('', true);
 */
export function useDocumentTitle(title: string, skip = false): void {
  const previousTitle = useRef<string>(document.title);

  useEffect(() => {
    if (skip) {
      return;
    }

    // 保存当前标题
    previousTitle.current = document.title;

    // 设置新标题
    if (title) {
      document.title = `${title} - ${APP_NAME}`;
    } else {
      document.title = APP_NAME;
    }

    // 清理函数：恢复原标题
    return () => {
      document.title = previousTitle.current;
    };
  }, [title, skip]);
}

/**
 * 仅设置应用名称作为标题（无页面特定标题）
 */
export function useAppNameTitle(): void {
  useDocumentTitle('');
}
