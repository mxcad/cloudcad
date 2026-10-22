/**
 * 意图链（Intent Chain）——被前置阻塞的编辑器动作，跨登录中断可恢复。
 *
 * 背景：PC `Mx_Share` 在无云端节点时只弹一条「请先保存图纸到云端后再分享」的
 * toast 就返回失败，用户意图到此中断；未登录时更是要先跳登录、回来再手动重做一次。
 * 这里收敛为声明式的「动作 + 前置条件」模型：前置不满足则挂起链，前置满足后
 * 按序续跑，直至原始动作真实执行。PC 与移动端共用判定与持久化语义。
 *
 * 准入（ADR-0070 / ADR-0081）：纯函数 / 纯数据、不绑框架、不绑端、重复已成立。
 * 本模块**不读全局 sessionStorage**——存储以端口注入（吃参数，不读全局，与
 * `permissions/project.ts`、`billing/membership.ts` 同一纪律）；动作执行、登录闸门、
 * 引擎命令、会话回填等必绑端的副作用一律留在各端 adapter。
 *
 * 边界：本模块只做「定义 → 持久化 → 前置判定」，不编排执行顺序。
 * 「阻塞了就怎么办、满足了跑什么」由端侧决定（ADR-0081 D3/D4）。
 */

/** 前置条件类型。 */
export type IntentPrecondition = 'auth' | 'cloud-existence';

/** 续跑锚点：`document-loaded` = 当前文档真正加载完成后才允许续跑。 */
export type IntentResumeAnchor = 'document-loaded';

/** 意图定义：动作 + 前置条件 + 续跑锚点（声明式，无执行逻辑）。 */
export interface IntentDef {
  /** 意图标识：续跑时按它分派具体动作（端侧 switch 的唯一入口）。 */
  id: string;
  /** 原始动作。`type` 是命令名；其余字段留给端侧扩展。 */
  action: { type: string };
  /** 前置条件，**按序判定**；返回第一个不满足的。 */
  preconditions: readonly IntentPrecondition[];
  resumeAfter: IntentResumeAnchor;
}

/**
 * 挂起意图的存储端口。只要求三个方法——两端各自接 sessionStorage / 未来 App 接
 * 原生偏好存储，本模块不感知具体介质。
 */
export interface IntentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 单键存储：同一时刻只保留一条活跃链，新意图覆盖旧链（后发生的用户意图优先）。 */
export const PENDING_INTENT_KEY = 'cloudcad.pendingIntent';

const INTENT_IDS = ['auth', 'cloud-existence'] as const;
const INTENT_ANCHORS = ['document-loaded'] as const;

/** 判定一个前置是否满足。`cloud-existence` 蕴含 `auth`（未登录时无从建档）。 */
export function isPreconditionSatisfied(
  precondition: IntentPrecondition,
  authenticated: boolean,
  hasCloudNode: boolean
): boolean {
  if (precondition === 'auth') return authenticated;
  return authenticated && hasCloudNode;
}

/** 返回第一个不满足的前置；全部满足返回 null（即可以执行原始动作）。 */
export function firstBlockedPrecondition(
  def: Pick<IntentDef, 'preconditions'>,
  authenticated: boolean,
  hasCloudNode: boolean
): IntentPrecondition | null {
  for (const precondition of def.preconditions) {
    if (!isPreconditionSatisfied(precondition, authenticated, hasCloudNode)) {
      return precondition;
    }
  }
  return null;
}

/** 挂起一条意图链：覆盖旧链并持久化，返回挂起后的意图。 */
export function startPendingIntent(
  storage: IntentStorage,
  def: IntentDef
): IntentDef {
  storage.setItem(PENDING_INTENT_KEY, JSON.stringify(def));
  return def;
}

/** 读取挂起中的意图；缺失、解析失败或结构非法一律返回 null（不抛错）。 */
export function readPendingIntent(
  storage: IntentStorage
): IntentDef | null {
  const raw = storage.getItem(PENDING_INTENT_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return isIntentDef(parsed) ? parsed : null;
}

/** 清除挂起中的意图（动作已执行完、或用户明确放弃）。 */
export function clearPendingIntent(storage: IntentStorage): void {
  storage.removeItem(PENDING_INTENT_KEY);
}

/** 是否存在挂起中的意图（不清除）。 */
export function hasPendingIntent(storage: IntentStorage): boolean {
  return readPendingIntent(storage) !== null;
}

function isIntentDef(value: unknown): value is IntentDef {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return false;
  }

  const action = candidate.action;
  if (
    typeof action !== 'object' ||
    action === null ||
    typeof (action as Record<string, unknown>).type !== 'string'
  ) {
    return false;
  }

  const preconditions = candidate.preconditions;
  if (!Array.isArray(preconditions) || preconditions.length === 0) {
    return false;
  }
  for (const precondition of preconditions) {
    if (!INTENT_IDS.includes(precondition as IntentPrecondition)) return false;
  }

  const anchor = candidate.resumeAfter;
  return typeof anchor === 'string' && INTENT_ANCHORS.includes(anchor as IntentResumeAnchor);
}
