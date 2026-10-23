import { MxFun } from 'mxdraw';
import { FetchAttributes } from 'mxcad';
import { t } from '@/languages';
import { read } from '@/lib/browserStorage';
import { ensureFreshAuthCookie } from '@/config/clientSetup';
import { FILE_OPEN_RETRY_CONFIG } from './mxcadTypes';
import type { OpenFilePayload, CurrentFileInfo } from './mxcadTypes';
import { getCurrentFileUrl, setCurrentFileUrl } from '../drawingSession';
import { getFileInfo, restoreEditorTitle, refreshFileName } from './mxcadHelpers';
import type { MxCADInstanceManager } from './mxcadInstanceManager';
import { setCurrentShareToken } from './mxcadInstanceManager';
import { extractShareTokenFromUrl } from './mxcadHelpers';

/**
 * MxCAD 文件打开流程（从 MxCADInstanceManager 拆分）
 *
 * 负责 waitForViewReady / openFile / reloadCurrentFile 三个打开入口，
 * 依赖 MxCADInstanceManager 提供引擎实例状态（视图 / 初始化标志 / 待打开会话）。
 */
export class MxCADOpenFlow {
  constructor(private readonly manager: MxCADInstanceManager) {}

  /**
   * 等待 MxCADView 初始化就绪后再打开文件
   *
   * 公开上传回调 / openUploadedFile 等调用方可能在引擎尚未初始化完成时
   * 就调用 openFile（如首次加载 WASM 较慢时用户已点击「继续打开」），
   * 这里统一等待/触发初始化，避免直接抛出「MxCADView 实例未初始化」。
   */
  async waitForViewReady(payload: OpenFilePayload): Promise<void> {
    // 从未创建过视图：先初始化空模板（不带 URL），再走标准 openFile 流程。
    // 不直接携带 URL 初始化，是因为 MxCADViewConfig.openFile 无失败回调通道，
    // 只有 openFile 的 __openWebFile__ 命令能拿到 openWebFile retCall（失败信号）。
    if (!this.manager.getCurrentView() && !this.manager.getInitPromise()) {
      // pendingOpenInfo 由 openFile 在成功后路径设置，初始化失败不会残留
      await this.manager.initialize();
      return this.openFile(payload);
    }

    // 初始化进行中（或视图已创建但引擎尚未就绪）：委托唯一轮询实现
    // （超时语义：ensureEngineReady 默认 VIEW_INIT_TIMEOUT_MS，未就绪返回 false）
    const ready = await this.manager.ensureEngineReady();
    if (!ready) {
      throw new Error(t('MxCADView 实例未初始化'));
    }
    await this.openFile(payload);
  }

