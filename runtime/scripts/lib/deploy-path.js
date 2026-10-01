/**
 * @fileoverview 部署目录路径校验 —— 非 ASCII 字符检测（单一事实源）
 *
 * 部署目录含中文（或其他非 ASCII 字符）时，PostgreSQL / Redis / CAD 转换引擎
 * 的部分子进程工具链无法正常工作。cli.js 在 bootstrap 首步拦下并给出迁移指引。
 *
 * 放在 lib/ 而非各入口脚本里，是因为 cli.js 是 start / stop / deploy / 交互菜单
 * 的统一入口（Windows 与 Linux 双平台），拦一处即全覆盖；检测逻辑亦可被 node:test
 * 直接覆盖。
 *
 * 检测在 Node.js 侧按 Unicode 码点判定，不用 cmd 的 findstr 正则 `[^ -~]`：
 * CP936 下该字符类不匹配 GBK 高位字节，实测对含中文路径恒返回"无匹配"，
 * 纯 cmd 方案不可行。
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块；本模块仅依赖 node 内置。
 */

/**
 * 判断字符串是否含非 ASCII 字符。
 *
 * 覆盖中文、日文、俄文、全角符号、emoji 等所有码点 > 0x7f 的字符。
 * 按码点判定，因此不受控制台代码页影响。
 *
 * @param {string} str 待检测路径
 * @returns {boolean} 含非 ASCII 字符返回 true
 */
function hasNonAscii(str) {
  return /[^\x00-\x7f]/.test(String(str));
}

module.exports = {
  hasNonAscii,
};
