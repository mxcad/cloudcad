/**
 * 扫描 controller 中「使用 req.params.X / req.query.X 但方法签名未声明 @Param/@Query 装饰器」的端点。
 *
 * 背景（ADR-0034 治理）：后端不显式声明 @Param/@Query，Swagger/SDK 生成类型即为 never，
 * 前端无法走 SDK 调用，被迫手拼 URL / 裸 fetch。此脚本用于审计这类"隐形参数"。
 *
 * 用法: node scripts/scan-undeclared-params.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.controller.ts')) files.push(full);
  }
}
walk(ROOT);

const issues = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');

  // 按方法粗分块：方法体 = 一行含 `(` 结束签名 + 后续直到下一个顶层 `}`。
  // 简化策略：记录每个方法签名行（含 @Get/@Post/... 装饰器与方法名）的起始行，
  // 下一个方法签名行之前为上一方法的签名区；签名区 = 方法声明行往回找装饰器。
  const methodStarts = [];
  lines.forEach((line, i) => {
    // 方法签名: [private] [async] xxx(（私有辅助方法也会被收录，随后按 private 跳过）
    if (/^\s*(private\s+)?(async\s+)?[a-zA-Z_$][\w$]*\s*\(/.test(line)) {
      methodStarts.push(i);
    }
  });

  for (let mi = 0; mi < methodStarts.length; mi++) {
    const sigStart = methodStarts[mi];
    const sigEnd = mi + 1 < methodStarts.length ? methodStarts[mi + 1] : lines.length;
    const sigBlock = lines.slice(sigStart, sigEnd).join('\n');
    const body = sigBlock;
    // 签名区（含装饰器）取 sigStart 往前最多 20 行
    const decoratorStart = Math.max(0, sigStart - 20);
    const sigAndDeco = lines.slice(decoratorStart, sigEnd).join('\n');

    // 跳过私有辅助方法（不是端点，不参与 Swagger/SDK 契约）
    const methodLine = lines[sigStart].trim();
    if (/^private\s/.test(methodLine)) continue;

    // 找出本方法内使用的 req.params.X / req.query.X
    const usedParams = new Set();
    const usedQueries = new Set();
    for (const line of body.split('\n')) {
      for (const m of line.matchAll(/req\.params\.(\w+)/g)) usedParams.add(m[1]);
      for (const m of line.matchAll(/req\.query\.(\w+)/g)) usedQueries.add(m[1]);
      for (const m of line.matchAll(/req\.params\[\s*['"]([^'"]+)['"]\s*\]/g)) usedParams.add(m[1]);
      for (const m of line.matchAll(/req\.query\[\s*['"]([^'"]+)['"]\s*\]/g)) usedQueries.add(m[1]);
    }
    if (usedParams.size === 0 && usedQueries.size === 0) continue;

    for (const p of usedParams) {
      if (!new RegExp(`@Param\\(['"]${p}['"]\\)`).test(sigAndDeco)) {
        issues.push({ file, line: sigStart + 1, kind: 'param', name: p, sig: body.split('\n')[0].trim().slice(0, 80) });
      }
    }
    for (const q of usedQueries) {
      if (!new RegExp(`@Query\\(['"]${q}['"]\\)`).test(sigAndDeco)) {
        issues.push({ file, line: sigStart + 1, kind: 'query', name: q, sig: body.split('\n')[0].trim().slice(0, 80) });
      }
    }
  }
}

if (issues.length === 0) {
  console.log('✅ 未发现「使用 req.params/req.query 但签名未声明装饰器」的端点');
} else {
  console.log(`⚠️  发现 ${issues.length} 处可能未声明的参数:`);
  for (const it of issues) {
    console.log(`  [${it.kind}] ${it.name}  ${path.relative(ROOT, it.file)}:${it.line}  ${it.sig}`);
  }
}
