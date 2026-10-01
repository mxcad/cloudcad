import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

/**
 * 回归：编辑器图纸不得被壳内导航重复打开
 *
 * 根因：子页原是 /shell 的 children，而 App.vue 不走 <router-view>（保 WebGL），
 * Shell 覆盖层里的 <router-view> 处于第 0 层——children 嵌套下它渲染 matched[0]
 * = Shell 本身：每进一个子页就重挂一套 Shell+Home（编辑器），深链 ?fileId= 被
 * 重新消费 → 完整重开一遍图纸（用户报告：进文件页/建项目/进我的页都重开）。
 * 修复：子页拍平为顶层路由（见 router/index.ts）。本测试锁定：挂载期按 URL
 * 打开一次，随后登录态连续进入全部需登录子页再回壳根，open 恰好 1 次、
 * Home setup 恰好 1 次。
 */

const { sdkMap, openMxWebMock, fakeMxcad, homeSetupCount } = vi.hoisted(() => ({
  sdkMap: new Map<string, Mock<any, any>>(),
  openMxWebMock: vi.fn(async () => true),
  fakeMxcad: {
    on: vi.fn(),
    off: vi.fn(),
    getCurrentFileName: vi.fn(() => 'drawing.mxweb'),
    newFile: vi.fn(),
  },
  homeSetupCount: { value: 0 },
}));

// authFeedback 模块级引入 vant 样式（Node 端无 css loader，见 authFeedback.spec 同款）
vi.mock('vant/es/dialog/style', () => ({}));
vi.mock('vant/es/toast/style', () => ({}));
// globalComponents 插件用 import.meta.globEager（vitest 的 vite-node 不支持），
// 全局组件缺失只产生 Vue 解析告警，不影响本测试断言
vi.mock('@/plugins', () => ({ default: { install: vi.fn() } }));
// uiConfig 由 main.ts 的 initConfig() 异步填充，测试直接给空形状
vi.mock('@/config/uiConfig', () => ({
  uiConfig: { headerMenuData: [], toolbarData: [] },
}));
// mxdraw 被别名到空 mock，MxFun 未定义；给命令行监听一个空实现
vi.mock('mxdraw', () => ({
  MxFun: {
    listenForCommandLineInput: vi.fn(),
    setCommandLineInputData: vi.fn(),
    getQueryString: vi.fn(() => null),
  },
}));

// 枚举真实导出、函数全部替换为默认 mock：挂载 App 会拉起全部子页，
// 各页消费的 SDK 函数面很大，逐个手写会漏（Proxy 工厂会被 vitest 的
// mock 包装层拒绝——未登记导出的访问直接抛错，故不能用）
vi.mock('@/api-sdk', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    const value = actual[key];
    if (typeof value === 'function') {
      const fn = vi.fn(async () => ({ data: {} }));
      sdkMap.set(key, fn);
      mocked[key] = fn;
    } else {
      mocked[key] = value;
    }
  }
  return mocked;
});

vi.mock('@/plugins/mxcad', () => ({
  createMxCAD: vi.fn(async () => fakeMxcad),
  openFileByNodeId: vi.fn(async () => true),
}));

// 统计 Home setup 执行次数（每次重挂载 +1）
vi.mock('@/pages/home/hooks/useMenu', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  const original = mod.useMenu as (...args: unknown[]) => unknown;
  return {
    ...mod,
    useMenu: (...args: unknown[]) => {
      homeSetupCount.value += 1;
      return original(...args);
    },
  };
});

vi.mock('@/plugins/mxcad/openMxWeb', () => ({
  openMxWeb: openMxWebMock,
}));

vi.mock('@/plugins/mxcad/command', () => ({
  addCommand: vi.fn(),
  callCommand: vi.fn(),
}));

vi.mock('@/services/permissionService', () => ({
  loadCADPermissions: vi.fn(async () => {}),
  checkLibraryPermissions: vi.fn(async () => ({
    canManageDrawing: false,
    canManageBlock: false,
  })),
  canExportDownloadGate: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/services/thumbnailService', () => ({
  uploadThumbnailForNode: vi.fn(async () => {}),
}));

vi.mock('@/services/mxwebCacheService', () => ({
  getCachedMxwebData: vi.fn(async () => null),
  setMxwebCache: vi.fn(async () => {}),
  buildCacheKey: (path: string, ts: number) => `${path}:${ts}`,
  clearMxwebCache: vi.fn(async () => {}),
}));

vi.mock('@/services/extRefService', () => ({
  getPreloadingData: vi.fn(async () => null),
  checkExternalReferences: vi.fn(async () => []),
  uploadExtRefImage: vi.fn(),
  uploadExtRefDwg: vi.fn(),
  parseExtRefFileNames: vi.fn(() => []),
}));

vi.mock('@/services/publicFileService', () => ({
  isHashLike: vi.fn(() => false),
  getPublicPreloadingData: vi.fn(async () => null),
  buildPublicMxwebUrl: vi.fn(() => ''),
  checkPublicExtReference: vi.fn(async () => true),
}));

