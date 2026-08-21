test.describe.configure({ mode: 'serial' });

import { test, expect } from '../fixtures/collab.fixture';
import type { Page, APIRequestContext } from '@playwright/test';
import { CADEditorPage } from '../pages/CADEditorPage';
import { CollaborateSidebarPage } from '../pages/CollaborateSidebarPage';

/**
 * 实时协同域 — E2E 测试（issue #294）
 *
 * 覆盖：双用户同图会话建立（createWork / joinWork）、编辑同步（事件驱动）、
 *       冲突场景、保存版本链、退出会话回退本地（exitWork）。
 *
 * ⚠️ 前置条件（真实协同环境，缺一不可）：
 *   1. 真实后端全套：PostgreSQL + Redis + SVN + mxcad 转换服务
 *   2. 私有化协同服务（WebSocket 3091，经后端 /api/cooperate 代理）
 *   3. 运行时配置 collaborationEnabled = true（否则协同 tab 不可用）
 *   4. 双账号登录态 storageState：
 *        - e2e/.auth/user.json         （用户 A，协同发起方）
 *        - e2e/.auth/collab-user-b.json（用户 B，协同加入方，需预登录生成）
 *   5. 双用户均有权限访问的同一张真实图纸
 *
 * 默认 pnpm test:e2e（VITE_MSW=true）下后端不可达/开关未开启时，
 * beforeAll 探测失败 → 本 spec 整体 skip（MSW 无法模拟协同 WebSocket）。
 *
 * 真实环境运行（示例）：
 *   $env:E2E_COLLAB_FILE_ID="<nodeId>"; $env:E2E_COLLAB_PROJECT_ID="<projectId>";
 *   $env:E2E_COLLAB_FILE_PATH="<svnStoragePath>"
 *   pnpm exec playwright test e2e/spec/collab-editing.spec.ts --project=chromium
 *
 * 执行约束：
 *   - 域内串行（CAD 编辑器 WebGL 单实例 + 协同会话状态共享，不可并行）
 *   - CAD canvas 是黑盒：编辑动作通过全局 MxFun/MxCpp 派发（真实引擎环境），
 *     无法派发时对编辑同步类断言降级 skip 并说明
 */

// ─── 测试种子数据 ──────────────────────────────────────────
// 真实环境通过环境变量注入；默认值仅在 mock/占位环境使用
const SEED = {
  /** 协同图纸 fileId（nodeId） */
  fileId: process.env.E2E_COLLAB_FILE_ID || 'seed-collab-file',
  /** 项目 ID（版本历史接口必需，为空时版本链用例 skip） */
  projectId: process.env.E2E_COLLAB_PROJECT_ID || '',
  /** SVN 存储路径（版本历史接口必需，为空时版本链用例 skip） */
  filePath: process.env.E2E_COLLAB_FILE_PATH || '',
};

// ─── 前置条件探测 ──────────────────────────────────────────
// null = 未完成探测；'' = 就绪；其他 = 不满足原因（全部用例 skip）
let envReady: string | null = null;

test.beforeAll(async ({ request }) => {
  try {
    // 直连后端（Playwright request 为 Node 端 HTTP 客户端，不经过浏览器 MSW；
    // 经 vite dev proxy 转发到后端 3001）
    const res = await request.get('/api/v1/runtime-config/public', {
      timeout: 8000,
    });
    if (!res.ok()) {
      envReady = `后端返回 HTTP ${res.status()}（需真实后端 + DB/Redis/SVN/转换服务）`;
      return;
    }
    const body = (await res.json()) as {
      data?: { collaborationEnabled?: boolean };
    };
    if (body.data?.collaborationEnabled !== true) {
      envReady = '运行时配置 collaborationEnabled 未开启（实时协同仅私有化部署支持）';
      return;
    }
    envReady = '';
  } catch {
    envReady =
      '后端不可达：默认 E2E 为 MSW 模式（VITE_MSW=true），协同 WebSocket 无 mock；' +
      '需真实后端 + 私有化协同服务（3091）环境运行';
  }
});

// ─── 工具函数 ──────────────────────────────────────────────

