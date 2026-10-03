/**
 * 历史版本预热（H3，对齐 PC useVersionHistory.handleOpenHistoricalVersion）。
 *
 * 历史版本首次访问需「MX 版本库分片下载 + bin→mxweb 转换」，冷路径可能耗时数十秒，
 * 直接打开编辑器会被其 60s 打开超时拖爆（PC 注释：偶尔打不开的根因）。
 * 后端转换是异步的：warmup=1 时首次请求只「发起」转换并返回 202（PROCESSING），
 * 完成后返回 204（不返回内容）；轮询直到非 202 再打开编辑器。
 *
 * 常量与 PC 一致：间隔 2s、总超时 360s。
 */
import { mxcadFileAccessControllerGetFilesDataFile } from '../api-sdk';
import { t } from '../languages';

const WARMUP_POLL_INTERVAL_MS = 2000;
const WARMUP_POLL_TIMEOUT_MS = 360_000;

/**
 * 轮询预热历史版本文件直至缓存就绪。
 *
 * @param path 文件存储路径（filesData/{path}，取自节点 path 字段）
 * @param revision 版本号（?v= 参数）
 * @param isCancelled 可选取消判据（调用方 UI 关闭时返回 true 即静默退出）
 * @throws 超时/后端错误（message 为已本地化的可展示文案）
 */
export async function warmupHistoricalVersion(
  path: string,
  revision: number,
  isCancelled?: () => boolean
): Promise<void> {
  const startedAt = Date.now();
  while (!isCancelled?.()) {
    if (Date.now() - startedAt > WARMUP_POLL_TIMEOUT_MS) {
      throw new Error(t('历史版本文件准备超时，请稍后重试'));
    }

    const result = await mxcadFileAccessControllerGetFilesDataFile({
      path: { path },
      query: { v: String(revision), warmup: '1' },
      parseAs: 'arrayBuffer',
    });

    if (result.error) {
      // 后端错误体无 status 字段（只有 code），按 code 映射文案（PC 同逻辑）
      const code = (result.error as { code?: string }).code;
      throw new Error(
        code === 'UNAUTHORIZED'
          ? t('请登录后访问此文件')
          : code === 'NOT_FOUND'
            ? t('文件不存在或已被删除')
            : (result.error as Error).message ||
              t('历史版本文件准备失败，请重试')
      );
    }

    // 204（缓存已生成）或其他 2xx（已完成并直接返回内容）：转换彻底完成
    if (result.response?.status !== 202) return;

    await new Promise((resolve) => setTimeout(resolve, WARMUP_POLL_INTERVAL_MS));
  }
}
