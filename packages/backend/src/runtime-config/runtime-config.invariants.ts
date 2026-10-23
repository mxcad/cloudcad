///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 定义表（`RUNTIME_CONFIG_DEFINITIONS`）元数据的不变式。
 *
 * `tier` / `category` / `subgroup` / `dangerous` 只做展示分层与运维习惯约定，
 * 不参与任何权限与校验逻辑，因此这些字段的正确性没有别的机制能拦：写错只会让
 * 配置页「分组错位、运维基线默认看不见、该二次确认的没确认」，运行时毫无报错。
 *
 * 规则与定义表同处一个模块、跟着数据走：改定义的人就在改动点旁边看到全部约束，
 * 而不是到 service spec 里找。规则本体是纯函数（无 IO、无框架依赖，与
 * `runtime-config.dependency.ts` 同构），测试只断言 `validateDefinitions()` 返回
 * 空数组。每条规则返回可读的违规原因（含键名与期望值），失败时一眼定位。
 */

import {
  getDependencyEdges,
  findDependencyCycles,
} from './runtime-config.dependency';
import type { RuntimeConfigDefinition } from './runtime-config.types';
import { RUNTIME_CONFIG_DEFINITIONS } from './runtime-config.constants';

/**
 * 运维基线：系统管理员日常要动、改错后果可接受的项。
 * 必须在 admin 档——advanced 在 PC 配置页默认整档收起，放错等于「默认看不见」。
 */
const OPS_BASELINE = [
  'backupEnabled',
  'backupKeepLocal',
  'backupDrillEnabled',
  'alertEmailEnabled',
  'alertEmailTo',
  'alertEmailFailEscalate',
  'alertEmailP1WindowMinutes',
  'alertEmailP2DailyHour',
  'auditArchiveEnabled',
  'taskRunRetentionDays',
  'storageCleanupEnabled',
  'storageCleanupDelayDays',
  'trashCleanupEnabled',
  'trashCleanupDelayDays',
  'orphanCleanupEnabled',
  'lockCleanupEnabled',
  'userCleanupEnabled',
  'cacheCleanupEnabled',
  'cacheMonitorEnabled',
  'batchDownloadCleanupEnabled',
  'deviceAuthFrontendDomain',
];

/**
 * 各接口限流与账号锁定：必须在同一个 security 分组的同一个 advanced 档里，
 * 否则「调一处安全策略」要翻好几个分组。
 */
const RATE_LIMIT_KEYS = [
  'rateLimitPublicMax',
  'rateLimitPublicWindowMs',
  'rateLimitAuthMax',
  'rateLimitLoginMax',
  'rateLimitLoginWindowMs',
  'loginRateLimitMax',
  'loginRateLimitWindowSeconds',
  'passwordResetRateLimitMax',
  'passwordResetRateLimitWindowSeconds',
  'registerRateLimitMax',
  'registerRateLimitWindowSeconds',
  'orderCreateRateLimitMax',
  'orderCreateRateLimitWindowSeconds',
  'accountLockFailThreshold',
  'accountLockWindowSeconds',
  'accountLockDurationSeconds',
  'smsDailyLimitPerPhone',
  'smsHourlyLimitPerIp',
];

/** 口令策略 7 项（#504）：落回 advanced 等于「默认看不见」。 */
const PASSWORD_POLICY_KEYS = [
  'passwordPolicyMinLength',
  'passwordPolicyMinCategories',
  'passwordPolicyWeakCheckEnabled',
  'passwordPolicyChangeIntervalDays',
  'passwordPolicyExpiringSoonDays',
  'passwordPolicyChangeEnforceEnabled',
  'passwordPolicyHistoryCheckEnabled',
];

/**
 * 账号锁定的窗口与时长和阈值是一套：改一个不改另一个会互相抵消，故一起标 dangerous。
 */
const LOCK_SET_KEYS = ['accountLockWindowSeconds', 'accountLockDurationSeconds'];

