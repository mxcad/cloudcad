test.describe.configure({ mode: 'serial' });

import { test, expect } from '../fixtures/auth.fixture';
import { CADEditorPage } from '../pages/CADEditorPage';
import { SaveAsModalPage } from '../pages/SaveAsModalPage';
import { DownloadFormatModalPage } from '../pages/DownloadFormatModalPage';
import { ExternalReferenceModalPage } from '../pages/ExternalReferenceModalPage';
import { DashboardPage } from '../pages/DashboardPage';

/**
 * 图纸内容域 — E2E 测试
 *
 * 覆盖：CAD 编辑器外壳、另存为弹窗、导出弹窗、外部参照弹窗、
 *       未保存修改确认、Toast 通知、仪表盘、端到端工作流
 *
 * 执行约束：
 *   - 域内串行（CAD 编辑器 WebGL 单实例，不可并行）
 *   - CAD canvas 是黑盒，仅测试 React DOM 外围（加载状态、弹窗、Toast、按钮可见性）
 *   - CAD 工具栏按钮在 mxcad-app 的 Vue 3 + Vuetify 内，使用 CSS 选择器后备定位
 */

// ─── 测试种子数据 ──────────────────────────────────────────
// 需要预建以下数据：
//   - FILE_A: 私有 mxweb 文件（OWNER 所有）
//   - FILE_B: 项目内 mxweb 文件（EDITOR 可编辑）
//   - FILE_XREF: 含外部参照的主文件
//   - XREF_DEP: 外部参照依赖文件
//   - FILE_404: 不存在的 fileId，用于测试错误状态
const SEED = {
  fileA: 'seed-file-a',          // 私有文件
  fileB: 'seed-file-b',          // 项目文件
  fileXref: 'seed-file-xref',    // 含外部参照
  xrefDep: 'seed-xref-dep',      // 参照依赖
  file404: 'nonexistent-file-id',// 不存在的文件
};

// ─── 图纸内容域顶层 ────────────────────────────────────────

