///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import React, { type ReactNode } from 'react';
import { server } from '@/test/setup';
import LibraryManager from './index';

// ── hoisted mocks ──────────────────────────────────────────────
const notificationMock = vi.hoisted(() => ({
  showToast: vi.fn(),
  showConfirm: vi.fn().mockResolvedValue(true),
}));
const permissionMock = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
}));
const uploaderMock = vi.hoisted(() => ({
  lastProps: {} as { nodeId?: string | (() => string) },
}));
const openMock = vi.hoisted(() => vi.fn());
const triggerDownloadMock = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => notificationMock,
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => permissionMock,
}));
vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => undefined,
}));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => ({ isVip: true, tierLevel: 1 }),
}));
vi.mock('@/contexts/RuntimeConfigContext', () => ({
  useRuntimeConfig: () => ({
    config: {
      mailEnabled: false,
      requireEmailVerification: false,
      smsEnabled: false,
      requirePhoneVerification: false,
      supportEmail: '',
      supportPhone: '',
      allowRegister: true,
      systemNotice: '',
      wechatEnabled: false,
      wechatAutoRegister: false,
      maxFileSize: 100,
      collaborationEnabled: false,
      batchDownloadEnabled: false,
      freeExportDownloadEnabled: true,
    },
    loading: false,
  }),
}));
vi.mock('@/languages', () => ({
  t: (m: string, vars?: Record<string, string>) =>
    vars
      ? m.replace(/\{(\w+)\}/g, (_match: string, key: string) =>
          vars[key] !== undefined ? vars[key] : ''
        )
      : m,
}));
// 真实 triggerBlobDownload 会 a.click() 触发 happy-dom 导航到 blob URL，
// 导致 window.location 变为 blob:nodedata:... 污染后续测试（相对 URL 无法解析）。
// 与 useLibraryOperations.spec.ts 一致，mock 掉下载触发
vi.mock('@/utils/download', () => ({
  triggerBlobDownload: triggerDownloadMock,
}));
vi.mock('@/components/MxCadUploader', () => ({
  default: ({
    nodeId,
    onSuccess,
    buttonText,
  }: {
    nodeId?: string | (() => string);
    onSuccess?: () => void;
    buttonText?: string;
  }) => {
    uploaderMock.lastProps = { nodeId };
    const [progress, setProgress] = React.useState<number | null>(null);
    const handleUpload = () => {
      setProgress(10);
      setTimeout(() => {
        setProgress(100);
        setTimeout(() => {
          setProgress(null);
          onSuccess?.();
        }, 0);
      }, 10);
    };
    return (
      <div>
        <button data-testid="upload-trigger" onClick={handleUpload}>
          {buttonText || '上传 CAD 文件'}
        </button>
        {progress !== null && (
          <div data-testid="upload-progress" data-value={progress} />
        )}
      </div>
    );
  },
  MxCadUploaderRef: {},
}));
vi.mock('@/components/FileItem', () => ({
  FileItem: ({
    node,
    isSelected,
    onSelect,
    onOpen,
    onEnter,
    onDownload,
  }: {
    node: { id: string; name: string; nodeType: string; isFolder: boolean };
    isSelected?: boolean;
    onSelect?: (nodeId: string, ctrlKey?: boolean) => void;
    onOpen?: (node: unknown) => void;
    onEnter?: (node: unknown) => void;
    onDownload?: (node: unknown) => void;
  }) => (
    <div
      data-testid={`file-item-${node.id}`}
      data-node-id={node.id}
      data-node-type={node.nodeType}
      data-folder={String(node.isFolder)}
      data-selected={String(!!isSelected)}
      onClick={(e) => onSelect?.(node.id, e.ctrlKey || e.metaKey)}
    >
      <span data-testid="file-name">{node.name}</span>
      <button
        data-testid="open-btn"
        onClick={(e) => {
          e.stopPropagation();
          (onOpen ?? onEnter)?.(node);
        }}
      >
        open
      </button>
      <button
        data-testid="download-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDownload?.(node);
        }}
      >
        download
      </button>
    </div>
  ),
}));
vi.mock('@/components/common/EmptyContextMenu', () => ({
  EmptyContextMenu: ({
    pos,
    children,
  }: {
    pos: { x: number; y: number } | null;
    children: ReactNode;
  }) => (pos ? <div data-testid="context-menu">{children}</div> : null),
}));
vi.mock('@/components/ui/Menu', () => ({
  Menu: {
    Item: ({
      children,
      onClick,
    }: {
      children: ReactNode;
      onClick?: (e: unknown) => void;
    }) => (
      <div data-testid="menu-item" onClick={() => onClick?.({})}>
        {children}
      </div>
    ),
    Separator: () => null,
    Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    Content: ({ children }: { children: ReactNode }) => <>{children}</>,
    Submenu: ({
      label,
      children,
    }: {
      label: ReactNode;
      children: ReactNode;
    }) => (
      <div>
        {label}
        {children}
      </div>
    ),
    Group: ({ children }: { children: ReactNode }) => <>{children}</>,
    State: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
}));
vi.mock('@/components/modals/RenameModal', () => ({
  RenameModal: () => null,
}));
vi.mock('@/components/modals/LibrarySelectFolderModal', () => ({
  LibrarySelectFolderModal: () => null,
}));
vi.mock('@/components/modals/DownloadFormatModal', () => ({
  DownloadFormatModal: ({
    isOpen,
    fileName,
    onDownload,
  }: {
    isOpen?: boolean;
    fileName?: string;
    onDownload?: (format: string) => void;
  }) =>
    isOpen ? (
      <div data-testid="download-format-modal">
        <span data-testid="download-file-name">{fileName}</span>
        <button
          data-testid="download-confirm"
          onClick={() => onDownload?.('dwg')}
        >
          下载 DWG
        </button>
      </div>
    ) : null,
}));
vi.mock('@/components/modals/BatchDownloadDialog', () => ({
  BatchDownloadDialog: () => null,
}));
vi.mock('@/components/DirectoryImportDialog', () => ({
  DirectoryImportDialog: () => null,
}));

// ── fixtures ───────────────────────────────────────────────────
const LIBRARY_ID = 'lib-1';

function makeNode(overrides: Record<string, unknown>) {
  return {
    id: 'n1',
    name: 'a.dwg',
    nodeType: 'FILE',
    isFolder: false,
    isRoot: false,
    extension: '.dwg',
    ...overrides,
  };
}

function rootFixture() {
  return {
    nodes: [
      makeNode({ id: 'n1', name: 'a.dwg' }),
      makeNode({
        id: 'n2',
        name: 'floor-plan.dwg',
        nodeType: 'FILE',
        extension: '.dwg',
      }),
      makeNode({
        id: 'f1',
        name: '公共图集',
        nodeType: 'FOLDER',
        isFolder: true,
      }),
    ],
    total: 3,
    page: 1,
    limit: 50,
    totalPages: 1,
  };
}

function subFolderFixture() {
  return {
    nodes: [
      makeNode({ id: 'sub1', name: 'sub-plan.dwg', parentId: 'f1' }),
      makeNode({
        id: 'sub2',
        name: 'detail.dxf',
        nodeType: 'FILE',
        extension: '.dxf',
        parentId: 'f1',
      }),
    ],
    total: 2,
    page: 1,
    limit: 50,
    totalPages: 1,
  };
}

function blockFixture() {
  return {
    nodes: [
      makeNode({ id: 'b1', name: 'block-a.dwg' }),
      makeNode({ id: 'b2', name: 'block-b.dwg' }),
    ],
    total: 2,
    page: 1,
    limit: 50,
    totalPages: 1,
  };
}

// ── request trackers ───────────────────────────────────────────
const childrenRequests = vi.hoisted(() => vi.fn());
const searchRequests = vi.hoisted(() => vi.fn());
const deleteRequests = vi.hoisted(() => vi.fn());
const moveRequests = vi.hoisted(() => vi.fn());
const downloadRequests = vi.hoisted(() => vi.fn());

// ── MSW handlers（单前缀 /api/v1/...，覆盖 generated handler） ──
function installDefaultHandlers() {
  server.use(
    http.get('/api/v1/library/drawing', () =>
      HttpResponse.json({ id: LIBRARY_ID, name: '图纸库' })
    ),
    http.get('/api/v1/library/drawing/children/:nodeId', ({ params }) => {
      childrenRequests(params.nodeId);
      const nodeId = params.nodeId as string;
      return HttpResponse.json(
        nodeId === 'f1' ? subFolderFixture() : rootFixture()
      );
    }),
    http.get('/api/v1/library/drawing/all-files/:nodeId', ({ request }) => {
      searchRequests(request.url);
      const search = new URL(request.url).searchParams.get('search') || '';
      const filtered = rootFixture().nodes.filter((n) => n.name.includes(search));
      return HttpResponse.json({
        nodes: filtered,
        total: filtered.length,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
    }),
    http.get('/api/v1/library/drawing/nodes/:nodeId', ({ params }) =>
      HttpResponse.json(
        params.nodeId === 'f1'
          ? makeNode({
              id: 'f1',
              name: '公共图集',
              nodeType: 'FOLDER',
              isFolder: true,
              parentId: LIBRARY_ID,
            })
          : makeNode({ id: params.nodeId as string, parentId: LIBRARY_ID })
      )
    ),
    http.post(
      '/api/v1/library/drawing/nodes/batch-delete',
      async ({ request }) => {
        const body = (await request.json()) as { nodeIds?: string[] };
        deleteRequests(body);
        return HttpResponse.json({ successCount: 2, failedCount: 0 });
      }
    ),
    http.post(
      '/api/v1/library/drawing/nodes/:nodeId/move',
      async ({ request, params }) => {
        const body = (await request.json()) as { targetParentId?: string };
        moveRequests(params.nodeId, body.targetParentId);
        return HttpResponse.json({ id: params.nodeId, parentId: body.targetParentId });
      }
    ),
    http.post('/api/v1/library/drawing/folders', () =>
      HttpResponse.json(
        makeNode({
          id: 'f-new',
          name: '新文件夹',
          nodeType: 'FOLDER',
          isFolder: true,
          parentId: LIBRARY_ID,
        }),
        { status: 201 }
      )
    ),
    http.get(
      '/api/v1/file-system/nodes/:nodeId/download-with-format',
      ({ request }) => {
        downloadRequests(request.url);
        return new HttpResponse(new Blob(['dwg-content']), {
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      }
    ),
    http.get('/api/v1/library/block', () =>
      HttpResponse.json({ id: 'lib-block', name: '图块库' })
    ),
    http.get('/api/v1/library/block/children/:nodeId', () => {
      childrenRequests('block-root');
      return HttpResponse.json(blockFixture());
    })
  );
}

// ── render helper ──────────────────────────────────────────────
function renderPage(route = '/library/drawing') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/library/:libraryType" element={<LibraryManager />} />
          <Route
            path="/library/:libraryType/:nodeId"
            element={<LibraryManager />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function getFileItem(nodeId: string) {
  return screen.getByTestId(`file-item-${nodeId}`);
}

async function renderWithFiles() {
  renderPage();
  await screen.findByText('a.dwg');
  return { n1: getFileItem('n1'), n2: getFileItem('n2') };
}

function openItem(nodeId: string) {
  const item = getFileItem(nodeId);
  return item.querySelector('[data-testid="open-btn"]')!;
}

describe('LibraryManager — 图库目录浏览/列表渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(() => true);
    uploaderMock.lastProps = {};
    installDefaultHandlers();
  });

  it('渲染根目录文件列表（文件与文件夹卡片 + 面包屑根名称）', async () => {
    renderPage();

    expect(await screen.findByText('a.dwg')).toBeInTheDocument();
    expect(screen.getByText('floor-plan.dwg')).toBeInTheDocument();
    expect(screen.getByText('公共图集')).toBeInTheDocument();
    expect(getFileItem('f1').getAttribute('data-folder')).toBe('true');
    expect(screen.getAllByText('图纸库').length).toBeGreaterThan(0);
    expect(childrenRequests).toHaveBeenCalledWith(LIBRARY_ID);
  });

  it('双击文件夹进入子目录：请求子节点并切换列表内容', async () => {
    await renderWithFiles();

    fireEvent.click(openItem('f1'));

    expect(await screen.findByText('sub-plan.dwg')).toBeInTheDocument();
    expect(screen.getByText('detail.dxf')).toBeInTheDocument();
    expect(screen.queryByText('a.dwg')).not.toBeInTheDocument();
    expect(childrenRequests).toHaveBeenCalledWith('f1');
  });

  it('图块库路由（/library/block）渲染 block 库内容', async () => {
    renderPage('/library/block');

    expect(await screen.findByText('block-a.dwg')).toBeInTheDocument();
    expect(screen.getByText('block-b.dwg')).toBeInTheDocument();
    expect(screen.getAllByText('图块库').length).toBeGreaterThan(0);
  });
});

describe('LibraryManager — 搜索', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(() => true);
    installDefaultHandlers();
  });

  it('输入关键词后防抖请求 all-files 并渲染过滤结果', async () => {
    renderPage();
    await screen.findByText('a.dwg');

    fireEvent.change(screen.getByPlaceholderText('搜索文件或项目...'), {
      target: { value: 'floor' },
    });

    await waitFor(() => {
      expect(searchRequests).toHaveBeenCalled();
      expect(searchRequests.mock.calls[0][0]).toContain('search=floor');
    });
    await waitFor(() => {
      expect(screen.getByText('floor-plan.dwg')).toBeInTheDocument();
    });
    expect(screen.queryByText('a.dwg')).not.toBeInTheDocument();
  });

  it('搜索无匹配结果时展示空状态', async () => {
    renderPage();
    await screen.findByText('a.dwg');

    fireEvent.change(screen.getByPlaceholderText('搜索文件或项目...'), {
      target: { value: 'zzz-no-match' },
    });

    expect(await screen.findByText('文件夹是空的')).toBeInTheDocument();
  });
});

