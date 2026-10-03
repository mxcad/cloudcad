/**
 * 单文件原格式直接下载（非 CAD 文件的打开/下载出口，对齐 PC handleDownload 直下分支）。
 *
 * 两页（个人空间/项目详情）共用：点击非 CAD 文件、单条目菜单「下载」都走这里，
 * 提示与错误透传口径一致（后端错误文案直接展示，不吞成通用「下载失败」）。
 */
import { showLoadingToast, closeToast, showSuccessToast, showFailToast } from 'vant';
import { t } from '@/languages';
import { downloadNodeOriginal } from '@/services/fileService';

export function useNodeDownload() {
  /**
   * 原格式下载单个文件。
   * @returns 成功 true；失败 false（已弹失败 toast）
   */
  async function downloadOriginal(nodeId: string, fileName: string): Promise<boolean> {
    showLoadingToast({ message: t('下载中...'), forbidClick: true });
    try {
      await downloadNodeOriginal(nodeId, fileName);
      closeToast();
      showSuccessToast(t('下载成功'));
      return true;
    } catch (e) {
      closeToast();
      const msg = e instanceof Error ? e.message : '';
      showFailToast(msg || t('下载失败'));
      return false;
    }
  }

  return { downloadOriginal };
}
