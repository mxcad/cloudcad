/**
 * proc.js classifyPortOwner 归属阶梯决策矩阵（node:test，0 外部依赖）
 *
 * 统一阶梯的走查顺序就是它的契约：证据一级判不出才落下一级，谁先看谁说了算。
 * 三条业务路径（PG postmaster.pid / Redis --dir / 应用层 PM2 注册表）此前各自
 * 重写同样的顺序，口径漏改一处就是「本目录实例被当外部实例换端口」。这里把
 * 顺序钉死，改阶梯必须连测试一起改。
 *
 * 运行：node --test runtime/scripts/lib/proc-classify-port-owner.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyPortOwner } = require('./proc');

// 两级都判否：调用方的技术证据与二进制归属都指不出门，走 fallback
const NO_OWNERSHIP = {
  oursEvidence: () => null,
  isOurs: () => false,
  isForeign: () => false,
};

test('oursEvidence 有结论即短路，二进制归属不再查询', () => {
  assert.equal(
    classifyPortOwner(1234, {
      oursEvidence: () => 'ours',
      isOurs: () => false,
      isForeign: () => true,
    }),
    'ours',
    '第一级证据优先于二进制归属'
  );
});

test('oursEvidence 强制 unknown（cmdline 不可读等）→ 中止，即使二进制是本部署的', () => {
  assert.equal(
    classifyPortOwner(1234, {
      oursEvidence: () => 'unknown',
      isOurs: () => true,
    }),
    'unknown',
    '归属未知时不触碰实例，不能靠二进制路径兜回来'
  );
});

test('无技术证据 + 本目录二进制 → ours（默认档）', () => {
  assert.equal(
    classifyPortOwner(1234, {
      ...NO_OWNERSHIP,
      isOurs: () => true,
    }),
    'ours'
  );
});

test('oursLabel 可换档（应用层区分 PM2 托管与残留进程）', () => {
  assert.equal(
    classifyPortOwner(1234, {
      ...NO_OWNERSHIP,
      isOurs: () => true,
      oursLabel: 'ours-residual',
    }),
    'ours-residual'
  );
});

test('isOurs 优先于 isForeign：本目录实例不会被误判为另一部署目录', () => {
  assert.equal(
    classifyPortOwner(1234, {
      ...NO_OWNERSHIP,
      isOurs: () => true,
      isForeign: () => true,
    }),
    'ours',
    '顺序就是归属语义：先认自己人，才认同包邻居'
  );
});

test('另一部署目录二进制 → foreign-deploy', () => {
  assert.equal(
    classifyPortOwner(1234, {
      ...NO_OWNERSHIP,
      isForeign: () => true,
    }),
    'foreign-deploy'
  );
});

test('以上都判不出 → 走调用方的 fallback 档', () => {
  assert.equal(
    classifyPortOwner(1234, {
      ...NO_OWNERSHIP,
      fallback: () => 'foreign',
    }),
    'foreign'
  );
});

test('pid 为空 → noPid 默认 unknown', () => {
  assert.equal(classifyPortOwner(null, { ...NO_OWNERSHIP }), 'unknown');
  assert.equal(classifyPortOwner(undefined, { ...NO_OWNERSHIP }), 'unknown');
});

test('noPid 可换档：PG 区分「没扫到 PID」(null) 与「扫到但不可读」(unknown)', () => {
  assert.equal(
    classifyPortOwner(null, { ...NO_OWNERSHIP, noPid: null }),
    null,
    'null 语义是「调用方结合 fullScanDone 判定」，不能与 unknown 合并'
  );
});

test('oursEvidence 在 pid 为空时也会执行（PM2 注册表能独立给出结论）', () => {
  assert.equal(
    classifyPortOwner(null, {
      oursEvidence: () => 'ours-pm2',
      isOurs: () => true,
    }),
    'ours-pm2',
    'PM2 说在线即有实例，端口探测未必扫得到 PID'
  );
});

test('default 参数即生产行为：不传任何钩子时仍按统一阶梯走完', () => {
  // 真实进程归属钩子不注入时走 lib/proc 的本机判定；这里只钉住
  // 「pid 为空 → unknown」这条与钩子无关的路径
  assert.equal(classifyPortOwner(null), 'unknown');
});
