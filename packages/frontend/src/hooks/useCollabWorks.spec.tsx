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
import { FILE_CONTEXT_NONE } from '../services/mxcadManager/mxcadTypes';
import { useCollabWorks } from './useCollabWorks';
import { refreshFileName } from '../services/mxcadManager';
import { nodeControllerGetNode, projectControllerGetProjects } from '@/api-sdk';

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
    fileContext: FILE_CONTEXT_NONE,
    isDirty: false,
    isCurrentFileDeleted: false,
    isLeavingPage: false,
    navigateFunction: null,
    openedBackUrl: null,
    openedInitialFileId: null,
  });
}

let latestWorks: ReturnType<typeof makeWork>[] = [];
let lastCurrentWorkId: number | null = null;

function Probe() {
  const { works, fetchWorks, currentWorkId } = useCollabWorks(
    false,
    { id: 'u1', username: 'tester' },
    true
  );
  lastCurrentWorkId = currentWorkId;
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
  lastCurrentWorkId = null;
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

  it('协同链接直达（currentFileInfo=null）：drawingId 反查到图纸名后合并进 FileContext 并刷新标题', async () => {
    // 回归：协同链接 auto-join 不经过 openSession，currentFileInfo=null 时
    // 名称同步曾被静默丢弃，标题停留在 "[协同中] - "。auto-join 经
    // patchSessionFlags({fileId}) 把 fileContext 置为 cloud 上下文后，
    // 名称反查经 patchSession 合并（唯一写入者），派生 currentFileName。
    vi.mocked(nodeControllerGetNode).mockResolvedValue({
      data: { name: '真实图纸.dwg' },
    } as never);
    useCADEditorStore.setState({
      fileContext: { kind: 'cloud', fileId: 'node-1', name: null },
      currentFileInfo: null,
      isInCollaboration: true,
    });
    cooperateMock.getWorks.mockImplementation((cb: (list: unknown[]) => void) =>
      cb([
        {
          work_id: 3,
          work_data: JSON.stringify({
            v: 1,
            drawingId: 'node-1',
            projectId: null,
          }),
          real_user_id: 'u1',
          link_user_ids: ['u1'],
          link_user_data: [],
        },
      ])
    );

    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // resolveNames（getNode）→ fileNameCache → 标题兜底 effect 为异步链路，
    // 再冲一次微任务队列确保 setFileNameCache 后的 effect 已执行
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useCADEditorStore.getState().currentFileName).toBe('真实图纸.dwg');
    expect(refreshFileName).toHaveBeenCalled();
  });

  it('回归：当前用户被遗漏时仍计入已加入会话的参与人数', async () => {
    useCADEditorStore.setState({ collaborationWorkId: 101, isInCollaboration: true });
    cooperateMock.getWorks.mockImplementation((cb: (list: unknown[]) => void) =>
      cb([
        {
          work_id: 101,
          work_data: JSON.stringify({
            v: 3,
            drawingId: '',
            projectId: null,
            drawingName: '图纸.dwg',
            sourceType: 'local',
            creatorId: 'other',
            creatorName: 'other',
          }),
          real_user_id: 'other',
          link_user_ids: [],
          link_user_data: [],
        },
      ])
    );

    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestWorks).toHaveLength(1);
    expect(latestWorks[0].link_user_ids).toEqual(['u1']);
    expect(latestWorks[0].link_user_data).toHaveLength(1);
  });

  it('回归：服务端只回 id 不回 data 时在线人数不被清零', async () => {
    useCADEditorStore.setState({ collaborationWorkId: 101, isInCollaboration: true });
    cooperateMock.getWorks.mockImplementation((cb: (list: unknown[]) => void) =>
      cb([makeWork(101, '图纸.dwg')])
    );

    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestWorks[0].link_user_ids).toEqual(['u1']);
  });

  it('回归：挂载时 currentWorkId 从 store 水合（侧边栏隐藏再打开不丢已加入态）', () => {
    // resetStore 已置 collaborationWorkId=101
    render(<Probe />);
    expect(lastCurrentWorkId).toBe(101);
  });
});

describe('useCollabWorks — 游客态（未登录）', () => {
  it('无 user 时不发协同请求：getProjects / getWorks / getNode 全部跳过', async () => {
    // 回归：游客态 CAD 编辑器曾启动 2s 轮询 get_wrok_list，控制台刷屏 401
    const GuestProbe = () => {
      const { fetchWorks } = useCollabWorks(false, null, true);
      useEffect(() => {
        fetchWorks(false, true);
      }, []);
      return null;
    };

    render(<GuestProbe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(projectControllerGetProjects).not.toHaveBeenCalled();
    expect(cooperateMock.getWorks).not.toHaveBeenCalled();
    expect(nodeControllerGetNode).not.toHaveBeenCalled();
  });
});
