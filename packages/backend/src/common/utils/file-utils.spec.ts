import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { FileUtils } from './file-utils';

/**
 * resolveWithinRoot 是「用户可控路径拼到 filesDataPath 等根目录下再读盘」的唯一
 * 路径遍历防线（serveFile / 历史版本 / 外部参照回退等入口共用）。
 * 本组用例是路径遍历漏洞（filesData 文件服务）的回归测试核心：
 * 逃逸必须抛错、根内合法路径（含 ..）不得误伤。
 */
describe('FileUtils.resolveWithinRoot', () => {
  // 用平台相关的临时根目录，避免跨平台路径分隔符差异
  const root = path.join(os.tmpdir(), 'filesData');

  it('正常相对路径：解析到根目录内并返回绝对路径', () => {
    const result = FileUtils.resolveWithinRoot(root, '202609/node-1/abc.mxweb');
    expect(result).toBe(path.join(root, '202609', 'node-1', 'abc.mxweb'));
  });

  it('空相对路径：返回根目录本身（不抛错）', () => {
    expect(FileUtils.resolveWithinRoot(root, '')).toBe(root);
  });

  it('含 .. 但仍在根内：正常解析（不误伤合法路径）', () => {
    const result = FileUtils.resolveWithinRoot(
      root,
      '202609/node-1/../../202609/node-2/abc.mxweb'
    );
    expect(result).toBe(path.join(root, '202609', 'node-2', 'abc.mxweb'));
  });

  it('.. 直接逃逸出根目录：抛 BadRequestException', () => {
    expect(() =>
      FileUtils.resolveWithinRoot(root, '../../etc/passwd')
    ).toThrow(BadRequestException);
  });

  it('单段 .. 逃逸到根父目录：抛 BadRequestException', () => {
    expect(() => FileUtils.resolveWithinRoot(root, '..')).toThrow(
      BadRequestException
    );
  });

  it('深层 .. 逃逸（模拟 filesData 路径遍历）：抛 BadRequestException', () => {
    // 202609/node-1 两段 + 4 个 .. → 跳出 root
    expect(() =>
      FileUtils.resolveWithinRoot(root, '202609/node-1/../../../../etc/passwd')
    ).toThrow(BadRequestException);
  });

  it('前缀相似但非子目录（root 同前缀的兄弟目录）：抛 BadRequestException', () => {
    // 经典 startsWith(root) 缺陷：/…/filesDataEvil 会被误判为在 /…/filesData 内。
    // 加 path.sep 后兄弟目录必须被拒绝。
    const sibling = `${root}Evil`;
    expect(() =>
      FileUtils.resolveWithinRoot(root, path.relative(root, sibling))
    ).toThrow(BadRequestException);
  });
});
