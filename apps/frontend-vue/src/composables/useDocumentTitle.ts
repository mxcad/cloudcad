import { watch, onUnmounted, getCurrentInstance } from 'vue';

/**
 * 页面标题 Composable
 *
 * 来源：apps/frontend/src/hooks/useDocumentTitle.ts
 * 照搬全部逻辑：设置 document.title，组件卸载时恢复
 */

function getAppName(): string {
  // 优先从品牌配置获取，否则使用默认值
  try {
    const brand = localStorage.getItem('brand_title');
    return brand || 'CloudCAD';
  } catch {
    return 'CloudCAD';
  }
}

export function useDocumentTitle(title: string, skip = false): void {
  let previousTitle = document.title;

  if (!skip) {
    const appName = getAppName();
    if (title) {
      document.title = `${title} - ${appName}`;
    } else {
      document.title = appName;
    }
  }

  // 组件卸载时恢复
  if (getCurrentInstance()) {
    onUnmounted(() => {
      document.title = previousTitle;
    });
  }
}
