import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * backgroundRender —— 分享图片后台渲染的契约测试
 *
 * 锁定「预览分享图片不再因后台开图触发登录」的回归（对齐 PC 编辑器上下文）：
 * - 目标文件已是当前打开图纸（state.fileId === nodeId）：**不再 openDrawing**——
 *   后台开图走 openDrawing → loadByNodeId → fetchFileNode → nodeControllerGetNode
 *   需登录/权限，正是「预览分享图片需要登录」的根因；文件已打开时直接出 BMP。
 * - 目标文件未打开：保留 openDrawing（分享管理页非当前图纸的兜底路径）。
 * - 安全约束（isModified / isInCollaboration）：抛错且不发起 openDrawing。
 */

const { openDrawing } = vi.hoisted(() => ({
  openDrawing: vi.fn(),
}));

const { generateThumbnail, generatePosterImageBlob, uploadThumbnailBlobForNode, detectRegionBorder } =
  vi.hoisted(() => ({
    generateThumbnail: vi.fn(),
    generatePosterImageBlob: vi.fn(),
    uploadThumbnailBlobForNode: vi.fn(),
    detectRegionBorder: vi.fn(),
  }));

vi.mock('./drawingOpener', () => ({ openDrawing }));
vi.mock('./thumbnailService', () => ({
  generateThumbnail,
  generatePosterImageBlob,
  uploadThumbnailBlobForNode,
  detectRegionBorder,
}));
vi.mock('@/languages', () => ({ t: (key: string) => key }));

import { renderSharePosterInBackground, renderShareThumbnailInBackground } from './backgroundRender';
import { useEditorStore } from '@/stores/editor';

const posterBlob = new Blob(['bmp'], { type: 'image/bmp' });
const thumbBlob = new Blob(['png'], { type: 'image/png' });

function setEditor(fileId: string | null, overrides: Record<string, unknown> = {}) {
  const s = useEditorStore();
  s.reset();
  s.setFileId(fileId);
  s.setIsModified((overrides.isModified as boolean) ?? false);
  s.setCollaborationState({
    isInCollaboration: (overrides.isInCollaboration as boolean) ?? false,
    workId: null,
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  generatePosterImageBlob.mockResolvedValue(posterBlob);
  generateThumbnail.mockResolvedValue(thumbBlob);
  uploadThumbnailBlobForNode.mockResolvedValue(undefined);
  detectRegionBorder.mockResolvedValue(true);
  openDrawing.mockResolvedValue(true);
});

describe('renderSharePosterInBackground — 已打开文件不再后台开图（登录门槛回归）', () => {
  it('目标文件 = 当前打开图纸（fileId === nodeId）→ 不调 openDrawing，直接出 BMP', async () => {
    setEditor('file-1');

    const result = await renderSharePosterInBackground('file-1');

    expect(openDrawing).not.toHaveBeenCalled();
    expect(generatePosterImageBlob).toHaveBeenCalledTimes(1);
    // 未传 region（默认整图框）→ 天然不描边，恒 hasBorder=true（不走算法）
    expect(detectRegionBorder).not.toHaveBeenCalled();
    expect(result).toEqual({ posterBlob, hasBorder: true });
  });

  it('已打开 + 有 region → detectRegionBorder 用该 region，海报出图传 region', async () => {
    setEditor('file-1');
    const region = { x: 1, y: 2, w: 3, h: 4 } as never;

    await renderSharePosterInBackground('file-1', region);

    expect(openDrawing).not.toHaveBeenCalled();
    expect(detectRegionBorder).toHaveBeenCalledWith(region);
    expect(generatePosterImageBlob).toHaveBeenCalledWith(region);
  });

  it('已打开 → 缩略图（200px）生成与上传 best-effort 分离，不阻塞海报', async () => {
    setEditor('file-1');

    await renderSharePosterInBackground('file-1');

    expect(generateThumbnail).toHaveBeenCalledTimes(1);
    expect(uploadThumbnailBlobForNode).toHaveBeenCalledWith('file-1', thumbBlob);
  });

  it('目标文件未打开 → 保留 openDrawing（分享管理页非当前图纸兜底路径）', async () => {
    setEditor('file-other');

    const result = await renderSharePosterInBackground('file-1');

    expect(openDrawing).toHaveBeenCalledWith({ source: 'node', nodeId: 'file-1' });
    // 未传 region（默认整图框）→ 天然不描边，恒 hasBorder=true（不走算法）
    expect(detectRegionBorder).not.toHaveBeenCalled();
    expect(result).toEqual({ posterBlob, hasBorder: true });
  });

  it('isModified → 抛错且不发起 openDrawing（防静默替换引擎文档）', async () => {
    setEditor('file-1', { isModified: true });

    await expect(renderSharePosterInBackground('file-1')).rejects.toThrow(
      '当前图纸有未保存的修改，请先保存后再生成分享图片'
    );
    expect(openDrawing).not.toHaveBeenCalled();
    expect(generatePosterImageBlob).not.toHaveBeenCalled();
  });

  it('isInCollaboration → 抛错且不发起 openDrawing', async () => {
    setEditor('file-1', { isInCollaboration: true });

    await expect(renderSharePosterInBackground('file-1')).rejects.toThrow(
      '协同编辑进行中，暂不能生成分享图片'
    );
    expect(openDrawing).not.toHaveBeenCalled();
  });

  it('未打开 + openDrawing 返回 false → 返回 null（调用方回退后端缩略图）', async () => {
    setEditor('file-other');
    openDrawing.mockResolvedValue(false);

    const result = await renderSharePosterInBackground('file-1');

    expect(result).toBeNull();
    expect(generatePosterImageBlob).not.toHaveBeenCalled();
  });

  it('出图失败（posterBlob null）→ 返回 null（不误报成功）', async () => {
    setEditor('file-1');
    generatePosterImageBlob.mockResolvedValue(null);

    const result = await renderSharePosterInBackground('file-1');

    expect(result).toBeNull();
  });
});

describe('renderShareThumbnailInBackground — 200px 缩略图兜底（非当前图纸路径）', () => {
  it('文件未打开 → openDrawing + 出缩略图并上传', async () => {
    setEditor('file-other');

    const blob = await renderShareThumbnailInBackground('file-1');

    expect(openDrawing).toHaveBeenCalledWith({ source: 'node', nodeId: 'file-1' });
    expect(blob).toBe(thumbBlob);
    expect(uploadThumbnailBlobForNode).toHaveBeenCalledWith('file-1', thumbBlob);
  });

  it('isModified → 抛错且不发起 openDrawing', async () => {
    setEditor('file-1', { isModified: true });

    await expect(renderShareThumbnailInBackground('file-1')).rejects.toThrow(
      '当前图纸有未保存的修改，请先保存后再生成分享图片'
    );
    expect(openDrawing).not.toHaveBeenCalled();
  });
});