/**
 * 品牌公开配置项：PC 的 BrandContext 与移动端 resolveBrand 都只消费
 * GET /runtime-config/public 返回的键；`isPublic` 一旦改成 false，管理端改了
 * 配置两端毫无反应且不报任何错。
 * 客服三件套 + 外观四键（#499）+ 版权/法务/服务时间六键（#501），全部是从
 * brandProfile 拆出的独立键；brandEditorTitle 是 CAD 编辑器标题栏的独立产品面，
 * 刻意不走 BRAND_FIELD_OVERRIDE_PATHS 合并链。
 */
const BRAND_PUBLIC_KEYS = [
  'supportEmail',
  'supportPhone',
  'supportHours',
  'docsUrl',
  'brandTitle',
  'brandSubtitle',
  'brandTagline',
  'brandLogo',
  'brandEditorTitle',
  'brandCopyrightLine',
  'brandCopyrightYear',
  'brandCopyrightHolder',
  'brandLegalProductName',
  'brandLegalProductShortName',
];

/**
 * 分类闭集，须与前端 RuntimeConfigPage/meta.ts 的 CATEGORY_META 键集合一致
 * （#498 重划的 10 类：mail/sms/wechat/user/system/storage 六类已并入
 * account/alert/maintenance/file）。后端新增分类须同步前端图标与标签，
 * 否则页面掉到末尾用 key 当标签。
 */
const EXPECTED_CATEGORIES = [
  'brand',
  'account',
  'file',
  'billing',
  'alert',
  'security',
  'audit',
  'maintenance',
  'backup',
  'collaboration',
];

/**
 * 子分组闭集（#498）：四个多项大类各钉死子分组集合，其余分类不声明。
 */
const EXPECTED_SUBGROUPS: Record<string, string[]> = {
  security: ['mode-mfa', 'password-policy', 'rate-limit', 'account-lock'],
  account: ['login-methods', 'registration'],
  alert: ['alert-policy', 'mail-channel', 'sms-channel', 'webhook-channel'],
  maintenance: ['storage-trash', 'cache-disk', 'data-retention'],
};

/**
 * 两种 profile 基线都是「关闭」的刻意例外：安全模式仅建议、不强制开启；
 * 普通模式强制关闭。同值不是静默空操作，而是「模式基线收敛」——运维手动开启
 * 后切换模式会被重置回关闭，这是有意的收敛动作，不是 ADR-0077 D5 要消灭的
 * 静默偏离。
 */
const PROFILES_SAME_VALUE_ALLOWED = new Set([
  'mfaEnforceEnabled',
  'passwordPolicyChangeEnforceEnabled',
]);

/**
 * 依赖图已知的四条边（依赖边是门禁的事实源：漏声明一条边，对应的
 * 「功能开+通道关」静默失效状态就再也拦不住了）。
 */
const PINNED_DEPENDENCY_EDGES = [
  'requireEmailVerification->mailEnabled',
  'requirePhoneVerification->smsEnabled',
  'wechatAutoRegister->wechatEnabled',
  'alertEmailEnabled->mailEnabled',
];

/**
 * 声明 profiles 会被拒绝的键：切换模式不替用户开关它们（ADR-0077）。
 * ① 依赖客户自建基础设施才生效（SMTP / 短信通道 / 微信 AppID+Secret）——
 *    替用户开启等于造死锁（未配 SMTP 却打开 requireEmailVerification、
 *    未配微信凭据却打开 wechatEnabled）；
 * ② 业务功能开关、业务策略、容量与配额类（是否开放注册/批量下载、
 *    注销冷静期、上传上限、下单与短信与游客转换配额）——是否启用、
 *    放宽多少是部署方的产品决策，不是等保要求。
 * profile 只收「等保必需 + 无外部依赖即可生效」的项。
 */
