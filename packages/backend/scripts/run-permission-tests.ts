#!/usr/bin/env ts-node
/**
 * 权限测试运行脚本
 *
 * 用于运行完整的权限测试套件并生成报告
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PermissionTestRunner } from '../src/test/permission-test-runner';
import * as fs from 'fs';
import * as path from 'path';

async function runPermissionTests() {
  console.log('========================================');
  console.log('权限测试运行器');
  console.log('========================================\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const runner = app.get(PermissionTestRunner);

  try {
    // 运行完整测试套件
    console.log('开始运行权限测试套件...\n');
    const reports = await runner.runFullTestSuite();

    // 生成摘要
    const summary = runner.generateSummary(reports);
    console.log('\n' + summary);

    // 导出报告
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // JSON 报告
    const jsonReport = runner.exportReportAsJson(reports);
    const jsonPath = path.join(reportsDir, 'permission-test-report.json');
    fs.writeFileSync(jsonPath, jsonReport);
    console.log(`\nJSON 报告已保存: ${jsonPath}`);

    // Markdown 报告
    const mdReport = runner.exportReportAsMarkdown(reports);
    const mdPath = path.join(reportsDir, 'permission-test-report.md');
    fs.writeFileSync(mdPath, mdReport);
    console.log(`Markdown 报告已保存: ${mdPath}`);

    // 检查是否有失败的测试
    const totalFailed = reports.reduce((sum, r) => sum + r.failedTests, 0);
    if (totalFailed > 0) {
      console.log(`\n❌ 测试失败: ${totalFailed} 个测试用例失败`);
      process.exit(1);
    } else {
      console.log('\n✅ 所有测试通过');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ 测试运行失败:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runPermissionTests();