/**
 * useCollabWorks — fetchWorks 以服务端结果为准（不做本地合并）
 *
 * 场景：创建/加入协同后 fetchWorks 拉取服务端 getWorks 结果并整体覆盖 works，
 * 不做本地合并兜底（退出当前协同只是离开会话，服务端 work 记录仍在）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useEffect } from 'react';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import { useCollabWorks } from './useCollabWorks';

function makeWork(workId: number, drawingName: string, realUserId = 'u1') {
  return {
    work_id: workId,
    work_data: JSON.stringify({
      v: 3,
      drawingId: '',
      projectId: null,
      drawingName,
      sourceType: 'local',
      creatorId: realUserId,
      creatorName: 'tester',
    }),
    real_user_id: realUserId,
    link_user_ids: [realUserId],
    link_user_data: [],
  };
}

const cooperateMock = vi.hoisted(() => ({
  getWorks: vi.fn(),
}));

vi.mock('../services/mxcadManager', () => ({
  getCooperate: vi.fn(() => cooperateMock),
  refreshFileName: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      fetchQuery: vi.fn(async () => []),
      getQueryData: vi.fn(() => null),
    }),
  };
});
vi.mock('@/api-sdk', () => ({
  nodeControllerGetNode: vi.fn(async () => ({ data: null })),
  projectControllerGetProjects: vi.fn(
    async () => ({ data: { nodes: [] } })
  ),
}));

function resetStore(): void {
  useCADEditorStore.setState({
    isActive: true,
    loading: false,
    error: null,
    currentFileId: null,
    currentFileName: null,
    currentProjectId: null,
    isPersonalSpaceMode: false,
    fromShare: false,
    fromCollabShare: false,
    targetCollabWorkId: null,
    collabShareLibraryKey: null,
    isInCollaboration: true,
    collaborationWorkId: 101,
    currentFileInfo: null,
    isDirty: false,
    isCurrentFileDeleted: false,
    isLeavingPage: false,
    navigateFunction: null,
    openedBackUrl: null,
    openedInitialFileId: null,
  });
}

let latestWorks: ReturnType<typeof makeWork>[] = [];

function Probe() {
  const { works, fetchWorks } = useCollabWorks(false, 'u1', true);
  latestWorks = works as ReturnType<typeof makeWork>[];

  useEffect(() => {
    // 触发一次 force 拉取，绕过轮询间隔
    fetchWorks(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span>{works.length}</span>;
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  latestWorks = [];
});

describe('useCollabWorks — fetchWorks 以服务端为准', () => {
  it('服务端返回多个协同时，列表展示全部（不进行本地合并）', async () => {
    cooperateMock.getWorks.mockImplementation(
      (cb: (list: unknown[]) => void) =>
        cb([makeWork(100, '图纸.dwg'), makeWork(101, '图纸.dwg')])
    );

    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestWorks.map((w) => w.work_id).sort()).toEqual([100, 101]);
  });

  it('服务端仅返回当前活跃协同时，列表以服务端结果为准（不做本地合并兜底）', async () => {
    cooperateMock.getWorks.mockImplementation(
      (cb: (list: unknown[]) => void) => cb([makeWork(101, '图纸.dwg')])
    );

    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestWorks.map((w) => w.work_id)).toEqual([101]);
  });
});
