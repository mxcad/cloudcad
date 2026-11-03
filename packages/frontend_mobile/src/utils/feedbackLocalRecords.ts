/**
 * 本地反馈记录（移动端）。
 *
 * 与 PC feedbackLocalRecords（frontend/src/lib/feedbackLocalRecords.ts）同源同语义：
 * 反馈提交成功后无论登录与否都写一条本地记录——未登录用户在本设备无需登录
 * 也能看到自己提交过什么反馈；已登录用户云端记录为主，本地记录补充云端查不到
 * 的部分（如登录前匿名提交的反馈）。
 *
 * 纯 localStorage 实现：key `feedback_local_records`，上限 50 条、按 code
 * 去重、try/catch 防配额/隐私模式异常。附件不落本地（仅存净化 HTML 供文本
 * 预览，附件节点不做水合）。
 */

export interface FeedbackLocalRecord {
  /** 查询码（FB-YYYYMMDD-XXXXXXXX） */
  code: string
  title: string
  /** 反馈类型（BUG/SUGGESTION/COMPLAINT/OTHER） */
  type: string
  /** 净化后的 HTML（本地仅做 stripHtmlTags 文本预览） */
  contentHtml: string
  contact?: string
  /** 提交时间（ISO 字符串） */
  createdAt: string
  /** 提交来源 */
  source: 'PC' | 'MOBILE'
  /** 是否匿名提交 */
  anonymous: boolean
}

const STORAGE_KEY = 'feedback_local_records'
const MAX_RECORDS = 50

/** 读取全部本地记录（最新在前）；存储不可用/数据损坏时返回空数组 */
export function getLocalFeedbackRecords(): FeedbackLocalRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is FeedbackLocalRecord =>
        r !== null &&
        typeof r === 'object' &&
        typeof (r as FeedbackLocalRecord).code === 'string'
    )
  } catch {
    return []
  }
}

/** 写入一条记录（按 code 去重，最新在前，超出上限淘汰最旧） */
export function saveLocalFeedbackRecord(record: FeedbackLocalRecord): void {
  try {
    const rest = getLocalFeedbackRecords().filter((r) => r.code !== record.code)
    const next = [record, ...rest].slice(0, MAX_RECORDS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 配额超限/隐私模式：静默忽略，不影响提交主流程
  }
}
