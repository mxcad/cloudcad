/**
 * 运行时配置**公开键**的出厂默认值（单一事实源）。
 *
 * 这些值是 `packages/backend/src/runtime-config/runtime-config.constants.ts`
 * 中 `RUNTIME_CONFIG_DEFINITIONS[].defaultValue` 的权威来源：后端定义表引用本注册表，
 * PC（RuntimeConfigContext）与移动端（useRuntimeConfig）的「接口失败兜底」也引用同一份。
 *
 * 约束（勿违反）：
 * - 只收录**前端消费的公开标量键**，命名用**前端平铺形**（`feedbackMinContentLength`），
 *   后端点分键（`feedback.minContentLength`）在各自消费点做映射。
 * - 值必须与后端 constants 的 `defaultValue` 完全一致（改一端必须同步另一端）。
 * - 刻意 fail-safe 的前端兜底（口令策略 10/3，见 `RUNTIME_CONFIG_FAIL_SAFE`）**不**并入本注册表，
 *   那是「后端正常默认」之外的刻意安全回退，与「出厂默认」语义不同。
 *
 * 历史问题：默认值曾散在 backend constants / PC context / mobile composable 三处逐字复制，
 * 已出现分歧（passwordPolicyMinLength 6 vs 10、passwordPolicyMinCategories 0 vs 3、
 * feedback.anonymousDailyLimit 20 vs 3）。收敛到本注册表后，三端读同一对象，
 * 编译期不可能再分歧。
 */
export const RUNTIME_CONFIG_DEFAULTS = {
  mailEnabled: false,
  requireEmailVerification: false,
  smsEnabled: false,
  requirePhoneVerification: false,
  supportEmail: '',
  supportPhone: '',
  supportHours: '',
  docsUrl: '',
  brandTitle: '',
  brandSubtitle: '',
  brandTagline: '',
  brandLogo: '',
  brandEditorTitle: '',
  brandCopyrightLine: '',
  brandCopyrightYear: '',
  brandCopyrightHolder: '',
  brandLegalProductName: '',
  brandLegalProductShortName: '',
  allowRegister: true,
  registerGiftEnabled: true,
  registerGiftMonths: 1,
  wechatEnabled: false,
  wechatAutoRegister: false,
  maxFileSize: 100,
  collaborationEnabled: true,
  collaborationDomains: '',
  batchDownloadEnabled: false,
  freeExportDownloadEnabled: true,
  membershipEnabled: true,
  userCancelGraceDays: 7,
  securityMode: 'normal',
  // 口令策略的「出厂默认」是 normal 基线（6 / 0 = 不要求类别构成）；
  // 前端「接口失败兜底」刻意用 secure 基线（10 / 3），见 RUNTIME_CONFIG_FAIL_SAFE
  passwordPolicyMinLength: 6,
  passwordPolicyMinCategories: 0,
  conversionGuestWindowHours: 2,
  conversionGuestLimit: 5,
  feedbackAnonymousEnabled: true,
  feedbackAnonymousDailyLimit: 20,
  feedbackUserDailyLimit: 10,
  feedbackMinContentLength: 20,
  feedbackMaxContentLength: 5000,
  feedbackMaxImageSize: 10,
  feedbackMaxDrawingSize: 300,
  feedbackMaxDocumentSize: 300,
  feedbackMaxImageCount: 20,
  feedbackMaxDrawingCount: 5,
  feedbackMaxDocumentCount: 10,
  feedbackMaxAttachmentCount: 30,
} as const;

/**
 * 前端「公开配置接口失败」时的刻意 fail-safe 兜底。
 *
 * 与 `RUNTIME_CONFIG_DEFAULTS` 语义不同：后端正常默认是 6 / 0，但公开端点失败时
 * 前端若回退到「更弱」的口令要求（6 位 / 不要求类别）会让表单放过后端本要拒绝的口令，
 * 因此刻意回退到 secure 基线（10 / 3）——接口不可达时按「更严」处理是安全侧。
 * 该设计是既有决定（勿改回普通默认），此处只是把「为什么是 10 / 3」从三处注释收敛到一处声明。
 */
export const RUNTIME_CONFIG_FAIL_SAFE = {
  passwordPolicyMinLength: 10,
  passwordPolicyMinCategories: 3,
} as const;