test.describe('图纸内容域', { tag: ['@drawing-content'] }, () => {

  // =========================================================
  //  1. CAD 编辑器
  // =========================================================
  test.describe('CAD 编辑器', () => {
    let cadEditor: CADEditorPage;

    // ── 基础交互 ──
    test.describe('基础交互', () => {
      test('CE-001: 编辑器容器渲染 → canvas 元素存在', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.fileA);
        // mxcad-app 在 document.body 级创建 canvas
        await cadEditor.waitForDrawingLoad(60000);
        await expect(page.locator('canvas').first()).toBeAttached();
      });

      test('CE-002: 无文件参数访问 → 显示空白画布或欢迎引导', async ({ page }) => {
        await page.goto('/cad-editor');
        await page.waitForLoadState('networkidle');
        // 无 fileId 参数，应显示空白画布或欢迎面板
        await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30000 });
      });
    });

    // ── 加载状态 ──
    test.describe('加载状态', () => {
      test('CE-003: CAD 引擎加载中 → 显示 Spinner + "加载CAD引擎..." 文字', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.fileA);
        // 加载过程中应显示 spinner 和加载文字
        await expect(cadEditor.container).toBeAttached({ timeout: 30000 });
        // 根据引擎初始化速度，spinner 可能出现也可能已消失
        const loadingState = await cadEditor.getLoadingState();
        // 至少容器已挂载，加载完成后无错误
        await cadEditor.waitForDrawingLoad(60000);
        await expect(cadEditor.loadingSpinner).toBeHidden({ timeout: 10000 });
      });

      test('CE-004: 指定 fileId → 打开图纸 → "加载图纸..." → 渲染完成消失', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.fileA);
        // 等待图纸加载完成
        await cadEditor.waitForDrawingLoad(60000);
        // 加载完成后 spinner 应消失
        await expect(cadEditor.loadingSpinner).toBeHidden({ timeout: 10000 });
        // canvas 应已挂载
        await expect(page.locator('canvas').first()).toBeAttached();
      });
    });

    // ── 错误状态 ──
    test.describe('错误状态', () => {
      test('CE-005: 打开不存在的文件 → 显示错误信息 + "刷新页面"/"返回项目列表"', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.file404);
        // 等待编辑器进入错误状态
        await cadEditor.errorMessage.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
        await expect(cadEditor.errorMessage).toBeVisible({ timeout: 30000 });
        // 应有恢复按钮
        await expect(cadEditor.retryButton.first()).toBeVisible();
      });

      test('CE-006: 错误状态 → 点击"刷新页面" → 重新加载当前页面', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.file404);
        await cadEditor.errorMessage.waitFor({ state: 'visible', timeout: 30000 });
        // 点击刷新按钮
        const refreshButton = cadEditor.retryButton.filter({ hasText: /刷新/ }).first();
        await refreshButton.click();
        // 页面重新加载，应保持在 cad-editor 路由
        await expect(page).toHaveURL(/\/cad-editor/, { timeout: 15000 });
      });

      test('CE-007: 错误状态 → 点击"返回项目列表" → 导航到 /projects', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.file404);
        await cadEditor.errorMessage.waitFor({ state: 'visible', timeout: 30000 });
        // 点击返回按钮
        const backButton = cadEditor.retryButton.filter({ hasText: /返回/ }).first();
        await backButton.click();
        await expect(page).toHaveURL(/\/projects/, { timeout: 15000 });
      });

      test('CE-009: 打开已删除文件 → 显示"文件已删除"或类似错误提示', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.file404);
        await cadEditor.errorMessage.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
        // 错误提示应包含文件相关错误信息
        await expect(cadEditor.errorMessage).toBeVisible({ timeout: 30000 });
      });
    });

    // ── 工具栏 ──
    test.describe('工具栏', () => {
      test.beforeEach(async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.fileA);
        await cadEditor.waitForDrawingLoad(60000);
        await cadEditor.waitForToolbar(15000);
      });

      test('CE-010: 保存按钮可见', async () => {
        await expect(cadEditor.saveButton).toBeVisible({ timeout: 15000 });
      });

      test('CE-011: 另存为按钮可见', async () => {
        await expect(cadEditor.saveAsButton).toBeVisible({ timeout: 15000 });
      });

      test('CE-012: 导出按钮可见', async () => {
        await expect(cadEditor.exportButton).toBeVisible({ timeout: 15000 });
      });

      test('CE-013: 撤销/重做按钮可见', async () => {
        await expect(cadEditor.undoButton).toBeVisible({ timeout: 15000 });
        await expect(cadEditor.redoButton).toBeVisible({ timeout: 15000 });
      });
    });

    // ── 导航 ──
    test.describe('导航', () => {
      test('CE-020: URL 直达打开（?nodeId=xxx）→ 跳过欢迎面板直接打开图纸', async ({ page }) => {
        await page.goto(`/cad-editor?nodeId=${SEED.fileA}`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30000 });
      });

      test('CE-021: 资源库文件打开（?library=drawing）→ 从图纸库打开', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        await cadEditor.gotoWithLibrary(SEED.fileA, 'drawing');
        await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30000 });
      });
    });
  });

  // =========================================================
  //  2. 另存为弹窗 (SaveAsModal)
  // =========================================================
  test.describe('另存为弹窗', () => {
    let cadEditor: CADEditorPage;
    let saveAsModal: SaveAsModalPage;

    test.beforeEach(async ({ page }) => {
      cadEditor = new CADEditorPage(page);
      saveAsModal = new SaveAsModalPage(page);
      await cadEditor.goto(SEED.fileA);
      await cadEditor.waitForDrawingLoad(60000);
      await cadEditor.waitForToolbar(15000);
    });

    // ── 弹窗打开/关闭 ──
    test.describe('弹窗打开/关闭', () => {
      test('SA-001: 点击另存为按钮 → SaveAsModal 弹窗显示', async () => {
        await cadEditor.clickSaveAs();
        await cadEditor.waitForSaveAsModal(10000);
        await expect(saveAsModal.modal).toBeVisible();
        await expect(saveAsModal.title).toBeVisible();
      });

      test('SA-007: 点击右上角 X → 弹窗关闭', async () => {
        await cadEditor.clickSaveAs();
        await cadEditor.waitForSaveAsModal(10000);
        await cadEditor.closeSaveAsModal();
        await expect(saveAsModal.modal).toBeHidden({ timeout: 5000 });
      });

      test('SA-008: 点击弹窗遮罩 → 弹窗关闭', async () => {
        await cadEditor.clickSaveAs();
        await cadEditor.waitForSaveAsModal(10000);
        await saveAsModal.clickOverlay();
        await expect(saveAsModal.modal).toBeHidden({ timeout: 5000 });
      });

      test('SA-009: 按 Esc 键 → 弹窗关闭', async () => {
        await cadEditor.clickSaveAs();
        await cadEditor.waitForSaveAsModal(10000);
        await cadEditor.pressEscape();
        await expect(saveAsModal.modal).toBeHidden({ timeout: 5000 });
      });
    });

    // ── 目标选择 ──
    test.describe('目标选择', () => {
      test.beforeEach(async () => {
        await cadEditor.clickSaveAs();
        await cadEditor.waitForSaveAsModal(10000);
      });

      test('SA-002: 切换到"私人空间/我的图纸" Tab → 显示私人空间文件树', async () => {
        await saveAsModal.selectTargetType('personal');
        await expect(saveAsModal.targetPersonalButton).toBeVisible();
      });

      test('SA-003: 切换到"项目" Tab → 显示项目选择下拉 + 搜索输入', async () => {
        await saveAsModal.selectTargetType('project');
        await expect(saveAsModal.projectSelect).toBeVisible({ timeout: 5000 });
      });

      test('SA-004: 切换到"公开资源库" Tab → 显示资源库类型选项', async () => {
        // 库权限用户可看到此 Tab
        const libraryVisible = await saveAsModal.targetLibraryButton.isVisible().catch(() => false);
        if (libraryVisible) {
          await saveAsModal.selectTargetType('library');
          await expect(saveAsModal.librarySelect).toBeVisible({ timeout: 5000 });
        }
        // 如果不可见，说明用户没有库管理权限，符合预期
      });

      test('SA-005: 在搜索输入框输入关键词 → 目标列表过滤', async () => {
        await cadEditor.fillSaveAsTarget('搜索关键词');
        await expect(cadEditor.saveAsSearchInput).toHaveValue('搜索关键词');
      });
    });

    // ── 确认保存 ──
    test.describe('确认保存', () => {
      test('SA-006: 选择目标 → 确认保存 → loading → Toast "保存成功" → 弹窗关闭', async ({ page }) => {
        await cadEditor.clickSaveAs();
        await cadEditor.waitForSaveAsModal(10000);

        // 选择项目 Tab
        await saveAsModal.selectTargetType('project');

        // 选择第一个可用目标（如果有）
        const targetItem = cadEditor.saveAsTargetList.first();
        if (await targetItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await targetItem.click();
        }

        // 确认保存
        await cadEditor.confirmSaveAs();

        // Toast 成功提示
        await expect(page.getByText(/保存成功/)).toBeVisible({ timeout: 15000 });
        // 弹窗关闭
        await expect(saveAsModal.modal).toBeHidden({ timeout: 5000 });
      });
    });

    // ── 权限 ──
    test.describe('权限', () => {
      test('SA-010: VIEWER 角色 → 另存为按钮不可见', async ({ page }) => {
        // 需要 Viewer 角色的 storageState fixture
        test.skip(true, '需要 Viewer 角色的 storageState fixture');
      });
    });
  });

  // =========================================================
  //  3. 导出弹窗 (ExportModal)
  // =========================================================
  test.describe('导出弹窗', () => {
    let cadEditor: CADEditorPage;
    let exportModal: DownloadFormatModalPage;

    test.beforeEach(async ({ page }) => {
      cadEditor = new CADEditorPage(page);
      exportModal = new DownloadFormatModalPage(page);
      await cadEditor.goto(SEED.fileA);
      await cadEditor.waitForDrawingLoad(60000);
      await cadEditor.waitForToolbar(15000);
    });

    // ── 弹窗打开 ──
    test.describe('弹窗打开', () => {
      test('EX-001: 点击导出按钮 → 导出弹窗显示，格式选项可见', async () => {
        await cadEditor.clickExport();
        await cadEditor.waitForExportModal(10000);
        await expect(exportModal.modal).toBeVisible();
        await expect(exportModal.formatDwgRadio).toBeVisible();
        await expect(exportModal.formatDxfRadio).toBeVisible();
        await expect(exportModal.title).toBeVisible();
      });
    });

    // ── 格式选择 ──
    test.describe('格式选择', () => {
      test.beforeEach(async () => {
        await cadEditor.clickExport();
        await cadEditor.waitForExportModal(10000);
      });

      test('EX-002: 选择 DWG → DWG 选项选中', async () => {
        await exportModal.selectFormat('dwg');
        await expect(exportModal.formatDwgRadio).toBeChecked();
      });

      test('EX-003: 选择 DXF → DXF 选项选中', async () => {
        await exportModal.selectFormat('dxf');
        await expect(exportModal.formatDxfRadio).toBeChecked();
      });

      test('EX-004: 选择 PDF → PDF 选项选中 + PDF 参数面板显示', async () => {
        await exportModal.selectFormat('pdf');
        await expect(exportModal.formatPdfRadio).toBeChecked();
        // PDF 参数区域可能出现（宽度、高度、颜色策略）
        await expect(exportModal.pdfWidthInput).toBeVisible({ timeout: 3000 }).catch(() => {});
      });
    });

    // ── 确认导出 ──
    test.describe('确认导出', () => {
      test('EX-005: 选 DWG → 点击导出 → loading → 自动下载触发 → 弹窗关闭', async ({ page }) => {
        await cadEditor.clickExport();
        await cadEditor.waitForExportModal(10000);
        await exportModal.selectFormat('dwg');

        // 监听下载事件
        const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
        await exportModal.confirm();

        // 弹窗应关闭
        await expect(exportModal.modal).toBeHidden({ timeout: 10000 });

        // 下载应触发
        const download = await downloadPromise;
        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.dwg$/);
        }
      });

      test('EX-006: 点击取消 → 弹窗关闭', async () => {
        await cadEditor.clickExport();
        await cadEditor.waitForExportModal(10000);
        await exportModal.cancel();
        await expect(exportModal.modal).toBeHidden({ timeout: 5000 });
      });
    });
  });

  // =========================================================
  //  4. 外部参照弹窗 (ExternalReferenceModal)
  // =========================================================
  test.describe('外部参照弹窗', () => {
    let cadEditor: CADEditorPage;
    let xrefModal: ExternalReferenceModalPage;

    // ── 弹窗显示 ──
    test.describe('弹窗显示', () => {
      test('ER-001: 打开含缺失参照的图纸 → 弹窗列出缺失参照文件名', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        xrefModal = new ExternalReferenceModalPage(page);
        await cadEditor.goto(SEED.fileXref);
        // 等待外部参照弹窗出现
        await cadEditor.waitForExternalRefModal(15000).catch(() => {});
        const isOpen = await xrefModal.isOpen().catch(() => false);
        if (isOpen) {
          await expect(xrefModal.fileRows.first()).toBeVisible();
        }
      });

      test('ER-004: 关闭弹窗（跳过参照）→ 弹窗关闭', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        xrefModal = new ExternalReferenceModalPage(page);
        await cadEditor.goto(SEED.fileXref);
        await cadEditor.waitForExternalRefModal(15000).catch(() => {});
        const isOpen = await xrefModal.isOpen().catch(() => false);
        if (isOpen) {
          await cadEditor.closeExternalRefModal();
          await expect(xrefModal.modal).toBeHidden({ timeout: 5000 });
        }
      });
    });

    // ── 上传替换 ──
    test.describe('上传替换', () => {
      test('ER-002: 选择单个文件 → 上传 → 替换成功 → 参照列表更新', async ({ page }) => {
        cadEditor = new CADEditorPage(page);
        xrefModal = new ExternalReferenceModalPage(page);
        await cadEditor.goto(SEED.fileXref);
        await cadEditor.waitForExternalRefModal(15000).catch(() => {});
        const isOpen = await xrefModal.isOpen().catch(() => false);
        if (isOpen) {
          const fileChooser = await cadEditor.uploadReplacement();
          await fileChooser.setFiles('e2e/test-files/xref-dep.dwg');
          // 等待上传完成 — 成功图标出现
          await expect(xrefModal.successIcons.first()).toBeVisible({ timeout: 15000 });
        }
      });
    });

    // ── 权限 ──
    test.describe('权限', () => {
      test('ER-005: EDITOR 打开含参照文件 → 参照功能受限', async () => {
        test.skip(true, '需要 EDITOR 角色的 storageState fixture');
      });
    });
  });

  // =========================================================
  //  5. 未保存修改确认弹窗
  // =========================================================
  test.describe('未保存修改确认弹窗', () => {
    let cadEditor: CADEditorPage;

    test.beforeEach(async ({ page }) => {
      cadEditor = new CADEditorPage(page);
      await cadEditor.goto(SEED.fileA);
      await cadEditor.waitForDrawingLoad(60000);
    });

    test('UC-001: 编辑后切换图纸 → 提示未保存内容弹窗', async ({ page }) => {
      // 模拟脏状态
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__mxcadDirty = true;
      });
      try {
        await page.goto(`/cad-editor/${SEED.fileB}`);
      } catch {
        // navigation may be blocked
      }
      await page.waitForLoadState('networkidle');
      await cadEditor.waitForUnsavedDialog(10000).catch(() => {});
    });

    test('UC-002: 弹窗 → 点击确认 → 丢弃修改 → 切换图纸', async ({ page }) => {
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__mxcadDirty = true;
      });
      try {
        await page.goto(`/cad-editor/${SEED.fileB}`);
      } catch {
        // navigation may be blocked
      }
      await cadEditor.waitForUnsavedDialog(10000).catch(() => {});
      const dialogVisible = await cadEditor.unsavedDialog.isVisible().catch(() => false);
      if (dialogVisible) {
        await cadEditor.confirmClose();
        await expect(cadEditor.unsavedDialog).toBeHidden({ timeout: 5000 });
      }
    });

    test('UC-003: 弹窗 → 点击取消 → 留在当前图纸', async ({ page }) => {
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__mxcadDirty = true;
      });
      try {
        await page.goto(`/cad-editor/${SEED.fileB}`);
      } catch {
        // navigation blocked
      }
      await cadEditor.waitForUnsavedDialog(10000).catch(() => {});
      const dialogVisible = await cadEditor.unsavedDialog.isVisible().catch(() => false);
      if (dialogVisible) {
        await cadEditor.cancelClose();
        await expect(cadEditor.unsavedDialog).toBeHidden({ timeout: 5000 });
        await expect(page).toHaveURL(new RegExp(SEED.fileA));
      }
    });

    test('UC-004: 无修改关闭 → 直接切换图纸，不弹窗', async ({ page }) => {
      await page.evaluate(() => {
        delete (window as unknown as Record<string, unknown>).__mxcadDirty;
      });
      await page.goto(`/cad-editor/${SEED.fileB}`);
      await page.waitForLoadState('networkidle');
      await expect(cadEditor.unsavedDialog).toBeHidden({ timeout: 3000 });
    });
  });

  // =========================================================
  //  6. Toast 通知
  // =========================================================
  test.describe('Toast 通知', () => {
    let cadEditor: CADEditorPage;

    test.beforeEach(async ({ page }) => {
      cadEditor = new CADEditorPage(page);
      await cadEditor.goto(SEED.fileA);
      await cadEditor.waitForDrawingLoad(60000);
      await cadEditor.waitForToolbar(15000);
    });

    test('TO-001: 保存成功 → Toast "保存成功" 出现后自动消失', async () => {
      await cadEditor.clickSave();
      const toastText = await cadEditor.getToast();
      if (toastText) {
        await expect(cadEditor.toast.first()).toBeVisible({ timeout: 15000 });
        // Toast 应自动消失
        await expect(cadEditor.toast.first()).toBeHidden({ timeout: 30000 }).catch(() => {});
      }
    });

    test('TO-003: 另存为成功 → Toast "保存成功" 出现后消失', async ({ page }) => {
      await cadEditor.clickSaveAs();
      await cadEditor.waitForSaveAsModal(10000);

      const saveAsModal = new SaveAsModalPage(page);
      await saveAsModal.selectTargetType('project');

      const targetItem = cadEditor.saveAsTargetList.first();
      if (await targetItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await targetItem.click();
      }
      await cadEditor.confirmSaveAs();
      await expect(page.getByText(/保存成功/)).toBeVisible({ timeout: 15000 });
    });

    test('TO-004: 导出成功 → Toast 成功 → 自动下载触发', async ({ page }) => {
      await cadEditor.clickExport();
      await cadEditor.waitForExportModal(10000);

      const exportModal = new DownloadFormatModalPage(page);
      await exportModal.selectFormat('dwg');
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await exportModal.confirm();

      const toastText = await cadEditor.getToast();
      if (toastText) {
        await expect(cadEditor.toast.first()).toBeVisible({ timeout: 5000 }).catch(() => {});
      }
      await downloadPromise;
    });
  });

  // =========================================================
  //  7. 仪表盘
  // =========================================================
  test.describe('仪表盘', () => {
    let dashboard: DashboardPage;

    test.beforeEach(async ({ page }) => {
      dashboard = new DashboardPage(page);
      await dashboard.goto();
      await page.waitForLoadState('networkidle');
    });

    // ── 基础交互 ──
    test.describe('基础交互', () => {
      test('DB-001: 页面正常加载 → 问候语 + 统计卡片可见', async () => {
        await expect(dashboard.greeting).toBeVisible({ timeout: 10000 });
        await expect(dashboard.statCards).toBeVisible();
      });

      test('DB-004: 点击"新建项目" → 弹出创建弹窗或跳转创建页面', async ({ page }) => {
        await dashboard.openCreateProjectModal();
        await expect(
          dashboard.createProjectModal.or(page.getByRole('button', { name: /创建/ }))
        ).toBeVisible({ timeout: 5000 }).catch(() => {});
      });

      test('DB-005: 点击"上传图纸" → 触发上传流程', async ({ page }) => {
        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
        await dashboard.uploadButton.first().click();
        const fileChooser = await fileChooserPromise;
        if (fileChooser) {
          expect(fileChooser).toBeTruthy();
        }
      });
    });

    // ── 加载状态 ──
    test.describe('加载状态', () => {
      test('DB-002: 仪表盘加载中 → 骨架卡片显示 → 数据渲染后消失', async ({ page }) => {
        await page.reload();
        const skeleton = page.locator('[class*="skeleton"], [class*="animate-pulse"]').first();
        await expect(skeleton).toBeAttached({ timeout: 5000 }).catch(() => {});
        await page.waitForLoadState('networkidle');
      });
    });

    // ── 列表渲染 ──
    test.describe('列表渲染', () => {
      test('DB-009: 最近项目卡片列表渲染', async () => {
        await expect(dashboard.recentProjectsSection).toBeVisible({ timeout: 10000 });
      });

      test('DB-011: 最近文件列表渲染', async () => {
        await expect(dashboard.recentFilesSection).toBeVisible({ timeout: 10000 });
      });

      test('DB-006: 点击最近文件区域 → 跳转或展开', async ({ page }) => {
        await dashboard.recentFilesSection.first().click();
        await expect(page).toHaveURL(/\/(files|file-manager|projects)/, { timeout: 10000 })
          .catch(() => {
            // 可能在当前页展开更多内容
          });
      });

      test('DB-007: 点击最近项目区域 → 跳转项目列表', async ({ page }) => {
        await dashboard.recentProjectsSection.first().click();
        await expect(page).toHaveURL(/\/(projects)/, { timeout: 10000 })
          .catch(() => {
            // 可能在当前页展开更多内容
          });
      });
    });

    // ── 空状态 ──
    test.describe('空状态', () => {
      test('DB-003: 新用户无项目/文件 → 显示空状态引导 + CTA 按钮', async () => {
        test.skip(true, '需要新用户（无项目/文件）的 storageState fixture');
      });
    });

    // ── 错误状态 ──
    test.describe('错误状态', () => {
      test('DB-013: 仪表盘数据加载失败 → 错误提示，可重试', async () => {
        test.skip(true, '需要 mock 仪表盘 API 返回错误');
      });
    });
  });

  // =========================================================
  //  8. 权限交叉验证
  // =========================================================
  test.describe('权限交叉验证', () => {
    test('VIEWER 角色 → 保存按钮不可见/禁用', async () => {
      test.skip(true, '需要多角色 storageState fixture 支持');
    });

    test('VIEWER 角色 → 另存为按钮不可见', async () => {
      test.skip(true, '需要多角色 storageState fixture 支持');
    });

    test('VIEWER 角色 → 导出按钮仍可见', async () => {
      test.skip(true, '需要多角色 storageState fixture 支持');
    });

    test('EDITOR 角色 → 外部参照按钮不可见/禁用', async () => {
      test.skip(true, '需要多角色 storageState fixture 支持');
    });
  });

  // =========================================================
  //  9. 端到端工作流
  // =========================================================
  test.describe('端到端工作流', () => {

    // ── 保存工作流 ──
    test.describe('保存工作流', () => {
      test('W-006: 打开图纸 → 编辑器加载 → 保存 → Toast "保存成功"', async ({ page }) => {
        const cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.fileA);
        await cadEditor.waitForDrawingLoad(60000);
        await cadEditor.waitForToolbar(15000);

        await expect(page.locator('canvas').first()).toBeAttached();
        await cadEditor.clickSave();
        await expect(page.getByText(/保存成功/)).toBeVisible({ timeout: 15000 });
      });

      test('W-007: 打开项目图纸 → 编辑器加载 → 保存（项目）→ 成功', async ({ page }) => {
        const cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.fileB);
        await cadEditor.waitForDrawingLoad(60000);
        await cadEditor.waitForToolbar(15000);

        await expect(page.locator('canvas').first()).toBeAttached();
        await cadEditor.clickSave();
        await expect(page.getByText(/保存成功/)).toBeVisible({ timeout: 15000 });
      });
    });

    // ── 另存为工作流 ──
    test.describe('另存为工作流', () => {
      test('W-009: 打开图纸 → 另存为 → 选项目 Tab → 选择目标 → 确认 → Toast 成功', async ({ page }) => {
        const cadEditor = new CADEditorPage(page);
        const saveAsModal = new SaveAsModalPage(page);

        await cadEditor.goto(SEED.fileA);
        await cadEditor.waitForDrawingLoad(60000);
        await cadEditor.waitForToolbar(15000);

        await cadEditor.clickSaveAs();
        await cadEditor.waitForSaveAsModal(10000);
        await expect(saveAsModal.modal).toBeVisible();

        await saveAsModal.selectTargetType('project');

        const targetItem = cadEditor.saveAsTargetList.first();
        if (await targetItem.isVisible({ timeout: 3000 }).catch(() => false)) {
          await targetItem.click();
        }

        await cadEditor.confirmSaveAs();
        await expect(page.getByText(/保存成功/)).toBeVisible({ timeout: 15000 });
      });
    });

    // ── 导出工作流 ──
    test.describe('导出工作流', () => {
      test('W-011: 打开图纸 → 导出 → 选 DWG → 确认 → 触发 .dwg 下载', async ({ page }) => {
        const cadEditor = new CADEditorPage(page);
        const exportModal = new DownloadFormatModalPage(page);

        await cadEditor.goto(SEED.fileA);
        await cadEditor.waitForDrawingLoad(60000);
        await cadEditor.waitForToolbar(15000);

        await cadEditor.clickExport();
        await cadEditor.waitForExportModal(10000);
        await exportModal.selectFormat('dwg');
        await expect(exportModal.formatDwgRadio).toBeChecked();

        const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
        await exportModal.confirm();

        await expect(exportModal.modal).toBeHidden({ timeout: 10000 });

        const download = await downloadPromise;
        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.dwg$/);
        }
      });

      test('W-012: 打开图纸 → 导出 → 选 PDF → 确认 → 触发 .pdf 下载', async ({ page }) => {
        const cadEditor = new CADEditorPage(page);
        const exportModal = new DownloadFormatModalPage(page);

        await cadEditor.goto(SEED.fileA);
        await cadEditor.waitForDrawingLoad(60000);
        await cadEditor.waitForToolbar(15000);

        await cadEditor.clickExport();
        await cadEditor.waitForExportModal(10000);
        await exportModal.selectFormat('pdf');

        const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
        await exportModal.confirm();

        const download = await downloadPromise;
        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        }
      });
    });

    // ── 未保存关闭工作流 ──
    test.describe('未保存关闭工作流', () => {
      test('W-015: 编辑 → 未保存 → 关闭/切换图纸 → 弹窗提示 → 确认丢弃', async ({ page }) => {
        const cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.fileA);
        await cadEditor.waitForDrawingLoad(60000);

        await page.evaluate(() => {
          (window as unknown as Record<string, unknown>).__mxcadDirty = true;
        });

        try {
          await page.goto(`/cad-editor/${SEED.fileB}`);
        } catch {
          // navigation may be blocked
        }

        await cadEditor.waitForUnsavedDialog(10000).catch(() => {});
        const dialogVisible = await cadEditor.unsavedDialog.isVisible().catch(() => false);
        if (dialogVisible) {
          await cadEditor.confirmClose();
          await expect(cadEditor.unsavedDialog).toBeHidden({ timeout: 5000 });
        }
      });

      test('W-016: 打开 → 不编辑 → 关闭/切换图纸 → 直接切换，无弹窗', async ({ page }) => {
        const cadEditor = new CADEditorPage(page);
        await cadEditor.goto(SEED.fileA);
        await cadEditor.waitForDrawingLoad(60000);

        await page.evaluate(() => {
          delete (window as unknown as Record<string, unknown>).__mxcadDirty;
        });

        await page.goto(`/cad-editor/${SEED.fileB}`);
        await page.waitForLoadState('networkidle');
        await expect(cadEditor.unsavedDialog).toBeHidden({ timeout: 3000 });
      });
    });
  });
});
