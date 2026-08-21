import { test as authTest, expect } from './auth.fixture';
import type { Page } from '@playwright/test';
import { FileSystemPage } from '../pages/FileSystemPage';

/**
 * 项目域 E2E Fixture
 *
 * 扩展 auth fixture，提供项目级别的测试辅助：
 * - testProject: 通过 API 创建测试项目，测试结束后自动清理
 * - testFile: 向测试项目上传一个 DWG 文件（预留接口）
 * - fileSystemPage: 已绑定项目上下文的 FileSystemPage 实例
 */

const API_BASE = process.env.BACKEND_URL || 'http://localhost:3001';

interface ProjectData {
  id: string;
  name: string;
}

interface TestFile {
  nodeId: string;
  name: string;
}

export interface ProjectFixtures {
  testProject: ProjectData;
  testFile: TestFile;
  fileSystemPage: FileSystemPage;
}

/**
 * 生成唯一项目名称，避免并发测试冲突
 */
function uniqueProjectName(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `e2e-project-${ts}-${rand}`;
}

/**
 * 通过后端 API 创建项目，返回项目数据
 */
async function createProjectViaApi(
  page: Page,
  name: string,
  description?: string,
): Promise<ProjectData> {
  const body: Record<string, string> = { name };
  if (description) {
    body.description = description;
  }

  const response = await page.request.post(`${API_BASE}/api/v1/file-system/projects`, {
    data: body,
  });

  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to create test project "${name}": ${response.status()} ${errorBody}`,
    );
  }

  const json = await response.json();
  return { id: json.id, name: json.name };
}

/**
 * 通过后端 API 删除项目
 */
async function deleteProjectViaApi(
  page: Page,
  projectId: string,
): Promise<void> {
  const response = await page.request.delete(
    `${API_BASE}/api/v1/file-system/projects/${projectId}?permanently=true`,
  );

  if (!response.ok()) {
    const errorBody = await response.text();
    console.warn(
      `[project.fixture] Cleanup warning: failed to delete project ${projectId}: ${response.status()} ${errorBody}`,
    );
  }
}

export const test = authTest.extend<ProjectFixtures>({
  /**
   * testProject — 通过 API 创建测试项目，测试结束后自动清理
   */
  testProject: async ({ page }, use) => {
    const projectName = uniqueProjectName();
    const project = await createProjectViaApi(page, projectName);

    await use(project);

    // Cleanup: 删除项目（错误只记录日志，不让清理失败阻断测试结果）
    await deleteProjectViaApi(page, project.id).catch((err: unknown) => {
      console.warn(
        `[project.fixture] Cleanup error for project ${project.id}:`,
        err instanceof Error ? err.message : err,
      );
    });
  },

  /**
   * testFile — 向 testProject 上传测试 DWG 文件
   *
   * 当前为预留接口，返回占位数据。后续实现文件上传 API 调用。
   */
  testFile: async ({ testProject }, use) => {
    const placeholder: TestFile = {
      nodeId: '',
      name: 'test.dwg',
    };

    await use(placeholder);

    // Cleanup: 删除上传的文件（预留）
  },

  /**
   * fileSystemPage — 已绑定 testProject 上下文的 FileSystemPage
   */
  fileSystemPage: async ({ page, testProject }, use) => {
    const fsp = new FileSystemPage(page);
    await use(fsp);
  },
});

export { expect };
