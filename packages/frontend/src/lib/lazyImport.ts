/**
 * 懒加载 chunk 超时保护的唯一出口。
 *
 * React.lazy 没有超时：CAD 编辑器的懒加载链有 23 个 chunk（vendor-cad 8.3MB），
 * 任一 chunk 请求悬挂（TCP stall）时 Suspense fallback 会永远显示加载中。
 * 本包装给每次尝试限定时间，超时或失败后有限重试，全部失败则 reject，
 * 交由错误边界给出「刷新页面」出口。
 *
 * 注意：浏览器模块加载器对同一 URL 的请求去重，悬挂请求在同一页面内重新
 * import 无效——重试只对硬失败（404 / 网络错误）有意义；悬挂请求只能靠
 * 刷新页面恢复。
 */
export function importWithTimeout<T>(
  loader: () => Promise<T>,
  timeoutMs: number,
  maxAttempts = 1
): Promise<T> {
  const total = Math.max(1, maxAttempts);
  return new Promise((resolve, reject) => {
    let settled = false;

    const attempt = (left: number) => {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, rejectTimeout) => {
        timer = setTimeout(
          () =>
            rejectTimeout(
              new Error(`dynamic import timed out after ${timeoutMs}ms`)
            ),
          timeoutMs
        );
      });

      Promise.race([loader(), timeout]).then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          clearTimeout(timer);
          if (left > 1) {
            attempt(left - 1);
          } else {
            settled = true;
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
    };

    attempt(total);
  });
}
