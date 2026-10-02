///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { UploadGhostService } from './upload-ghost.service';
import { NodeTrashService } from '../../file-operations/node-trash.service';

describe('UploadGhostService（上传幽灵节点处置单一出口）', () => {
  let service: UploadGhostService;
  let mockNodeTrashService: { deleteNode: jest.Mock };

  beforeEach(async () => {
    mockNodeTrashService = { deleteNode: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadGhostService,
        { provide: NodeTrashService, useValue: mockNodeTrashService },
      ],
    }).compile();
    service = module.get<UploadGhostService>(UploadGhostService);
  });

  describe('isGhost', () => {
    it('path=null 是上传幽灵', () => {
      expect(service.isGhost({ path: null })).toBe(true);
    });

    it('path 已就位不是幽灵（真实文件）', () => {
      expect(service.isGhost({ path: '202601/node-1/file.mxweb' })).toBe(false);
    });
  });

  describe('purgeGhostNode', () => {
    it('走 deleteNode(id, true) 彻底删除（非回收站、跳过用户审计）并返回 true', async () => {
      const result = await service.purgeGhostNode('node-1');

      expect(result).toBe(true);
      expect(mockNodeTrashService.deleteNode).toHaveBeenCalledTimes(1);
      expect(mockNodeTrashService.deleteNode).toHaveBeenCalledWith(
        'node-1',
        true
      );
    });

    it('删除失败不抛出（节点可能已被并发删除），返回 false', async () => {
      mockNodeTrashService.deleteNode.mockRejectedValueOnce(
        new Error('already deleted')
      );

      const result = await service.purgeGhostNode('node-1');

      expect(result).toBe(false);
    });
  });
});