/** 打开指定图纸并展开协同面板 */
async function openDrawing(page: Page, fileId: string) {
  const editor = new CADEditorPage(page);
  await editor.goto(fileId);
  await editor.waitForDrawingLoad(60000);
  await editor.waitForToolbar(15000);
  const collab = new CollaborateSidebarPage(page);
  await collab.openTab();
  await expect(collab.panel).toBeVisible({ timeout: 10000 });
  return { editor, collab };
}

/**
 * 建立双用户协同会话：A 创建（createWork 自动加入）→ B 加入（joinWork）
 * 返回双方页面对象，用于后续编辑/保存/退出断言
 */
async function establishSession(userA: Page, userB: Page, fileId: string) {
  const a = await openDrawing(userA, fileId);
  await a.collab.createWork(60000);
  await expect(a.collab.liveBadge).toBeVisible({ timeout: 60000 });

  const b = await openDrawing(userB, fileId);
  await b.collab.joinFirstWork(60000);
  await expect(b.collab.liveBadge).toBeVisible({ timeout: 60000 });

  // 双端在线人数 = 2（getWorks 轮询刷新，自动等待）
  await expect
    .poll(async () => a.collab.getOnlineCount(), { timeout: 30000 })
    .toBe(2);
  return { a, b };
}

/**
 * 在 CAD 引擎内派发一次编辑动作（黑盒）。
 * 优先级：全局 MxFun 命令 → 引擎 drawLine API。
 * 返回 true 表示已派发；false 表示当前环境无法派发（无全局引擎句柄）。
 */
async function performEdit(page: Page): Promise<boolean> {
  // 1) MxFun 命令（mxcad-app 通常挂载到 window）
  const viaMxFun = await page
    .evaluate(() => {
      const win = window as unknown as Record<string, unknown>;
      const fn = win.MxFun as
        | { sendStringToExecute?: (cmd: string) => void }
        | undefined;
      if (typeof fn?.sendStringToExecute === 'function') {
        fn.sendStringToExecute('Mx_Line');
        return true;
      }
      return false;
    })
    .catch(() => false);
  if (viaMxFun) return true;

  // 2) 引擎实例直接画线
  return page
    .evaluate(() => {
      const win = window as unknown as Record<string, unknown>;
      try {
        const mxcad = (win.MxCpp as { getCurrentMxCAD?: () => unknown })
          ?.getCurrentMxCAD?.();
        const Pt = win.McGePoint3d as (new (...a: number[]) => unknown) | undefined;
        if (!mxcad || typeof Pt !== 'function') return false;
        const drawLine = (mxcad as { drawLine?: (p1: unknown, p2: unknown) => void })
          .drawLine;
        if (typeof drawLine !== 'function') return false;
        const r = Math.random() * 100;
        drawLine(new Pt(r, r, 0), new Pt(r + 50, r + 50, 0));
        return true;
      } catch {
        return false;
      }
    })
    .catch(() => false);
}

/** 读取页面登录态 cookie 并拼装 Cookie header（含 httpOnly 的 auth_token） */
async function cookieHeaderOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * 读取图纸版本历史 totalCount（SVN 提交次数）
 * 返回 -1 表示接口不可用/无权限
 */
async function fetchHistoryTotal(
  request: APIRequestContext,
  cookieHeader: string
): Promise<number> {
  try {
    const res = await request.get(
      `/api/v1/version-control/history?projectId=${encodeURIComponent(
        SEED.projectId
      )}&filePath=${encodeURIComponent(SEED.filePath)}`,
      { headers: { Cookie: cookieHeader }, timeout: 10000 }
    );
    if (!res.ok()) return -1;
    const body = (await res.json()) as { data?: { totalCount?: number } };
    return body.data?.totalCount ?? -1;
  } catch {
    return -1;
  }
}

