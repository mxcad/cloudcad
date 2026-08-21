import { Test, type TestingModule } from '@nestjs/testing';
import { NodeType } from '@cloudcad/db';
import { NodeUpdateService } from './file-operations.service';
import { DatabaseService } from '../database/database.service';
import { NodeNameService } from './node-name.service';
import { NodeMutationGuard } from './node-mutation.guard';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * NodeUpdateService 重命名审计（NODE_RENAME）：
 * - 仅名称实际变化时记（只改描述不记）
 * - 仅项目内节点记录（logProjectNodeAction 内部判断 projectId）
 * - 无操作者（匿名）不记，避免落假 actor 记录
 */
describe('NodeUpdateService（重命名审计）', () => {
  let service: NodeUpdateService;

  const mockPrisma = {
    fileSystemNode: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockNodeNameService = {
    checkNameUniqueness: jest.fn().mockResolvedValue(undefined),
  };

  const mockNodeMutationGuard = {
    assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
    logProjectNodeAction: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeUpdateService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: NodeNameService, useValue: mockNodeNameService },
        { provide: NodeMutationGuard, useValue: mockNodeMutationGuard },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();
    service = module.get(NodeUpdateService);

    mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
      id: 'node-1',
      name: '旧名字.dwg',
      nodeType: NodeType.FILE,
      extension: '.dwg',
      parentId: 'folder-1',
      ownerId: 'user-1',
    });
    mockPrisma.fileSystemNode.update.mockResolvedValue({
      id: 'node-1',
      name: '新名字.dwg',
    });
  });

  it('重命名成功：记 NODE_RENAME（params 带 oldName/newName，ResourceType.FILE）', async () => {
    const result = await service.updateNode(
      'node-1',
      { name: '新名字.dwg' },
      'user-1'
    );

    expect(result.name).toBe('新名字.dwg');
    expect(mockAuditLogService.logProjectNodeAction).toHaveBeenCalledWith(
      'NODE_RENAME',
      'node-1',
      'user-1',
      { oldName: '旧名字.dwg', newName: '新名字.dwg' },
      'FILE'
    );
  });

  it('仅修改描述（名称未变）：不记 NODE_RENAME', async () => {
    await service.updateNode(
      'node-1',
      { name: '旧名字.dwg', description: '新描述' },
      'user-1'
    );

    expect(mockAuditLogService.logProjectNodeAction).not.toHaveBeenCalled();
  });

  it('无操作者（匿名）：不记 NODE_RENAME（避免假 actor）', async () => {
    await service.updateNode('node-1', { name: '新名字.dwg' });

    expect(mockAuditLogService.logProjectNodeAction).not.toHaveBeenCalled();
  });

  it('文件夹重命名：ResourceType.FOLDER', async () => {
    mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
      id: 'folder-1',
      name: '旧文件夹',
      nodeType: NodeType.FOLDER,
      extension: null,
      parentId: 'proj-1',
      ownerId: 'user-1',
    });
    mockPrisma.fileSystemNode.update.mockResolvedValue({
      id: 'folder-1',
      name: '新文件夹',
    });

    await service.updateNode(
      'folder-1',
      { name: '新文件夹' },
      'user-1'
    );

    expect(mockAuditLogService.logProjectNodeAction).toHaveBeenCalledWith(
      'NODE_RENAME',
      'folder-1',
      'user-1',
      { oldName: '旧文件夹', newName: '新文件夹' },
      'FOLDER'
    );
  });
});