vi.mock('@/composables/useCooperate', () => ({
  exitCollaborationIfNeeded: vi.fn(),
}));

vi.mock('@/composables/useCollabAutoJoin', () => ({
  useCollabAutoJoin: () => ({ startAutoJoin: vi.fn(() => vi.fn()) }),
}));

vi.mock('@/composables/useRuntimeConfig', async () => {
  const { ref } = await import('vue');
  const config = ref({
    mailEnabled: false,
    requireEmailVerification: false,
    smsEnabled: false,
    requirePhoneVerification: false,
    supportEmail: '',
    supportPhone: '',
    maxFileSize: 100,
    allowRegister: true,
    wechatEnabled: false,
    wechatAutoRegister: false,
    userCancelGraceDays: 7,
    conversionGuestWindowHours: 1,
    conversionGuestLimit: 5,
    freeExportDownloadEnabled: true,
    collaborationEnabled: false,
    collaborationDomains: '',
    batchDownloadEnabled: true,
  });
  return { useRuntimeConfig: () => ({ config }) };
});

import App from '@/App.vue';
import router from '@/router';
import plugins from '@/plugins';
import { i18nPlugin } from '@voerkai18n/vue';
import { i18nScope } from '@/languages';

/** 取回 mock 里模块实际持有的同一 fn 实例再改实现 */
async function stubSdk(
  name: string,
  impl: (...args: unknown[]) => unknown
): Promise<void> {
  const apiSdk = (await import('@/api-sdk')) as unknown as Record<
    string,
    { mockImplementation: (fn: unknown) => void }
  >;
  apiSdk[name].mockImplementation(impl);
}

const NODE = {
  id: 'node-1',
  name: '测试图纸.dwg',
  path: '202610/node-1/a.mxweb',
  fileHash: 'hash-1',
  updatedAt: '2026-10-01T00:00:00.000Z',
  isRoot: false,
  parentId: 'proj-1',
  deletedAt: null,
};

function fakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })
  );
  return `${header}.${payload}.sig`;
}

async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
}

let mounted: { app: ReturnType<typeof createApp>; el: HTMLDivElement } | null =
  null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // sdkMap 与 mock 对象共享同一批 fn 实例，只重置调用记录与实现，不重建
  for (const fn of sdkMap.values()) {
    fn.mockReset();
    fn.mockImplementation(async () => ({ data: {} }));
  }
  openMxWebMock.mockClear();
  localStorage.setItem('accessToken', fakeJwt());
  localStorage.setItem(
    'user',
    JSON.stringify({ id: 'u1', username: 'tester' })
  );
  // 深链形态：业务参数在 hash 之前（ADR-0070）。
  // happy-dom 的 history.pushState 不会反映到 location，须用其 setURL API
  const happyDom = (
    window as unknown as { happyDOM?: { setURL: (url: string) => void } }
  ).happyDOM;
  happyDom?.setURL('http://localhost:3000/?fileId=node-1#/shell');
});

afterEach(() => {
  mounted?.app.unmount();
  mounted?.el.remove();
  mounted = null;
});

describe('壳内导航不重复打开图纸（回归）', () => {
  it('首次挂载按 URL 打开一次，登录态连续导航不再打开', async () => {
    await stubSdk('nodeControllerGetNode', async () => ({ data: NODE }));

    const app = createApp(App);
    const pinia = createPinia();
    setActivePinia(pinia);
    app.use(pinia);
    app.use(router);
    app.use(i18nPlugin as never, { i18nScope });
    app.use(plugins);
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    mounted = { app, el };

    expect(window.location.search).toContain('fileId=node-1');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/shell');

    await settle(20);

    // 挂载期：URL fileId 驱动的首次打开（fetch 节点信息 1 次 + 引擎 open 1 次）
    expect(sdkMap.get('nodeControllerGetNode')).toHaveBeenCalledTimes(1);
    expect(openMxWebMock).toHaveBeenCalledTimes(1);

    // ====== 用户报告的四个复现点：登录后连续进入子页 ======
    const nodeFetch = sdkMap.get('nodeControllerGetNode')!;
    const trace = (label: string) =>
      console.log(
        `[reopen-trace] ${label}: nodeControllerGetNode=${nodeFetch.mock.calls.length}, openMxWeb=${openMxWebMock.mock.calls.length}, homeSetup=${homeSetupCount.value}`
      );
    trace('mount 后');

    await router.push('/shell/file');
    await settle(8);
    trace('/shell/file');
    await router.push('/shell/file/project/proj-1');
    await settle(8);
    trace('/shell/file/project/proj-1');
    await router.push('/shell/profile');
    await settle(8);
    trace('/shell/profile');
    await router.push('/shell');
    await settle(8);
    trace('/shell');

    // 导航全程：图纸不得重开（回归断言），编辑器根（Home）不得重挂
    // （重挂即「第二个 Shell」——深链 ?fileId= 会被重新消费而重复打开图纸）
    expect(nodeFetch).toHaveBeenCalledTimes(1);
    expect(openMxWebMock).toHaveBeenCalledTimes(1);
    expect(homeSetupCount.value).toBe(1);
  });
});
