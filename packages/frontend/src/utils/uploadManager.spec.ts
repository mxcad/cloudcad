import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UploadManager, type UploadTask } from './uploadManager';
import { uploadSingleFile } from './mxcadUploadUtils';

vi.mock('./mxcadUploadUtils', () => ({
  uploadSingleFile: vi.fn(),
}));

const HISTORY_KEY = 'cloudcad.upload.history';

function makeFile(name: string): File {
  return new File(['data'], name);
}

function mockUploadResult(file: File) {
  return {
    file,
    hash: 'hash-a',
    nodeId: 'node-a',
    name: file.name,
    size: file.size,
    type: 'image/x.dwg',
    isUseServerExistingFile: false,
    isSkipXrefCheck: false,
  };
}

/** 等待任务进入指定状态（executeTask 异步） */
async function waitForStatus(
  mgr: UploadManager,
  taskId: string,
  status: UploadTask['status']
): Promise<void> {
  await vi.waitFor(() => {
    expect(mgr.getTask(taskId)?.status).toBe(status);
  });
}

describe('UploadManager 上传历史', () => {
  beforeEach(() => {
    localStorage.removeItem(HISTORY_KEY);
    vi.mocked(uploadSingleFile).mockReset();
  });

  it('全部任务完成后保留在列表（不再自动清空，用户手动「清除已完成」）', async () => {
    const mgr = new UploadManager({ maxConcurrent: 1 });
    const file = makeFile('a.dwg');
    vi.mocked(uploadSingleFile).mockResolvedValue(mockUploadResult(file));
    mgr.addFiles([file], 'root');
    const [task] = mgr.getTasks();
    // 上传完成进入 processing（服务端转换中），finalizeTask 模拟转换完成
    await waitForStatus(mgr, task.id, 'processing');
    mgr.finalizeTask(task.id);

    // 队列空后 done 任务仍保留（历史可见），未自动 clearCompleted
    expect(mgr.getTasks()).toHaveLength(1);
    expect(mgr.getTask(task.id)?.status).toBe('done');
  });

  it('getTasks 按时间戳倒序：新上传排在历史记录之前（最新在前）', () => {
    const mgr = new UploadManager({ maxConcurrent: 1 });
    const internal = mgr as unknown as { tasks: Map<string, UploadTask> };
    const now = Date.now();
    // 先注入两条历史记录（模拟 localStorage 恢复，插入序在前）
    internal.tasks.set('hist-old', {
      id: 'hist-old',
      fileName: 'old.dwg',
      fileSize: 1,
      nodeId: 'root',
      progress: 100,
      status: 'done',
      updatedAt: now - 60_000,
    });
    internal.tasks.set('hist-newer', {
      id: 'hist-newer',
      fileName: 'newer.dwg',
      fileSize: 1,
      nodeId: 'root',
      progress: 100,
      status: 'done',
      updatedAt: now - 30_000,
    });
    // 再新增一条上传任务（时间戳最新，插入序在后）
    vi.mocked(uploadSingleFile).mockResolvedValue({
      file: makeFile('fresh.dwg'),
      hash: 'hash-fresh',
      nodeId: 'node-fresh',
      name: 'fresh.dwg',
      size: 1,
      type: 'image/x.dwg',
      isUseServerExistingFile: false,
      isSkipXrefCheck: false,
    });
    mgr.addFiles([makeFile('fresh.dwg')], 'root');

    expect(mgr.getTasks().map((t) => t.fileName)).toEqual([
      'fresh.dwg',
      'newer.dwg',
      'old.dwg',
    ]);
  });

  it('完成/失败任务持久化到 localStorage，新实例恢复为历史任务', async () => {
    const mgr = new UploadManager({ maxConcurrent: 1 });
    const okFile = makeFile('ok.dwg');
    const badFile = makeFile('bad.dwg');
    vi.mocked(uploadSingleFile)
      .mockResolvedValueOnce(mockUploadResult(okFile))
      .mockRejectedValueOnce(new Error('网络错误'));
    mgr.addFiles([okFile, badFile], 'root');
    // 按文件名取任务（getTasks 按时间戳倒序，位置不稳定）
    const okTask = mgr.getTasks().find((t) => t.fileName === 'ok.dwg')!;
    const badTask = mgr.getTasks().find((t) => t.fileName === 'bad.dwg')!;
    // ok 任务：上传完成（processing）后 finalize 为 done；bad 任务上传即失败
    await waitForStatus(mgr, okTask.id, 'processing');
    mgr.finalizeTask(okTask.id);
    await waitForStatus(mgr, badTask.id, 'failed');

    const raw = localStorage.getItem(HISTORY_KEY);
    expect(raw).toBeTruthy();
    const records = JSON.parse(raw!) as Array<{
      fileName: string;
      status: string;
    }>;
    expect(records).toHaveLength(2);
    const names = records.map((r) => r.fileName).sort();
    expect(names).toEqual(['bad.dwg', 'ok.dwg']);

    // 新实例（模拟刷新）恢复历史任务：无 File 对象、状态保留
    const restored = new UploadManager({ maxConcurrent: 1 });
    expect(restored.getTasks()).toHaveLength(2);
    const restoredOk = restored
      .getTasks()
      .find((t) => t.fileName === 'ok.dwg');
    expect(restoredOk?.status).toBe('done');
    expect(restoredOk?.progress).toBe(100);
    expect(restoredOk?.file).toBeUndefined();
  });

  it('恢复的历史任务（无 File 对象）不可重试', async () => {
    const mgr = new UploadManager({ maxConcurrent: 1 });
    const file = makeFile('bad.dwg');
    vi.mocked(uploadSingleFile).mockRejectedValue(new Error('网络错误'));
    mgr.addFiles([file], 'root');
    const [task] = mgr.getTasks();
    await waitForStatus(mgr, task.id, 'failed');

    // 新实例恢复后重试应无效果（无 File 对象）
    const restored = new UploadManager({ maxConcurrent: 1 });
    const restoredTask = restored.getTasks()[0];
    vi.mocked(uploadSingleFile).mockClear();
    restored.retryTask(restoredTask.id);
    expect(restored.getTask(restoredTask.id)?.status).toBe('failed');
    expect(uploadSingleFile).not.toHaveBeenCalled();
  });

  it('「清除已完成」同时清理内存与 localStorage 历史', async () => {
    const mgr = new UploadManager({ maxConcurrent: 1 });
    const file = makeFile('a.dwg');
    vi.mocked(uploadSingleFile).mockResolvedValue(mockUploadResult(file));
    mgr.addFiles([file], 'root');
    const [task] = mgr.getTasks();
    await waitForStatus(mgr, task.id, 'processing');
    mgr.finalizeTask(task.id);
    expect(localStorage.getItem(HISTORY_KEY)).toBeTruthy();

    mgr.clearCompleted();
    expect(mgr.getTasks()).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!)).toHaveLength(0);
  });

  it('移除（取消）done 任务后从历史中剔除', async () => {
    const mgr = new UploadManager({ maxConcurrent: 1 });
    const file = makeFile('a.dwg');
    vi.mocked(uploadSingleFile).mockResolvedValue(mockUploadResult(file));
    mgr.addFiles([file], 'root');
    const [task] = mgr.getTasks();
    await waitForStatus(mgr, task.id, 'processing');
    mgr.finalizeTask(task.id);

    mgr.removeTask(task.id);
    const records = JSON.parse(localStorage.getItem(HISTORY_KEY)!) as Array<{
      id: string;
    }>;
    expect(records.find((r) => r.id === task.id)).toBeUndefined();
  });

  it('历史上限 50 条：超出按 updatedAt 倒序保留最近 50 条', () => {
    const mgr = new UploadManager({ maxConcurrent: 1 });
    // 直接注入终态任务（绕过上传流程），验证持久化裁剪（私有成员仅测试可达）
    const internal = mgr as unknown as {
      tasks: Map<string, UploadTask>;
      persistHistory: () => void;
    };
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      internal.tasks.set(`hist_${i}`, {
        id: `hist_${i}`,
        fileName: `f${i}.dwg`,
        fileSize: 1,
        nodeId: 'root',
        progress: 100,
        status: 'done',
        updatedAt: now - (60 - i) * 1000,
      });
    }
    internal.persistHistory();
    const records = JSON.parse(
      localStorage.getItem(HISTORY_KEY)!
    ) as Array<{ id: string }>;
    expect(records).toHaveLength(50);
    // 保留最新的 50 条（hist_10..hist_59），最旧的 10 条（hist_0..hist_9）被裁掉
    const ids = new Set(records.map((r) => r.id));
    expect(ids.has('hist_0')).toBe(false);
    expect(ids.has('hist_9')).toBe(false);
    expect(ids.has('hist_10')).toBe(true);
    expect(ids.has('hist_59')).toBe(true);
  });
});