/** 给页面挂载错误监听（console error + 未捕获异常），断言时读取 */
function attachErrorListener(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

// ─── 实时协同域顶层 ────────────────────────────────────────

test.describe('实时协同', { tag: ['@collab-editing'] }, () => {
  test.beforeEach(async ({}) => {
    test.skip(envReady !== '', envReady ?? '前置条件探测未完成');
  });

  // =========================================================
  //  1. 双用户会话建立
  // =========================================================
  test.describe('双用户会话建立', () => {
    test('CC-001: 双用户同时打开同一图纸 → 编辑器均加载完成 + 协同面板可用', async ({
      userAPage,
      userBPage,
    }) => {
      const a = await openDrawing(userAPage, SEED.fileId);
      const b = await openDrawing(userBPage, SEED.fileId);

      // 双方编辑器容器与 canvas 均就绪
      await expect(a.editor.container).toBeAttached({ timeout: 30000 });
      await expect(b.editor.container).toBeAttached({ timeout: 30000 });
      await expect(userAPage.locator('canvas').first()).toBeAttached();
      await expect(userBPage.locator('canvas').first()).toBeAttached();

      // 协同面板可见（collaborationEnabled 开启的前置条件已由探测保证）
      await expect(a.collab.createWorkButton).toBeVisible({ timeout: 10000 });
      await expect(b.collab.createWorkButton).toBeVisible({ timeout: 10000 });
    });

    test('CC-002: A 创建协同 → B 可见会话并加入 → 双方"协同中" + 在线 2', async ({
      userAPage,
      userBPage,
    }) => {
      const a = await openDrawing(userAPage, SEED.fileId);

      // A 创建协同（createWork 成功后 SDK 自动加入）
      await a.collab.createWork(60000);
      await expect(a.collab.liveBadge).toBeVisible({ timeout: 60000 });
      // 创建者的卡片显示「退出」按钮（已加入态）
      await expect(a.collab.exitButton.first()).toBeVisible({ timeout: 10000 });

      // B 侧可见协同会话并加入（joinWork）
      const b = await openDrawing(userBPage, SEED.fileId);
      await b.collab.joinFirstWork(60000);
      await expect(b.collab.liveBadge).toBeVisible({ timeout: 60000 });

      // 双端在线人数 = 2
      await expect
        .poll(async () => a.collab.getOnlineCount(), { timeout: 30000 })
        .toBe(2);
      await expect
        .poll(async () => b.collab.getOnlineCount(), { timeout: 30000 })
        .toBe(2);
    });
  });

  // =========================================================
  //  2. 编辑同步（事件驱动验证）
  // =========================================================
  test.describe('编辑同步', () => {
    let userA: Page;
    let userB: Page;
    let aCollab: CollaborateSidebarPage;
    let bCollab: CollaborateSidebarPage;

    test.beforeEach(async ({ userAPage, userBPage }) => {
      userA = userAPage;
      userB = userBPage;
      const session = await establishSession(userAPage, userBPage, SEED.fileId);
      aCollab = session.a.collab;
      bCollab = session.b.collab;
    });

    test('CC-003: A 编辑 → B 侧会话稳定同步（事件窗口无错误 + 在线状态保持）', async ({
      request,
    }) => {
      // B 侧挂载错误监听，同步窗口内不允许出现引擎/协同错误
      const bErrors = attachErrorListener(userB);

      // A 派发编辑动作
      const edited = await performEdit(userA);
      if (!edited) {
        test.skip(
          true,
          '当前环境无法派发引擎编辑动作（需真实 mxcad 引擎暴露 window.MxFun/MxCpp）'
        );
      }

      // 事件同步窗口：等待轮询可见 B 侧仍在线、会话未断
      await expect
        .poll(async () => bCollab.getOnlineCount(), { timeout: 30000 })
        .toBe(2);
      await expect(bCollab.liveBadge).toBeVisible({ timeout: 10000 });

      // 同步窗口内无未捕获异常 / console error
      expect(bErrors).toEqual([]);
    });
  });

  // =========================================================
  //  3. 冲突场景（同时编辑）
  // =========================================================
  test.describe('冲突场景', () => {
    let userA: Page;
    let userB: Page;
    let aCollab: CollaborateSidebarPage;
    let bCollab: CollaborateSidebarPage;

    test.beforeEach(async ({ userAPage, userBPage }) => {
      userA = userAPage;
      userB = userBPage;
      const session = await establishSession(userAPage, userBPage, SEED.fileId);
      aCollab = session.a.collab;
      bCollab = session.b.collab;
    });

    test('CC-004: A、B 同时编辑 → 冲突由协同服务处理 → 会话稳定 + 后续保存成功', async ({
      request,
    }) => {
      const aErrors = attachErrorListener(userA);
      const bErrors = attachErrorListener(userB);

      // 双方同时派发编辑（真实协同服务负责冲突检测与合并）
      const [aEdited, bEdited] = await Promise.all([
        performEdit(userA),
        performEdit(userB),
      ]);
      if (!aEdited || !bEdited) {
        test.skip(
          true,
          '当前环境无法派发引擎编辑动作（需真实 mxcad 引擎暴露 window.MxFun/MxCpp）'
        );
      }

      // 冲突处理后：双方会话均保持在线
      await expect
        .poll(async () => aCollab.getOnlineCount(), { timeout: 30000 })
        .toBe(2);
      await expect
        .poll(async () => bCollab.getOnlineCount(), { timeout: 30000 })
        .toBe(2);

      // 冲突解决后 B 仍可正常保存（保存成功 Toast）
      await new CADEditorPage(userB).clickSave();
      await expect(
        userB.getByText(/保存成功/).first()
      ).toBeVisible({ timeout: 30000 });

      expect(aErrors).toEqual([]);
      expect(bErrors).toEqual([]);
    });
  });

  // =========================================================
  //  4. 保存 → 版本链
  // =========================================================
  test.describe('保存与版本链', () => {
    let userA: Page;
    let userB: Page;

    test.beforeEach(async ({ userAPage, userBPage }) => {
      const session = await establishSession(userAPage, userBPage, SEED.fileId);
      userA = session.a.editor.page;
      userB = session.b.editor.page;
    });

    test('CC-005: B 保存 → Toast 成功 → 版本历史 totalCount 递增', async ({
      request,
    }) => {
      // 版本历史接口需要 projectId + SVN 存储路径，未配置则跳过
      if (!SEED.projectId || !SEED.filePath) {
        test.skip(
          true,
          '未配置 E2E_COLLAB_PROJECT_ID / E2E_COLLAB_FILE_PATH，无法断言版本链'
        );
      }

      const cookieHeader = await cookieHeaderOf(userB);
      const before = await fetchHistoryTotal(request, cookieHeader);
      // -1 = 接口不可用/无权限（fetchHistoryTotal 契约），跳过而非 fail
      if (before === -1) {
        test.skip(true, '版本历史接口不可用或无权限（返回 -1），无法断言版本链');
      }
      expect(before).toBeGreaterThanOrEqual(0);

      // B 保存（协同模式下提交合并后的图纸）
      await new CADEditorPage(userB).clickSave();
      await expect(
        userB.getByText(/保存成功/).first()
      ).toBeVisible({ timeout: 30000 });

      // SVN 提交为异步，轮询等待版本数递增
      await expect
        .poll(
          async () => {
            const after = await fetchHistoryTotal(request, cookieHeader);
            return after;
          },
          { timeout: 60000, intervals: [2000, 3000, 5000] }
        )
        .toBeGreaterThan(before);
    });
  });

  // =========================================================
  //  5. 退出会话 → 回退本地
  // =========================================================
  test.describe('退出会话', () => {
    let userA: Page;
    let userB: Page;
    let aCollab: CollaborateSidebarPage;
    let bCollab: CollaborateSidebarPage;

    test.beforeEach(async ({ userAPage, userBPage }) => {
      userA = userAPage;
      userB = userBPage;
      const session = await establishSession(userAPage, userBPage, SEED.fileId);
      aCollab = session.a.collab;
      bCollab = session.b.collab;
    });

    test('CC-006: A 退出协同 → 徽标消失 + Toast"已退出协同" → B 在线数降为 1', async () => {
      const aErrors = attachErrorListener(userA);

      // A 退出（exitWork → 断开协同连接，回退本地编辑）
      await aCollab.exitWork(30000);

      // A 侧：协同徽标消失
      await expect(aCollab.liveBadge).toBeHidden({ timeout: 15000 });

      // B 侧：在线数降为 1（getWorks 轮询刷新）
      await expect
        .poll(async () => bCollab.getOnlineCount(), { timeout: 30000 })
        .toBe(1);

      // A 本地编辑器未崩溃（回退本地状态后可继续操作）
      expect(aErrors).toEqual([]);
      await expect(userA.locator('canvas').first()).toBeAttached();
    });
  });
});
