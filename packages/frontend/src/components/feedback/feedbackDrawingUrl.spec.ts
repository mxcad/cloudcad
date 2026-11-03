import { describe, expect, it } from 'vitest';
import { buildDrawingEditorUrl } from './feedbackDrawingUrl';
import type { FeedbackAttachmentDto } from '@/api-sdk';

function baseAtt(over: Partial<FeedbackAttachmentDto>): FeedbackAttachmentDto {
  return {
    id: 'att-1',
    feedbackId: 'fb-1',
    type: 'DRAWING',
    kind: 'REFERENCE',
    fileName: 'a.dwg',
    mimeType: 'application/acad',
    size: 1024,
    nodeId: 'node-1',
    fileHash: null,
    region: null,
    thumbnailUrl: null,
    viewUrl: null,
    downloadUrl: null,
    uploadedByName: null,
    createdAt: '2026-11-02T00:00:00Z',
    ...over,
  };
}

describe('buildDrawingEditorUrl（反馈图纸查看 → 打开编辑器定位区域）', () => {
  it('REFERENCE + nodeId → /cad-editor?nodeId=..', () => {
    expect(buildDrawingEditorUrl(baseAtt({ nodeId: 'node-1' }))).toBe(
      '/cad-editor?nodeId=node-1'
    );
  });

  it('REFERENCE + nodeId + region → ?nodeId=..&region=x1,y1,x2,y2', () => {
    expect(
      buildDrawingEditorUrl(baseAtt({ nodeId: 'node-1', region: '100,200,300,400' }))
    ).toBe('/cad-editor?nodeId=node-1&region=100%2C200%2C300%2C400');
  });

  it('REFERENCE 无 nodeId（fileHash）→ ?hash=..&region=..', () => {
    expect(
      buildDrawingEditorUrl(baseAtt({ nodeId: null, fileHash: 'h-1', region: '1,2,3,4' }))
    ).toBe('/cad-editor?hash=h-1&region=1%2C2%2C3%2C4');
  });

  it('非 REFERENCE（FILE 副本，无源节点）→ null', () => {
    expect(buildDrawingEditorUrl(baseAtt({ kind: 'FILE', nodeId: null, fileHash: null }))).toBeNull();
  });

  it('非 DRAWING（图片）→ null', () => {
    expect(buildDrawingEditorUrl(baseAtt({ type: 'IMAGE', kind: 'FILE' }))).toBeNull();
  });

  it('REFERENCE 但无 nodeId 且无 fileHash（异常态）→ null', () => {
    expect(buildDrawingEditorUrl(baseAtt({ nodeId: null, fileHash: null }))).toBeNull();
  });
});
