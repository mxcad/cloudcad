import * as fs from 'fs';

/**
 * 检测目标产物文件是否被「占用/不可写」——引擎写它会失败。
 *
 * mxcadassembly 写产物按「srcpath 文件完整名 + .mxweb」命名，且无法覆盖被占用/被锁的
 * 目标文件：引擎以可写方式打开失败时报 `write file error`（code 2，退出码恒 2123），
 * 失败后旧产物保持原样（不被覆盖、mtime 不变）。实例 2026-11-03：移动端无缓存打开
 * 「01海绵城市专篇设计说明_t3.dwg」，旧产物 4b298d….dwg.mxweb 被某进程句柄占用，
 * 引擎写不进去 → 裸 write file error（被误判为 content-error 永久失败）。
 *
 * 本函数用「以读写模式打开后立即关闭」模拟引擎的写前置检查：
 * - 文件不存在 → 可创建，返回 false（不视为锁定）；
 * - 打开成功 → 未占用，返回 false；
 * - EPERM / EBUSY / EACCES → 被占用或不可写，返回 true（引擎写必失败）；
 * - ENOENT（检测与写之间被删的竞态）→ 可创建，返回 false。
 *
 * 打开成功立即 close，本函数自身不持有句柄。
 * backend（file-conversion.service）与 conversion-service（MxcadRunner）共用，
 * 让「产物被占用」在调引擎前就被拦截并归为可重试的 file-locked 分类。
 */
export function isArtifactLocked(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
  } catch {
    // 不存在：引擎可新建，非锁定
    return false;
  }
  let fd: number | undefined;
  try {
    // 'r+' 以读写打开（不截断、不写数据），与引擎「以可写方式打开」的前置条件一致；
    // 若目标被「不共享写」的句柄占用，Windows 下返回 EPERM/EBUSY，Linux 下 EACCES。
    fd = fs.openSync(filePath, 'r+');
    return false;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return false; // 竞态：检测与写之间被删，可新建
    return true; // EPERM / EBUSY / EACCES 等 → 被占用或不可写
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // 关闭失败无关紧要（句柄即将随进程退出释放）
      }
    }
  }
}