  /**
   * 打开/重载共用的引擎调用核心：取 MxDrawObject → 挂 openFileComplete 监听（仅结果码 0
   * 判成功，失败由同批 retCall 或 60s 超时兜底）→ 按 FILE_OPEN_RETRY_CONFIG 重试发送
   * __openWebFile__（mxdrawObject 未就绪时重试）。
   *
   * 本方法只负责「发命令 + 监听 + 超时」，不做 URL/shareToken/pending 等会话副作用——
   * 那些由调用方在 onSuccess/onFail 里收尾：openFile 回滚 URL/shareToken + 恢复标题 +
   * reject；reload 恢复标题 + resolve(false)。openFile / reloadCurrentFile 两个孪生入口
   * 共用此核心，避免 mxdraw 获取 / 超时 / 监听 / 重试逻辑双份漂移。
   */
  private sendOpenWebFile(opts: {
    url: string;
    fetchAttributes: number;
    onSuccess: () => void;
    onFail: (error: Error) => void;
  }): void {
    // 上报一次在途打开：后续无论走 onSuccess 还是 fail（含 60s 超时）都会 notifyOpenTerminated，
    // 保证 inFlight 严格配对归零。UI 门控据此判定「本次打开是否仍在进行」。
    this.manager.notifyOpenDispatched();
    // 先取 MxDrawObject（openFileComplete 结果码的唯一来源）：cleanup/fail 闭包引用它，
    // 必须在其声明前完成初始化——若获取表达式抛错且 mxdraw 声明在闭包之后，会触发 TDZ
    // ReferenceError，掩盖真实错误并跳过恢复逻辑
    const mxdraw = (() => {
      try {
        return this.manager.getCurrentView()?.mxcad?.getMxDrawObject?.() ?? null;
      } catch {
        return null;
      }
    })();
    const timeout = setTimeout(() => {
      fail(new Error(t('文件打开超时')));
    }, 60000);
    // MxDrawObject 层 openFileComplete 携带打开结果码（0=成功，非 0=失败），
    // McObject 层同名事件转发时丢失该参数，无法区分成败。若监听 McObject 层并
    // 无条件 resolve，失败打开会被当作成功，调用方继续记录当前文件状态
    // （emitFileOpened → patchSessionFlags / title）。故仅在结果码为 0 时 onSuccess，
    // 失败由同一次派发中稍后触发的 retCall（iRet!==0）走 onFail 统一收尾；
    // 403 等不触发 openFileComplete 的失败由上方 60s 超时兜底。
    const onOpen = (iResult: number) => {
      if (iResult !== 0) return;
      cleanup();
      this.manager.notifyOpenTerminated();
      opts.onSuccess();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      mxdraw?.removeEventFuction('openFileComplete', onOpen);
    };
    const fail = (error: Error) => {
      cleanup();
      this.manager.notifyOpenTerminated();
      opts.onFail(error);
    };
    if (!mxdraw) {
      fail(new Error(t('mxcad 对象不可用')));
      return;
    }
    try {
      mxdraw.addEvent('openFileComplete', onOpen);
    } catch (error) {
      fail(error as Error);
      return;
    }
    const doOpen = async () => {
      try {
        const token = read('accessToken');
        // 从 URL 提取 shareToken（共享图纸场景），添加到请求头供引擎内部请求使用
        // 后端 authorizeFilesDataAccess 支持 query + header 双路检测
        const shareToken = extractShareTokenFromUrl(opts.url);
        const baseHeaders: Record<string, string> = {};
        if (token) baseHeaders.Authorization = `Bearer ${token}`;
        if (shareToken) baseHeaders['x-share-token'] = shareToken;
        const hasHeaders = Object.keys(baseHeaders).length > 0;
        for (
          let attempt = 0;
          attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES;
          attempt++
        ) {
          try {
            // openWebFile 的 retCall（第 2 参）：iRet !== 0 即打开失败
            // （403 等失败不会触发 openFileComplete，只能靠 retCall 快速感知，
            //  否则要等 60s 超时兜底）
            MxFun.sendStringToExecute('__openWebFile__', [
              opts.url,
              (code: number) => {
                if (code !== 0) {
                  fail(new Error(t('文件打开失败')));
                }
              },
              true,
              hasHeaders ? { requestHeaders: baseHeaders } : undefined,
              opts.fetchAttributes,
            ]);
            return;
          } catch (error) {
            const err = error as Error;
            if (
              err.message?.includes('mxdrawObject') &&
              attempt < FILE_OPEN_RETRY_CONFIG.MAX_RETRIES - 1
            ) {
              await new Promise((resolve) =>
                setTimeout(resolve, FILE_OPEN_RETRY_CONFIG.RETRY_DELAY_MS)
              );
              continue;
            }
            fail(error as Error);
            return;
          }
        }
      } catch {
        fail(new Error(t('文件打开失败')));
      }
    };
    void doOpen();
  }

