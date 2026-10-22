import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// <form> 内的按钮必须显式声明 type。
// 未声明 type 的 <button> 默认即 submit，而 HTML 隐式提交按「树序第一个可提交按钮」定位：
// 只要有一个非提交按钮（如「忘记密码？」「获取验证码」「取消」）排在提交按钮之前，
// 在输入框按回车就会先点它、再提交表单，表现为「按回车触发了别的按钮」。
// 仓内正确惯例见 Login/components/AccountLoginForm.tsx：非提交按钮 type="button"，
// 真正提交按钮 type="submit"。
// 门禁动机与 backend 的 scan:undeclared-params 一致：把「靠阅读发现」的约定变成自动失败。

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const BUTTON_TAG_RE = /<(Button|TabButton|button)\b/g;
const FORM_OPEN_RE = /<form(?![\w-])/g;
const FORM_CLOSE_RE = /<\/form\b/g;

/** 从 <Tag 起点向后取到配对的结束 >；括号/大括号未闭合时的 > 属于 => 或三元，不计 */
function openingTagAttrs(
  lines: string[],
  startLine: number,
  startCol: number,
): string | null {
  let attrs = '';
  for (let i = startLine; i < lines.length; i++) {
    const segment = i === startLine ? lines[i].slice(startCol) : lines[i];
    let angle = 1;
    let brace = 0;
    let paren = 0;
    let quote: string | null = null;
    for (let j = 0; j < segment.length; j++) {
      const ch = segment[j];
      if (quote) {
        if (ch === quote && segment[j - 1] !== '\\') quote = null;
        attrs += ch;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        attrs += ch;
        continue;
      }
      if (ch === '<') angle++;
      else if (ch === '>') {
        if (brace === 0 && paren === 0) return attrs;
      } else if (ch === '{') brace++;
      else if (ch === '}') brace--;
      else if (ch === '(') paren++;
      else if (ch === ')') paren--;
      attrs += ch;
    }
  }
  return null;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (
      /\.(tsx|vue)$/.test(entry.name) &&
      !/\.(spec|test)\.(tsx|vue|ts)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

interface Offence {
  file: string;
  buttonLine: number;
  formLine: number;
  tag: string;
}

function findOffences(): Offence[] {
  const offences: Offence[] = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    let depth = 0;
    const openForms: number[] = [];

    lines.forEach((line, index) => {
      const opens = (line.match(FORM_OPEN_RE) || []).length;
      const closes = (line.match(FORM_CLOSE_RE) || []).length;
      for (let k = 0; k < opens; k++) {
        depth++;
        openForms.push(index + 1);
      }
      BUTTON_TAG_RE.lastIndex = 0;
      let buttonMatch = BUTTON_TAG_RE.exec(line);
      while (buttonMatch) {
        const attrs = openingTagAttrs(lines, index, buttonMatch.index);
        const untyped =
          !/\btype\s*=/.test(attrs || '') &&
          !/\bnative-type\s*=/.test(attrs || '');
        if (attrs && untyped) {
          for (let k = 0; k < depth; k++) {
            offences.push({
              file: path.relative(SRC_ROOT, file),
              buttonLine: index + 1,
              formLine: openForms[openForms.length - 1 - k],
              tag: buttonMatch[1],
            });
          }
        }
        buttonMatch = BUTTON_TAG_RE.exec(line);
      }
      for (let k = 0; k < closes; k++) {
        depth--;
        openForms.pop();
        if (depth < 0) {
          depth = 0;
          openForms.shift();
        }
      }
    });
  }
  return offences;
}

describe('表单内按钮必须显式声明 type', () => {
  it('没有依赖默认 submit 的按钮', () => {
    const offences = findOffences();
    expect(
      offences.map(
        (o) => `${o.file}:${o.buttonLine} <${o.tag}>  (form@${o.formLine})`,
      ),
    ).toEqual([]);
  });
});
