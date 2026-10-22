export interface IRuntimeConfigService {
  /**
   * 读运行时配置。默认值只有 `RUNTIME_CONFIG_DEFINITIONS` 的 `defaultValue` 一处，
   * 调用方**不得**自带兜底字面量——已登记键的调用方默认值恒被实现忽略，
   * 那份写着却不生效的字面量只会误导读者以为默认值有两份。新增配置项请在定义表登记。
   */
  getValue<T>(key: string): Promise<T>;
}
