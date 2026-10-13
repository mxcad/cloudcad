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

/**
 * sanitizeDownloadFilename 是下载 / 导出 / zip 条目方向文件名净化的唯一出口。
 * 字符集必须是此前 3 份实现的并集：任一份漏掉的字符（尤其 `<>:"|?*`）会原样进
 * zip 条目名，Windows 端打不开。
 */
describe('FileUtils.sanitizeDownloadFilename', () => {
  it('替换 Windows 非法字符而非剔除（与 sanitizeFilename 的分工）', () => {
    expect(FileUtils.sanitizeDownloadFilename('<>"|?*a.txt', 255)).toBe(
      '______a.txt'
    );
    // 对比：上传命名那侧是剔除 + 抛错，不会得到下划线占位
    expect(FileUtils.sanitizeFilename('<>a.txt')).toBe('a.txt');
  });

  it('替换路径分隔符、..、~ 与控制字符', () => {
    expect(
      FileUtils.sanitizeDownloadFilename('a/b\\c..d~e\x00f.pdf', 255)
    ).toBe('a_b_c_d_e_f.pdf');
  });

  it('截断到长度上限并保留扩展名', () => {
    const result = FileUtils.sanitizeDownloadFilename(
      'x'.repeat(260) + '.pdf',
      255
    );
    expect(result).toHaveLength(255);
    expect(result).toBe('x'.repeat(251) + '.pdf');
  });

  it('无扩展名的名字（转换产物名拼接前）也可截断', () => {
    expect(FileUtils.sanitizeDownloadFilename('x'.repeat(260), 255)).toBe(
      'x'.repeat(255)
    );
  });

  it('基名全为点号时不留下隐藏文件起点', () => {
    // path.extname('.pdf') === ''（隐藏文件的点不算扩展名）：'.pdf' 按无扩展名处理
    expect(FileUtils.sanitizeDownloadFilename('.pdf', 0)).toBe('unnamed');
    // 长点串截断后基名全为点号，剥点后只剩裸扩展名 → 同为隐藏文件
    expect(FileUtils.sanitizeDownloadFilename('...pdf', 0)).toBe('unnamed');
  });

  it('整个名字在截断后消失时回落到 unnamed', () => {
    expect(FileUtils.sanitizeDownloadFilename('/', 0)).toBe('unnamed');
  });

  it('扩展名占满上限时不产生负数截断长度', () => {
    expect(FileUtils.sanitizeDownloadFilename('a.b.c.d', 3)).toBe('a.d');
  });

  it('净化后为空或仅剩点号：回落到 unnamed', () => {
    expect(FileUtils.sanitizeDownloadFilename('/\\', 255)).toBe('unnamed');
    expect(FileUtils.sanitizeDownloadFilename('  ', 255)).toBe('unnamed');
    expect(FileUtils.sanitizeDownloadFilename('.', 255)).toBe('unnamed');
  });

  it('中文文件名原样保留（不动非 ASCII 合法字符）', () => {
    expect(FileUtils.sanitizeDownloadFilename('图纸 最终版.dwg', 255)).toBe(
      '图纸 最终版.dwg'
    );
  });
});