describe('LibraryManager — 引用图纸到项目（打开到 CAD 编辑器）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(() => true);
    Object.defineProperty(window, 'open', {
      value: openMock,
      writable: true,
      configurable: true,
    });
    installDefaultHandlers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('双击文件卡片：在新标签打开 CAD 编辑器并提示成功', async () => {
    await renderWithFiles();

    fireEvent.click(openItem('n1'));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        '/cad-editor/n1?library=drawing&back=' +
          encodeURIComponent(window.location.pathname + window.location.search),
        '_blank'
      );
    });
    expect(notificationMock.showToast).toHaveBeenCalledWith(
      '正在打开：a.dwg',
      'success'
    );
  });

  it('窗口打开失败时提示错误 toast', async () => {
    openMock.mockImplementation(() => {
      throw new Error('popup blocked');
    });
    await renderWithFiles();

    fireEvent.click(openItem('n1'));

    await waitFor(() => {
      expect(notificationMock.showToast).toHaveBeenCalledWith(
        'popup blocked',
        'error'
      );
    });
  });
});

describe('LibraryManager — 上传图纸入库', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(() => true);
    uploaderMock.lastProps = {};
    installDefaultHandlers();
  });

  it('管理员渲染上传器且入库目标为当前库根节点，上传显示进度并在成功后 toast + 刷新列表', async () => {
    renderPage();
    await screen.findByText('a.dwg');

    await waitFor(() => {
      const nodeId = uploaderMock.lastProps.nodeId;
      expect(typeof nodeId === 'function' ? nodeId() : nodeId).toBe(LIBRARY_ID);
    });

    fireEvent.click(screen.getByTestId('upload-trigger'));

    const progress = await screen.findByTestId('upload-progress');
    expect(progress.getAttribute('data-value')).toBe('10');

    await waitFor(() => {
      expect(notificationMock.showToast).toHaveBeenCalledWith(
        '文件上传成功',
        'success'
      );
    });
    await waitFor(() => {
      expect(childrenRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('非管理员不渲染上传入口、批量导入与新建文件夹按钮', async () => {
    permissionMock.hasPermission.mockImplementation(() => false);
    renderPage();
    await screen.findByText('a.dwg');

    expect(screen.queryByTestId('upload-trigger')).not.toBeInTheDocument();
    expect(screen.queryByText('批量导入')).not.toBeInTheDocument();
    expect(document.querySelector('[data-tour="create-folder-btn"]')).toBeNull();
  });
});

describe('LibraryManager — 空状态/加载状态/错误状态', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(() => true);
    installDefaultHandlers();
  });

  it('子节点请求挂起时展示加载中，完成后渲染列表', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/v1/library/drawing/children/:nodeId', async () => {
        await gate;
        return HttpResponse.json(rootFixture());
      })
    );

    renderPage();

    expect(await screen.findByText('加载中...')).toBeInTheDocument();
    release();
    expect(await screen.findByText('a.dwg')).toBeInTheDocument();
  });

  it('空目录展示空状态（管理员：上传提示 + 创建文件夹按钮）', async () => {
    server.use(
      http.get('/api/v1/library/drawing/children/:nodeId', () =>
        HttpResponse.json({
          nodes: [],
          total: 0,
          page: 1,
          limit: 50,
          totalPages: 1,
        })
      )
    );

    renderPage();

    expect(await screen.findByText('文件夹是空的')).toBeInTheDocument();
    expect(
      screen.getByText('上传文件或创建文件夹开始使用')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '创建文件夹' })
    ).toBeInTheDocument();
  });

  it('接口报错展示错误状态，点击重试后恢复列表', async () => {
    let fail = true;
    server.use(
      http.get('/api/v1/library/drawing/children/:nodeId', () => {
        if (fail) {
          return HttpResponse.json({ message: '服务器错误' }, { status: 500 });
        }
        return HttpResponse.json(rootFixture());
      })
    );

    renderPage();

    // childrenQuery 配置了 retry: 1（重试延迟 ~1s），错误态出现较慢，放宽等待
    expect(
      await screen.findByRole('button', { name: '重试' }, { timeout: 5000 })
    ).toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByText('a.dwg')).toBeInTheDocument();
  });
});

