/**
 * deploy-path.js 回归测试（node:test，0 外部依赖）
 *
 * 部署目录含中文会让 PostgreSQL / Redis / CAD 转换引擎的子进程工具链无法工作，
 * cli.js 在 bootstrap 首步拦下。本测试锁定检测语义，防止日后有人换回
 * cmd 的 findstr 方案——CP936 下字符类 `[^ -~]` 不匹配 GBK 高位字节，
 * 实测对含中文路径恒返回"无匹配"，纯 cmd 检测不可行。
 *
 * 运行：node --test runtime/scripts/lib/deploy-path.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { hasNonAscii } = require('./deploy-path');

test('纯 ASCII 路径（Windows 反斜杠）→ false', () => {
  assert.equal(hasNonAscii('D:\\cloudcad'), false);
  assert.equal(hasNonAscii('D:\\CloudCAD'), false);
  assert.equal(hasNonAscii('C:\\Users\\mx\\AppData\\Local\\Temp'), false);
});

test('纯 ASCII 路径（Linux 正斜杠）→ false', () => {
  assert.equal(hasNonAscii('/opt/cloudcad'), false);
  assert.equal(hasNonAscii('/home/user/project-1'), false);
  assert.equal(hasNonAscii('/var/www/cloudcad'), false);
});

test('Windows 中文目录 → true', () => {
  assert.equal(hasNonAscii('D:\\部署\\中文目录'), true);
  assert.equal(hasNonAscii('D:\\cloudcad\\测试'), true);
  assert.equal(hasNonAscii('D:\\软件\\梦想网页CAD实时协同平台'), true);
});

test('Linux 中文目录 → true（跨平台同等拦截）', () => {
  assert.equal(hasNonAscii('/opt/cloudcad/中文'), true);
  assert.equal(hasNonAscii('/home/用户/项目'), true);
});

test('其他非 ASCII 字符同样拦截（日文 / 俄文 / 全角 / emoji）', () => {
  assert.equal(hasNonAscii('D:\\クラウド'), true);
  assert.equal(hasNonAscii('/opt/путь'), true);
  assert.equal(hasNonAscii('D:\\路径（测试）'), true);
  assert.equal(hasNonAscii('D:\\部署📁'), true);
});

test('非字符串与空入参不抛错（防御性 String() 归一化）', () => {
  assert.equal(hasNonAscii(''), false);
  assert.equal(hasNonAscii(undefined), false);
  assert.equal(hasNonAscii(null), false);
  assert.equal(hasNonAscii(12345), false);
});

test('ASCII 边界字符（含空格与全部标点）不触发', () => {
  assert.equal(hasNonAscii('D:\\a b-c.d_e f(g)'), false);
  assert.equal(hasNonAscii('D:\\~!@#$%^&*()_+=[]{}|;:,.<>?'), false);
  assert.equal(hasNonAscii('D:\\路径 a-z A-Z 0-9'), true);
});
