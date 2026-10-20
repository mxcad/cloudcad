/**
 * 镜像层属主归一化 单元测试（ADR-0075：rootless 单段映射兼容）
 *
 * 背景：无 newuidmap 的目标机只能做单段 0→euid 映射，docker load 应用层时
 * 对层内非 0:0 属主文件 lchown 会 EINVAL（官方 alpine 基础层 /etc/shadow
 * root:shadow gid=42，mx@ubuntu 实测）。打包时须把全部层重写为 0:0。
 *
 * 断言目标（scripts/pack-lib/normalize-image-ownership.js）：
 * 1. rewriteLayerTar：脏层（uid/gid 非 0）重写后全部条目 0:0，文件内容字节不变，
 *    tar 结构合法（校验和正确，tar -tf 可解析）
 * 2. 已 0:0 的层重写后字节不变（digest 稳定，不产生无谓的 manifest 变化）
 * 3. normalizeImageTar：镜像 tar 变换后层目录名与 manifest Layers 不变（docker
 *    load 按 config diff_ids 校验，不看目录名），config rootfs.diff_ids 同步更新；
 *    脏层 diff_id 变化、净层不变；层内容保留；断言通过
 * 4. normalizeImageTar：docker save 对同内容层的符号链接去重
 *    （layer.tar -> ../<他层>/layer.tar）→ 真实文件原地替换、符号链接保留并
 *    自动指向新内容，两个层引用都更新
 * 5. assertAllZeroOwnership：脏镜像抛错、净镜像通过
 *
 * 说明：以非 root 用户跑测试时用 `tar --owner=UID --group=GID --numeric-owner`
 * 制造指定属主的层 tar（GNU tar 创建时允许任意属主，无需 root）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const norm = require('../../../scripts/pack-lib/normalize-image-ownership');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** 在 dir 下建合成文件树（普通文件/子目录/符号链接/硬链接）；tag 区分内容 */
function makeFileTree(dir, tag = 'x') {
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.txt'), `alpha-content-${tag}`);
  fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), `bravo-content-${tag}`);
  fs.writeFileSync(path.join(dir, 'etc-shadow'), 'root:*:0:0:99999:7:::');
  fs.symlinkSync('a.txt', path.join(dir, 'link-a'));
  fs.linkSync(path.join(dir, 'a.txt'), path.join(dir, 'hard-a'));
}

/** 造指定属主的层 tar（条目名无 ./ 前缀，贴近 docker 层 tar 形态） */
function makeLayerTar(tarPath, dir, owner, group) {
  execFileSync(
    'tar',
    [
      '-cf',
      tarPath,
      `--owner=${owner}`,
      `--group=${group}`,
      '--numeric-owner',
      '-C',
      dir,
      'a.txt',
      'sub',
      'etc-shadow',
      'link-a',
      'hard-a',
    ],
    { stdio: 'pipe' },
  );
}

/** 解 tar 到目录并返回 { 相对路径: 内容 }（符号链接记为 'link:<target>'） */
function extractMap(tarPath) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-norm-test-'));
  try {
    execFileSync('tar', ['-xf', tarPath, '-C', out], { stdio: 'pipe' });
    const map = {};
    (function walk(d, prefix) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isSymbolicLink()) map[rel] = `link:${fs.readlinkSync(full)}`;
        else if (e.isDirectory()) walk(full, rel);
        else map[rel] = fs.readFileSync(full, 'utf8');
      }
    })(out, '');
    return map;
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