describe('LibraryManager — 与 useLibraryOperations 的组合行为', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMock.hasPermission.mockImplementation(() => true);
    installDefaultHandlers();
  });

  it('批量删除：确认 → 调用 batch-delete → 成功 toast → 刷新列表并清空选择', async () => {
    const { n1, n2 } = await renderWithFiles();

    fireEvent.click(n1);
    fireEvent.click(n2, { ctrlKey: true });
    expect(screen.getByText('已选 2 项')).toBeInTheDocument();

    fireEvent.contextMenu(n1);

    fireEvent.click(screen.getByText('删除 2 个选中项'));

    await waitFor(() => {
      expect(notificationMock.showConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '确认删除',
          message: '确定要永久删除这 2 个项目吗？删除后无法恢复。',
        })
      );
    });
    await waitFor(() => {
      expect(deleteRequests).toHaveBeenCalledWith(
        expect.objectContaining({ nodeIds: ['n1', 'n2'] })
      );
    });
    await waitFor(() => {
      expect(notificationMock.showToast).toHaveBeenCalledWith(
        '成功删除 2 个项目',
        'success'
      );
    });
    await waitFor(() => {
      expect(childrenRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryByText('已选 2 项')).not.toBeInTheDocument();
  });

  it('批量删除部分失败：warning toast 且仍刷新', async () => {
    server.use(
      http.post('/api/v1/library/drawing/nodes/batch-delete', () =>
        HttpResponse.json({ successCount: 1, failedCount: 1 })
      )
    );
    const { n1, n2 } = await renderWithFiles();

    fireEvent.click(n1);
    fireEvent.click(n2, { ctrlKey: true });
    fireEvent.contextMenu(n1);
    fireEvent.click(screen.getByText('删除 2 个选中项'));

    await waitFor(() => {
      expect(notificationMock.showToast).toHaveBeenCalledWith(
        '成功删除 1 项，1 项失败',
        'warning'
      );
    });
  });

  it('批量删除接口错误：error toast，列表不刷新', async () => {
    server.use(
      http.post('/api/v1/library/drawing/nodes/batch-delete', () =>
        HttpResponse.json({ message: '批量删除失败' }, { status: 500 })
      )
    );
    const { n1, n2 } = await renderWithFiles();
    childrenRequests.mockClear();

    fireEvent.click(n1);
    fireEvent.click(n2, { ctrlKey: true });
    fireEvent.contextMenu(n1);
    fireEvent.click(screen.getByText('删除 2 个选中项'));

    await waitFor(() => {
      expect(notificationMock.showToast).toHaveBeenCalledWith(
        expect.any(String),
        'error'
      );
    });
    expect(childrenRequests).not.toHaveBeenCalled();
  });

  it('剪切后撤销：把节点移回源文件夹（回归：clearClipboard 清空 sourceParentIds 导致撤销空转）', async () => {
    renderPage('/library/drawing/f1');
    await screen.findByText('sub-plan.dwg');
    moveRequests.mockClear();

    // 在子文件夹 f1 中选中 sub1 并剪切（源父目录 = f1）
    fireEvent.click(getFileItem('sub1'));
    expect(screen.getByText('已选 1 项')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /剪切/ }));

    // 通过面包屑返回根目录
    fireEvent.click(screen.getByRole('button', { name: '图纸库' }));
    await screen.findByText('a.dwg');

    // 粘贴到根目录 → move(sub1, lib-1)
    fireEvent.click(screen.getByRole('button', { name: /粘贴/ }));
    await waitFor(() => {
      expect(moveRequests).toHaveBeenCalledWith('sub1', LIBRARY_ID);
    });

    // 撤销 → 应再次调用 move(sub1, f1) 把节点移回源文件夹
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => {
      expect(moveRequests).toHaveBeenCalledWith('sub1', 'f1');
    });
    await waitFor(() => {
      expect(notificationMock.showToast).toHaveBeenCalledWith(
        expect.stringContaining('已撤销'),
        'info'
      );
    });
  });

  it('剪切粘贴后再永久删除：undo 栈中引用被删节点的动作被清理，撤销按钮恢复禁用（公共库删除不可撤销）', async () => {
    renderPage('/library/drawing/f1');
    await screen.findByText('sub-plan.dwg');
    moveRequests.mockClear();

    // 在子文件夹 f1 中选中 sub1 并剪切
    fireEvent.click(getFileItem('sub1'));
    fireEvent.click(screen.getByRole('button', { name: /剪切/ }));

    // 返回根目录粘贴 → move(sub1, lib-1) 入栈
    fireEvent.click(screen.getByRole('button', { name: '图纸库' }));
    await screen.findByText('a.dwg');
    fireEvent.click(screen.getByRole('button', { name: /粘贴/ }));
    await waitFor(() => {
      expect(moveRequests).toHaveBeenCalledWith('sub1', LIBRARY_ID);
    });

    // 此时 undo 可用（栈中有 move action）
    expect(screen.getByRole('button', { name: '撤销' })).not.toBeDisabled();

    // 进入 f1，多选 sub1+sub2 永久删除（菜单走批量删除路径）
    fireEvent.click(openItem('f1'));
    await screen.findByText('sub-plan.dwg');
    deleteRequests.mockClear();
    fireEvent.click(getFileItem('sub1'));
    fireEvent.click(getFileItem('sub2'), { ctrlKey: true });
    fireEvent.contextMenu(getFileItem('sub1'));
    fireEvent.click(screen.getByText('删除 2 个选中项'));
    await waitFor(() => {
      expect(deleteRequests).toHaveBeenCalledWith(
        expect.objectContaining({ nodeIds: ['sub1', 'sub2'] })
      );
    });

    // 永久删除后：undo 栈中引用 sub1/sub2 的 move action 已被清理 → 撤销按钮禁用
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    });
  });

  it('下载：文件卡片下载按钮 → 格式弹窗 → 下载 dwg → 成功 toast', async () => {
    await renderWithFiles();

    fireEvent.click(
      getFileItem('n1').querySelector('[data-testid="download-btn"]')!
    );

    expect(await screen.findByTestId('download-format-modal')).toBeInTheDocument();
    expect(screen.getByTestId('download-file-name').textContent).toBe('a.dwg');

    fireEvent.click(screen.getByTestId('download-confirm'));

    await waitFor(() => {
      expect(downloadRequests).toHaveBeenCalled();
      expect(downloadRequests.mock.calls[0][0]).toContain('format=dwg');
    });
    await waitFor(() => {
      expect(triggerDownloadMock).toHaveBeenCalledWith(
        expect.any(Blob),
        'a.dwg'
      );
    });
    await waitFor(() => {
      expect(notificationMock.showToast).toHaveBeenCalledWith(
        '已下载：a.dwg',
        'success'
      );
    });
  });

  it('新建文件夹：提交表单 → 创建接口 → 成功 toast + 刷新列表', async () => {
    renderPage();
    await screen.findByText('a.dwg');
    childrenRequests.mockClear();

    // 新建文件夹按钮为图标按钮（data-tour 定位），可访问名来自 Tooltip
    fireEvent.click(document.querySelector('[data-tour="create-folder-btn"]')!);

    const input = await screen.findByPlaceholderText('请输入文件夹名称');
    fireEvent.change(input, { target: { value: '新文件夹' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(notificationMock.showToast).toHaveBeenCalledWith(
        '文件夹创建成功',
        'success'
      );
    });
    await waitFor(() => {
      expect(childrenRequests).toHaveBeenCalled();
    });
  });
});