  async openFile(payload: OpenFilePayload): Promise<void> {
    if (!this.manager.isReady()) {
      await this.waitForViewReady(payload);
      return;
    }
    // 打开文件前确保 auth_token cookie 新鲜：引擎内部请求（外部参照图片等）
    // 只携带 cookie 不携带 Authorization header，cookie 过期会直接 401
    await ensureFreshAuthCookie();
    if (payload.fileInfo) {
      this.manager.setPendingOpenInfo({
        fileInfo: payload.fileInfo,
        onSuccess: payload.onSuccess,
      });
    }
    const previousUrl = getCurrentFileUrl();
    setCurrentFileUrl(payload.url);
    // 更新模块级 shareToken（供 extReferenceUrlResolver 使用）
    // WASM 层的 HTTP 请求不携带 requestHeaders，只能通过 URL 传递认证信息
    setCurrentShareToken(extractShareTokenFromUrl(payload.url));
    const currentFileName = this.manager.getCurrentFileName();
    const targetFileName = payload.url.split('/').pop();
    // 早退：引擎当前文件名与目标一致**且**会话记录匹配（同一文件真正成功打开过）才跳过。
    // 打开失败时引擎 currentFileName 同样会被置为 URL 尾部内部文件名——若仅按文件名匹配，
    // 失败后重试同一图纸会错误早退（跳过真正打开），调用方随后 emitFileOpened 记录失败状态
    // （正是「失败不得记录当前文件状态」所禁止的）。成功打开的会话才被 openSession 记录，
    // 因此用 store 会话身份 === 本次身份 作为早退的第二条件。
    // 身份判据：云端文件用 fileId（唯一节点 ID）；本地文件 fileId 恒为 ''，
    // 回退到 fileHash（原始文件 MD5）区分——否则失败后重试同一本地文件会因
    // fileId 均为 '' 而错误早退（4660e0e 串行队列引入的下游缺陷）。
    const fileIdentity = (info: CurrentFileInfo | null | undefined): string =>
      info ? info.fileId || info.fileHash || '' : '';
    if (
      currentFileName &&
      targetFileName &&
      currentFileName === targetFileName &&
      payload.fileInfo &&
      fileIdentity(getFileInfo()) === fileIdentity(payload.fileInfo)
    ) {
      // 清理刚设置的 pending（早退不经 openFileComplete 消费，避免残留被后续事件消费）
      this.manager.setPendingOpenInfo(null);
      return Promise.resolve();
    }
    const mxcad = this.manager.getMxcadObject();
    if (!mxcad) throw new Error(t('mxcad 对象不可用'));
    // 打开失败（含游客 IP 转换限制 403 等）时恢复上一个图纸状态：
    // 回滚引擎侧当前文件 URL 和 shareToken，并清理待生效的文件信息，避免影响后续打开/重载
    const restorePreviousFile = () => {
      const pending = this.manager.getPendingOpenInfo();
      if (pending?.fileInfo.fileId === payload.fileInfo?.fileId) {
        this.manager.setPendingOpenInfo(null);
      }
      setCurrentFileUrl(previousUrl);
      // 恢复之前的 shareToken
      setCurrentShareToken(extractShareTokenFromUrl(previousUrl));
    };
    return new Promise<void>((resolve, reject) => {
      this.sendOpenWebFile({
        url: payload.url,
        fetchAttributes: payload.noCache
          ? FetchAttributes.EMSCRIPTEN_FETCH_LOAD_TO_MEMORY |
            FetchAttributes.EMSCRIPTEN_FETCH_PERSIST_FILE |
            FetchAttributes.EMSCRIPTEN_FETCH_REPLACE
          : 0,
        onSuccess: () => resolve(),
        onFail: (error) => {
          restorePreviousFile();
          // 打开失败时引擎会把 currentFileName 置为 URL 尾部的 mxweb 内部访问文件名，
          // mxcad-app 标题栏随之显示内部文件名；这里修正为图纸名：
          // 已有当前文件（切换失败）恢复原标题，首次进入失败则显示目标图纸名
          restoreEditorTitle(payload.fileInfo?.name);
          reject(error);
        },
      });
    });
  }

  async reloadCurrentFile(): Promise<boolean> {
    const currentMxwebUrl = getCurrentFileUrl();
    if (!currentMxwebUrl || !this.manager.getMxcadObject()) return false;
    // 重载会重新加载外部参照（引擎内部请求只带 cookie），先确保 cookie 新鲜
    await ensureFreshAuthCookie();
    return new Promise<boolean>((resolve) => {
      this.sendOpenWebFile({
        url: currentMxwebUrl,
        fetchAttributes: 0,
        onSuccess: () => {
          // 重载不经过 openSession，引擎会把 currentFileName 换成 URL 尾部的内部
          // 访问名、标题栏跟着脏掉（登录后重载、外部参照上传后重载都会命中）。
          // 会话里记着真正的图纸名，重载成功后立刻刷回来。
          refreshFileName();
          resolve(true);
        },
        onFail: () => {
          // reload 针对当前已打开文件，失败时恢复为当前文件标题
          restoreEditorTitle();
          resolve(false);
        },
      });
    });
  }
}