describe('normalize-image-ownership (ADR-0075 单段映射兼容)', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-norm-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('rewriteLayerTar: 脏层重写后全部条目 0:0，内容字节不变，tar 结构合法', () => {
    const dir = path.join(tmp, 'tree');
    fs.mkdirSync(dir, { recursive: true });
    makeFileTree(dir);
    const dirty = path.join(tmp, 'dirty.tar');
    makeLayerTar(dirty, dir, 1000, 42);
    // 前置：脏层确实含非 0:0 条目（否则测试失去意义）
    expect(norm.scanLayerOwnership(dirty).length).toBeGreaterThan(0);

    const clean = path.join(tmp, 'clean.tar');
    const r = norm.rewriteLayerTar(dirty, clean);
    expect(r.entries).toBeGreaterThanOrEqual(6);
    expect(r.changed).toBeGreaterThan(0);

    // 全部条目 0:0
    expect(norm.scanLayerOwnership(clean)).toEqual([]);
    // 内容/链接/硬链接语义保留
    expect(extractMap(clean)).toEqual(extractMap(dirty));
    // tar 结构合法（校验和正确）：可完整列出
    execFileSync('tar', ['-tf', clean], { stdio: 'pipe' });
  });

  test('rewriteLayerTar: 已 0:0 的层重写后字节不变（digest 稳定）', () => {
    const dir = path.join(tmp, 'tree');
    fs.mkdirSync(dir, { recursive: true });
    makeFileTree(dir);
    const clean0 = path.join(tmp, 'clean0.tar');
    makeLayerTar(clean0, dir, 0, 0);
    const out = path.join(tmp, 'out.tar');
    const r = norm.rewriteLayerTar(clean0, out);
    expect(r.changed).toBe(0);
    expect(sha256File(out)).toBe(sha256File(clean0));
  });

  test('normalizeImageTar: 目录名/Layers 不变，config diff_ids 同步，脏层 diff_id 变、净层不变，内容保留', () => {
    // 两个层：脏（1000/42）+ 净（0/0）
    const dirtyDir = path.join(tmp, 'd-tree');
    const cleanDir = path.join(tmp, 'c-tree');
    fs.mkdirSync(dirtyDir, { recursive: true });
    fs.mkdirSync(cleanDir, { recursive: true });
    makeFileTree(dirtyDir, 'dirty');
    makeFileTree(cleanDir, 'clean');
    const dirtyLayer = path.join(tmp, 'dirty-layer.tar');
    const cleanLayer = path.join(tmp, 'clean-layer.tar');
    makeLayerTar(dirtyLayer, dirtyDir, 1000, 42);
    makeLayerTar(cleanLayer, cleanDir, 0, 0);
    const dDirty = sha256File(dirtyLayer);
    const dClean = sha256File(cleanLayer);

    // 组装 docker save 形态的镜像 tar
    const imgDir = path.join(tmp, 'img');
    fs.mkdirSync(path.join(imgDir, dDirty), { recursive: true });
    fs.mkdirSync(path.join(imgDir, dClean), { recursive: true });
    fs.copyFileSync(dirtyLayer, path.join(imgDir, dDirty, 'layer.tar'));
    fs.copyFileSync(cleanLayer, path.join(imgDir, dClean, 'layer.tar'));
    const config = {
      architecture: 'amd64',
      os: 'linux',
      config: { Env: ['PATH=/usr/local/bin:/usr/bin:/bin'], WorkingDir: '/app' },
      created: '2026-10-20T00:00:00Z',
      rootfs: { type: 'layers', diff_ids: [dDirty, dClean] },
      history: [],
    };
    const configContent = JSON.stringify(config);
    const dConfig = crypto.createHash('sha256').update(configContent).digest('hex');
    fs.writeFileSync(path.join(imgDir, `${dConfig}.json`), configContent);
    const manifest = [
      {
        Config: `${dConfig}.json`,
        RepoTags: ['test/app:1.0.0'],
        Layers: [`${dDirty}/layer.tar`, `${dClean}/layer.tar`],
      },
    ];
    fs.writeFileSync(path.join(imgDir, 'manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(imgDir, 'repositories'), JSON.stringify({ 'test/app': { '1.0.0': dClean } }));
    const imageTar = path.join(tmp, 'image.tar');
    execFileSync('tar', ['-cf', imageTar, '-C', imgDir, 'manifest.json', 'repositories', `${dConfig}.json`, dDirty, dClean], {
      stdio: 'pipe',
    });

    const r = norm.normalizeImageTar(imageTar);
    expect(r.layers).toBe(2);
    expect(r.rewritten).toBe(1); // 只有脏层被重写

    // 变换后：层目录名与 manifest Layers 不变（docker load 按 config diff_ids
    // 校验，不看目录名），config diff_ids 同步更新、净层 diff_id 稳定
    const checkDir = path.join(tmp, 'check');
    fs.mkdirSync(checkDir, { recursive: true });
    execFileSync('tar', ['-xf', imageTar, '-C', checkDir], { stdio: 'pipe' });
    const newManifest = JSON.parse(fs.readFileSync(path.join(checkDir, 'manifest.json'), 'utf8'));
    const img = newManifest[0];
    expect(img.Layers).toEqual([`${dDirty}/layer.tar`, `${dClean}/layer.tar`]); // 目录名/Layers 不变
    const newConfig = JSON.parse(fs.readFileSync(path.join(checkDir, img.Config), 'utf8'));
    expect(newConfig.rootfs.diff_ids[1]).toBe(dClean); // 净层 diff_id 稳定
    const newDiffId = newConfig.rootfs.diff_ids[0]; // 脏层 diff_id 变化
    expect(newDiffId).not.toBe(dDirty);
    // 新层文件仍在原目录，sha256 与新 diff_id 一致
    const newLayerTar = path.join(checkDir, dDirty, 'layer.tar');
    expect(sha256File(newLayerTar)).toBe(newDiffId.replace(/^sha256:/, ''));
    // 新 config 文件名与其 digest 一致
    expect(sha256File(path.join(checkDir, img.Config))).toBe(img.Config.replace(/\.json$/, ''));
    // 全层 0:0 断言通过
    norm.assertAllZeroOwnership(imageTar);
    // 层内容保留
    expect(extractMap(newLayerTar)).toEqual(extractMap(dirtyLayer));
  });

  test('normalizeImageTar: docker save 符号链接去重层 → 真实文件原地替换，符号链接保留并指向新内容', () => {
    // 模拟 docker save 对同内容层的去重形态：目录 A 存真实 layer.tar，
    // 目录 B 的 layer.tar 是符号链接 ../A/layer.tar（同内容 → 同 diff_id）
    const dir = path.join(tmp, 'tree');
    fs.mkdirSync(dir, { recursive: true });
    makeFileTree(dir, 'shared');
    const dirtyLayer = path.join(tmp, 'dirty-layer.tar');
    makeLayerTar(dirtyLayer, dir, 1000, 42);
    const dDirty = sha256File(dirtyLayer);
    const dirA = dDirty; // 目录 A 名任意（此处取真实文件 sha）
    const dirB = 'b'.repeat(64); // 目录 B 名任意（模拟 registry 拉取层的压缩 digest 目录名）

    const imgDir = path.join(tmp, 'img');
    fs.mkdirSync(path.join(imgDir, dirA), { recursive: true });
    fs.mkdirSync(path.join(imgDir, dirB), { recursive: true });
    fs.copyFileSync(dirtyLayer, path.join(imgDir, dirA, 'layer.tar'));
    fs.symlinkSync(`../${dirA}/layer.tar`, path.join(imgDir, dirB, 'layer.tar'));
    const config = {
      architecture: 'amd64',
      os: 'linux',
      config: {},
      created: '2026-10-20T00:00:00Z',
      rootfs: { type: 'layers', diff_ids: [dDirty, dDirty] },
    };
    const configContent = JSON.stringify(config);
    const dConfig = crypto.createHash('sha256').update(configContent).digest('hex');
    fs.writeFileSync(path.join(imgDir, `${dConfig}.json`), configContent);
    fs.writeFileSync(
      path.join(imgDir, 'manifest.json'),
      JSON.stringify([{ Config: `${dConfig}.json`, RepoTags: ['test/app:1'], Layers: [`${dirA}/layer.tar`, `${dirB}/layer.tar`] }]),
    );
    const imageTar = path.join(tmp, 'image-symlink.tar');
    execFileSync('tar', ['-cf', imageTar, '-C', imgDir, 'manifest.json', `${dConfig}.json`, dirA, dirB], {
      stdio: 'pipe',
    });

    const r = norm.normalizeImageTar(imageTar);
    expect(r.layers).toBe(2);
    expect(r.rewritten).toBe(2); // 两个层引用的 diff_id 都变化（共享真实文件只重写一次）

    // 变换后：目录名/Layers 不变，真实文件原地替换，符号链接保留且解析到新内容
    const checkDir = path.join(tmp, 'check');
    fs.mkdirSync(checkDir, { recursive: true });
    execFileSync('tar', ['-xf', imageTar, '-C', checkDir], { stdio: 'pipe' });
    const img = JSON.parse(fs.readFileSync(path.join(checkDir, 'manifest.json'), 'utf8'))[0];
    expect(img.Layers).toEqual([`${dirA}/layer.tar`, `${dirB}/layer.tar`]);
    const newConfig = JSON.parse(fs.readFileSync(path.join(checkDir, img.Config), 'utf8'));
    const newDiffId = newConfig.rootfs.diff_ids[0].replace(/^sha256:/, '');
    expect(newConfig.rootfs.diff_ids[1].replace(/^sha256:/, '')).toBe(newDiffId);
    const realTar = path.join(checkDir, dirA, 'layer.tar');
    expect(sha256File(realTar)).toBe(newDiffId);
    const linkTar = path.join(checkDir, dirB, 'layer.tar');
    expect(fs.lstatSync(linkTar).isSymbolicLink()).toBe(true); // 符号链接保留
    expect(sha256File(linkTar)).toBe(newDiffId); // 解析到新内容
    norm.assertAllZeroOwnership(imageTar);
  });

  test('assertAllZeroOwnership: 脏镜像抛错（含违规条目样例）', () => {
    const dir = path.join(tmp, 'tree');
    fs.mkdirSync(dir, { recursive: true });
    makeFileTree(dir);
    const dirtyLayer = path.join(tmp, 'dirty-layer.tar');
    makeLayerTar(dirtyLayer, dir, 1000, 42);
    const dDirty = sha256File(dirtyLayer);
    const imgDir = path.join(tmp, 'img');
    fs.mkdirSync(path.join(imgDir, dDirty), { recursive: true });
    fs.copyFileSync(dirtyLayer, path.join(imgDir, dDirty, 'layer.tar'));
    const config = {
      architecture: 'amd64',
      os: 'linux',
      config: {},
      created: '2026-10-20T00:00:00Z',
      rootfs: { type: 'layers', diff_ids: [dDirty] },
    };
    const configContent = JSON.stringify(config);
    const dConfig = crypto.createHash('sha256').update(configContent).digest('hex');
    fs.writeFileSync(path.join(imgDir, `${dConfig}.json`), configContent);
    fs.writeFileSync(
      path.join(imgDir, 'manifest.json'),
      JSON.stringify([{ Config: `${dConfig}.json`, RepoTags: ['test/app:1'], Layers: [`${dDirty}/layer.tar`] }]),
    );
    const imageTar = path.join(tmp, 'image-dirty.tar');
    execFileSync('tar', ['-cf', imageTar, '-C', imgDir, 'manifest.json', `${dConfig}.json`, dDirty], {
      stdio: 'pipe',
    });
    expect(() => norm.assertAllZeroOwnership(imageTar)).toThrow(/非 0:0 属主条目/);
  });
});
