/**
 * 部署形态检测唯一出口 单元测试（ADR-0075 C3，v1 Step 3）
 *
 * 断言目标：
 * 1. .deploy 内容 form=docker → docker
 * 2. .deploy 内容 form=bare / 空（存量裸机包）/ 其他内容 → bare
 * 3. 无 .deploy 但有存量 .deploy-docker 标记 → docker（V5 存量兼容）
 * 4. 两者皆无 → null（开发仓库）
 * 5. .deploy 存在时以其为准（新标记优先于存量标记）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectDeployForm } = require('../../../runtime/scripts/lib/deploy-form');

describe('detectDeployForm (ADR-0075 C3)', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-form-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('.deploy 内容 form=docker → docker', () => {
    fs.writeFileSync(path.join(tmp, '.deploy'), 'form=docker');
    expect(detectDeployForm(tmp)).toBe('docker');
  });

  test('.deploy 内容 form=bare → bare', () => {
    fs.writeFileSync(path.join(tmp, '.deploy'), 'form=bare');
    expect(detectDeployForm(tmp)).toBe('bare');
  });

  test('.deploy 空内容（存量裸机包）→ bare', () => {
    fs.writeFileSync(path.join(tmp, '.deploy'), '');
    expect(detectDeployForm(tmp)).toBe('bare');
  });

  test('.deploy 带换行的 form=docker → docker（trim 容错）', () => {
    fs.writeFileSync(path.join(tmp, '.deploy'), 'form=docker\n');
    expect(detectDeployForm(tmp)).toBe('docker');
  });

  test('无 .deploy，存量 .deploy-docker 标记 → docker（V5 兼容）', () => {
    fs.writeFileSync(path.join(tmp, '.deploy-docker'), '1');
    expect(detectDeployForm(tmp)).toBe('docker');
  });

  test('两者皆无 → null（开发仓库）', () => {
    expect(detectDeployForm(tmp)).toBeNull();
  });

  test('.deploy 存在时以其为准（form=bare 压过 .deploy-docker）', () => {
    fs.writeFileSync(path.join(tmp, '.deploy'), 'form=bare');
    fs.writeFileSync(path.join(tmp, '.deploy-docker'), '1');
    expect(detectDeployForm(tmp)).toBe('bare');
  });
});
