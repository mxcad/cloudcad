import { generateNodeId } from './node-id';

describe('generateNodeId', () => {
  // 钉死格式不变式：磁盘上的存储目录名取自此 ID，换生成器会让新旧目录名分叉
  it('与 FileSystemNode.id 存量格式一致：25 字符、c 开头、字符集 0-9a-z', () => {
    for (const id of Array.from({ length: 50 }, () => generateNodeId())) {
      expect(id).toHaveLength(25);
      expect(id).toMatch(/^c[0-9a-z]{24}$/);
    }
  });

  it('批量生成无碰撞', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => generateNodeId()));
    expect(ids.size).toBe(2000);
  });
});
