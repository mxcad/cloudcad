import { describe, it, expect, beforeEach } from 'vitest';

/** 可读字节的 FileReader 替身：SparkMD5 走真实算法，同时可数读盘次数 */
class StubFileReader {
  static readonly instances: StubFileReader[] = [];
  /** 本轮读盘返回的字节；测试在两次调用之间改变它以模拟「文件内容变了」 */
  static nextBytes: Uint8Array = new Uint8Array(0);
  result: ArrayBuffer | null = null;
  onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    StubFileReader.instances.push(this);
  }

  readAsArrayBuffer(_file: File): void {
    // 与真实 FileReader 一致：先置 result，再以 ProgressEvent（e.target = reader）回调
    this.result = StubFileReader.nextBytes.buffer;
    this.onload?.({ target: this } as ProgressEvent<FileReader>);
  }
}

function fileOf(overrides: {
  name?: string;
  size?: number;
  lastModified?: number;
} = {}): File {
  const f = new File([], overrides.name ?? 'plan.dwg');
  if (overrides.size !== undefined) {
    Object.defineProperty(f, 'size', { value: overrides.size });
  }
  if (overrides.lastModified !== undefined) {
    Object.defineProperty(f, 'lastModified', { value: overrides.lastModified });
  }
  return f;
}

describe('calculateFileHash 会话内记忆化', () => {
  beforeEach(async () => {
    StubFileReader.instances = [];
    StubFileReader.nextBytes = new Uint8Array(0);
    Object.defineProperty(globalThis, 'FileReader', {
      value: StubFileReader,
      configurable: true,
    });
    // 动态导入，确保 hashUtils 在每个用例都拿到当前的 FileReader
    await import('./hashUtils');
  });

  it('同一文件（name+size+lastModified 同）只读盘一次，返回同一哈希', async () => {
    const { calculateFileHash } = await import('./hashUtils');

    const a = fileOf({ name: 'plan.dwg', size: 100, lastModified: 1_000_000 });
    const b = fileOf({ name: 'plan.dwg', size: 100, lastModified: 1_000_000 });

    const h1 = await calculateFileHash(a);
    const h2 = await calculateFileHash(b);

    expect(StubFileReader.instances).toHaveLength(1);
    expect(h2).toBe(h1);
  });

  it('局限：name+size+lastModified 全同则字节变化不可见（锁定此边界）', async () => {
    const { calculateFileHash } = await import('./hashUtils');

    StubFileReader.nextBytes = new Uint8Array([0x61]);
    const h1 = await calculateFileHash(fileOf({ size: 1, lastModified: 1 }));

    // 磁盘内容已变，但 File 上的 mtime 未变 → 命中记忆化，返回旧哈希。
    // 这是键设计换来的代价：正确性依赖 lastModified 随内容变更。真实文件系统的
    // mtime 是 100ns 级（前端按毫秒报），内容变更必然抬升 mtime，故不会在正常流程
    // 触发。此测试锁定该边界——若未来要支持「无 mtime 信任」的场景，应改回校验式。
    StubFileReader.nextBytes = new Uint8Array([0x62]);
    const h2 = await calculateFileHash(fileOf({ size: 1, lastModified: 1 }));

    expect(StubFileReader.instances).toHaveLength(1);
    expect(h2).toBe(h1);
  });

  it('同名同尺寸但 lastModified 变 → 视为不同文件，重算', async () => {
    const { calculateFileHash } = await import('./hashUtils');

    await calculateFileHash(fileOf({ size: 10, lastModified: 1 }));
    await calculateFileHash(fileOf({ size: 10, lastModified: 2 }));

    expect(StubFileReader.instances).toHaveLength(2);
  });

  it('同名同尺寸但文件名不同 → 各自独立缓存', async () => {
    const { calculateFileHash } = await import('./hashUtils');

    await calculateFileHash(
      fileOf({ name: 'a.dwg', size: 10, lastModified: 1 })
    );
    await calculateFileHash(
      fileOf({ name: 'b.dwg', size: 10, lastModified: 1 })
    );

    expect(StubFileReader.instances).toHaveLength(2);
  });

  it('lastModified 为 0（部分环境丢 mtime）时不参与缓存：每次重算', async () => {
    const { calculateFileHash } = await import('./hashUtils');

    // 此时键会塌缩成 name|size，两个同名同尺寸的不同文件会互相借用哈希，
    // 后果是秒传判定命中错误产物、打开别人的图纸。宁可慢，不可错。
    await calculateFileHash(fileOf({ name: 'a.dwg', size: 10, lastModified: 0 }));
    await calculateFileHash(fileOf({ name: 'b.dwg', size: 10, lastModified: 0 }));

    expect(StubFileReader.instances).toHaveLength(2);
  });

  it('lastModified 非有限值时不参与缓存', async () => {
    const { calculateFileHash } = await import('./hashUtils');

    await calculateFileHash(fileOf({ lastModified: Number.NaN }));
    await calculateFileHash(fileOf({ lastModified: Number.NaN }));

    expect(StubFileReader.instances).toHaveLength(2);
  });

  it('缓存超限淘汰最旧条目（LRU），不无限增长', async () => {
    const { calculateFileHash } = await import('./hashUtils');

    // 上限 32；写入 35 个不同文件
    for (let i = 0; i < 35; i += 1) {
      await calculateFileHash(
        fileOf({ name: `f${i}.dwg`, size: i + 1, lastModified: 1 })
      );
    }
    expect(StubFileReader.instances).toHaveLength(35);

    // 最旧的已被淘汰 → 重算一次
    await calculateFileHash(fileOf({ name: 'f0.dwg', size: 1, lastModified: 1 }));
    expect(StubFileReader.instances).toHaveLength(36);

    // 仍在缓存内的直接命中
    await calculateFileHash(fileOf({ name: 'f34.dwg', size: 35, lastModified: 1 }));
    expect(StubFileReader.instances).toHaveLength(36);
  });

  it('命中缓存时返回的仍是 Promise（调用方 await 语义不变）', async () => {
    const { calculateFileHash } = await import('./hashUtils');
    const f = fileOf({ size: 5, lastModified: 7 });
    await calculateFileHash(f);
    const p = calculateFileHash(f);
    expect(p).toBeInstanceOf(Promise);
  });
});
