import { test } from '@playwright/test';

test('诊断页面', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[PAGE_ERROR] ${err.message}`));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // 打印 console 日志
  console.log('=== CONSOLE LOGS ===');
  logs.forEach((l) => console.log(l));

  // 提取页面文本
  const info = await page.evaluate(() => ({
    bodyText: document.body?.innerText?.substring(0, 1000),
    html: document.getElementById('app')?.innerHTML?.substring(0, 1000),
    readyState: document.readyState,
  }));
  console.log('=== PAGE TEXT ===');
  console.log(info.bodyText || '(empty)');
  console.log('=== APP HTML ===');
  console.log(info.html || '(no #app)');
});