const PROFILES_EXCLUDED_KEYS = new Set([
  'requireEmailVerification',
  'requirePhoneVerification',
  'allowRegister',
  'allowAutoRegisterOnPhoneLogin',
  'userCancelGraceDays',
  'userCleanupEnabled',
  'wechatEnabled',
  'wechatAutoRegister',
  'maxFileSize',
  'batchDownloadEnabled',
  'orderCreateRateLimitMax',
  'smsDailyLimitPerPhone',
  'smsHourlyLimitPerIp',
  'conversionGuestWindowHours',
  'conversionGuestLimit',
]);

/**
 * profile 目标值的区间校验。
 *
 * profile 目标是代码常量、不走 `set()` 的入参校验（`RuntimeConfigService` 的
 * `validateValue`），越界值会被静默写库，然后业务代码按一个不在界内的配置运行。
 * 这里只比对 `input.min/max`：profile 目标是同类型的代码常量，类型、字符串长度
 * 与 JSON 形状由 TypeScript 管，唯独数值范围没有任何别的拦截点。
 */
function profileTargetOutOfRange(
  def: RuntimeConfigDefinition,
  value: unknown
): string | null {
  if (def.type !== 'number' || typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return '目标值不是有限数字';
  if (def.input?.min !== undefined && value < def.input.min) {
    return `目标值 ${value} 小于 input.min ${def.input.min}`;
  }
  if (def.input?.max !== undefined && value > def.input.max) {
    return `目标值 ${value} 大于 input.max ${def.input.max}`;
  }
  return null;
}

/** 键名清单的键必须都已登记（拼错的键名会让门禁静默空转） */
function unregistered(
  keys: readonly string[],
  byKey: Map<string, RuntimeConfigDefinition>,
  rule: string
): string[] {
  return keys
    .filter((k) => !byKey.has(k))
    .map((k) => `${rule}：未登记的键 ${k}`);
}

/**
 * 校验定义表元数据，返回全部违规原因（空数组 = 全部满足）。
 *
 * 不抛错：一次调用报出全部违规，比逐条断言失败在第一条上停下来更快收敛。
 */
export function validateDefinitions(
  definitions: RuntimeConfigDefinition[] = RUNTIME_CONFIG_DEFINITIONS
): string[] {
  const violations: string[] = [];
  const byKey = new Map(definitions.map((d) => [d.key, d]));

  // ── 每一项都要说清「改了会怎样」：没有 impact 的项不该出现在配置页 ──
  for (const d of definitions) {
    if (!d.impact) {
      violations.push(`缺少 impact：${d.key}`);
    }
  }

  // ── 品牌公开键：两端只读 /public，分类与档位写错等于「改了没人看得见」 ──
  violations.push(...unregistered(BRAND_PUBLIC_KEYS, byKey, '品牌公开键'));
  for (const key of BRAND_PUBLIC_KEYS) {
    const d = byKey.get(key);
    if (!d) continue;
    if (d.isPublic !== true || d.category !== 'brand' || d.tier !== 'user') {
      violations.push(
        `品牌公开键 ${key} 必须是 isPublic + brand + user（实际 isPublic=${d.isPublic}, category=${d.category}, tier=${d.tier}）`
      );
    }
  }

  // ── 会员入口：前端只读 /public；出厂默认必须开，否则等于「装了会员功能但用户看不见」 ──
  const membership = byKey.get('membershipEnabled');
  if (!membership) {
    violations.push('未登记的键：membershipEnabled');
  } else {
    const expected: Record<string, unknown> = {
      isPublic: true,
      category: 'billing',
      tier: 'admin',
      defaultValue: true,
      envKey: 'MEMBERSHIP_ENABLED',
    };
    for (const [field, want] of Object.entries(expected)) {
      if (membership[field as keyof RuntimeConfigDefinition] !== want) {
        violations.push(
          `membershipEnabled.${field} 必须是 ${want}（实际 ${membership[field as keyof RuntimeConfigDefinition]}）`
        );
      }
    }
  }

  // ── 运维基线必须在 admin 档 ──
  violations.push(...unregistered(OPS_BASELINE, byKey, '运维基线'));
  for (const key of OPS_BASELINE) {
    const d = byKey.get(key);
    if (d && d.tier !== 'admin') {
      violations.push(`运维基线 ${key} 必须在 admin 档（实际 ${String(d.tier)}）`);
    }
  }

  // ── 限流与锁定阈值成组落在 advanced + security ──
  violations.push(...unregistered(RATE_LIMIT_KEYS, byKey, '限流/锁定项'));
  for (const key of RATE_LIMIT_KEYS) {
    const d = byKey.get(key);
    if (d && (d.tier !== 'advanced' || d.category !== 'security')) {
      violations.push(
        `限流/锁定项 ${key} 必须是 advanced + security（实际 ${d.tier} + ${d.category}）`
      );
    }
  }

  // ── 口令策略 7 项落 admin 档：受 profile 覆盖的项藏进 advanced 等于把偏离藏起来 ──
  violations.push(...unregistered(PASSWORD_POLICY_KEYS, byKey, '口令策略项'));
  for (const key of PASSWORD_POLICY_KEYS) {
    const d = byKey.get(key);
    if (d && (d.tier !== 'admin' || d.category !== 'security')) {
      violations.push(
        `口令策略项 ${key} 必须是 admin + security（实际 ${d.tier} + ${d.category}）`
      );
    }
  }

  // ── dangerous 只标在阈值上：次数阈值必须标记，窗口长度除账号锁定外不得标记 ──
  const thresholds = definitions.filter(
    (d) => d.key.endsWith('Max') || d.key === 'accountLockFailThreshold'
  );
  if (thresholds.length === 0) {
    violations.push('定义表里找不到任何次数阈值（endsWith Max / accountLockFailThreshold）');
  }
  for (const d of thresholds) {
    if (!d.dangerous) {
      violations.push(`次数阈值 ${d.key} 必须标 dangerous`);
    }
  }
  for (const d of definitions) {
    const isWindow =
      d.key.endsWith('WindowMs') ||
      d.key.endsWith('WindowSeconds') ||
      d.key.endsWith('DurationSeconds');
    if (isWindow && d.dangerous && !LOCK_SET_KEYS.includes(d.key)) {
      violations.push(`窗口长度 ${d.key} 不得标 dangerous（账号锁定窗口除外）`);
    }
  }

  // ── 分类闭集 ──
  const actualCategories = [...new Set(definitions.map((d) => d.category))].sort();
  if (JSON.stringify(actualCategories) !== JSON.stringify([...EXPECTED_CATEGORIES].sort())) {
    violations.push(
      `分类集合须等于 ${JSON.stringify([...EXPECTED_CATEGORIES].sort())}（实际 ${JSON.stringify(actualCategories)}）`
    );
  }

  // ── 子分组闭集：四个多项大类各钉死集合，其余分类不声明 ──
  for (const [category, expected] of Object.entries(EXPECTED_SUBGROUPS)) {
    const actual = [
      ...new Set(
        definitions
          .filter((d) => d.category === category && d.subgroup)
          .map((d) => d.subgroup!)
      ),
    ].sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
      violations.push(
        `分类 ${category} 的子分组须等于 ${JSON.stringify([...expected].sort())}（实际 ${JSON.stringify(actual)}）`
      );
    }
  }
  for (const d of definitions) {
    if (d.subgroup && !Object.keys(EXPECTED_SUBGROUPS).includes(d.category)) {
      violations.push(`分类 ${d.category} 的 ${d.key} 不应声明子分组（子分组只对四个多项大类开放）`);
    }
  }

  // ── profiles：声明则 secure 与 normal 两个目标值都必须给出 ──
  // 只给一个会在切换到「没给的那个」时静默不动作，等价于把偏离项藏起来。
  const withProfiles = definitions.filter((d) => d.profiles != null);
  // 钉死 securityMode 在列：profiles 声明被整表删掉后，下面几条不变式会空过。
  // 「secure 与 normal 都要给出」由 ConfigProfiles = Record<ConfigProfile, ...> 在
  // 编译期保证，这里不再重复判断。
  if (!withProfiles.some((d) => d.key === 'securityMode')) {
    violations.push('声明 profiles 的键必须包含 securityMode（否则 profiles 相关不变式空过）');
  }

  // ── profiles：目标值必须落在自身 input.min/max 区间内 ──
  for (const d of withProfiles) {
    for (const [mode, value] of [
      ['secure', d.profiles.secure],
      ['normal', d.profiles.normal],
    ] as const) {
      const reason = profileTargetOutOfRange(d, value);
      if (reason !== null) {
        violations.push(`profiles:${d.key}（${mode}）越界：${reason}`);
      }
    }
  }

  // ── profiles：两个目标值必须不同（同值键放进 profile 集就是静默空操作） ──
  for (const d of withProfiles) {
    if (PROFILES_SAME_VALUE_ALLOWED.has(d.key)) continue;
    if (JSON.stringify(d.profiles.secure) === JSON.stringify(d.profiles.normal)) {
      violations.push(
        `profiles:${d.key} 的 secure 与 normal 同值（切换模式对它毫无效果）`
      );
    }
  }

  // ── 出厂默认不取安全侧的两个刻意例外 ──
  // 其余声明 profiles 的键出厂默认都取安全侧（如 rateLimitPublicMax 出厂 100 <
  // normal 10000、passwordPolicyMinLength 出厂 10 > normal 6），即新装偏保守、
  // 放宽靠显式应用普通模式 profile。两个刻意例外：新装即允许管理员走普通登录入口、
  // 新装即放开免费导出下载（导出门控是商业策略而非等保项，安全模式才收敛）。
  const adminLoginEntry = byKey.get('adminLoginEntry');
  if (adminLoginEntry && adminLoginEntry.defaultValue !== 'MERGED') {
    violations.push(
      `adminLoginEntry 出厂默认必须是 MERGED（实际 ${String(adminLoginEntry.defaultValue)}）`
    );
  }
  const freeExport = byKey.get('freeExportDownloadEnabled');
  if (freeExport && freeExport.defaultValue !== true) {
    violations.push(
      `freeExportDownloadEnabled 出厂默认必须是 true（实际 ${String(freeExport.defaultValue)}）`
    );
  }

  // ── profiles：排除清单里的键不得声明 ──
  for (const key of PROFILES_EXCLUDED_KEYS) {
    const d = byKey.get(key);
    if (d && d.profiles != null) {
      violations.push(`profiles:${key} 不应声明 profiles（外部依赖 / 业务与容量决策）`);
    }
  }

  // ── 依赖图：已知四条边已声明、引用键存在、两端都是布尔键、无环 ──
  const edges = getDependencyEdges(definitions);
  const edgePairs = edges.map((e) => `${e.dependent}->${e.required}`);
  for (const pinned of PINNED_DEPENDENCY_EDGES) {
    if (!edgePairs.includes(pinned)) {
      violations.push(`依赖边未声明：${pinned}`);
    }
  }
  const registered = new Set(definitions.map((d) => d.key));
  for (const e of edges) {
    if (!registered.has(e.required)) {
      violations.push(`依赖边 ${e.dependent}->${e.required} 引用了未登记的键`);
    }
  }
  for (const e of edges) {
    for (const [end, key] of [
      ['依赖方', e.dependent],
      ['被依赖', e.required],
    ] as const) {
      if (byKey.get(key)?.type !== 'boolean') {
        violations.push(`依赖边 ${e.dependent}->${e.required} 的${end} ${key} 不是布尔键`);
      }
    }
  }
  const inCycle = findDependencyCycles(edges);
  if (inCycle.length > 0) {
    // 环会让「沿依赖判定」失去定义
    violations.push(`依赖图存在环：${inCycle.join('、')}`);
  }

  return violations;
}
