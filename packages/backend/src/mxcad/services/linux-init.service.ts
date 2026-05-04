///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { checkSvnAvailableSync, getPlatformInfo } from '@cloudcad/svn-version-tool';

const execAsync = promisify(exec);

/**
 * Linux 环境初始化服务
 * 在项目启动时自动配置 Linux 环境所需的权限和依赖
 */
@Injectable()
export class LinuxInitService implements OnModuleInit {
  private readonly logger = new Logger(LinuxInitService.name);
  private readonly mxcadAssemblyDir: string;

  constructor(private readonly configService: ConfigService) {
    // 获取 mxcadassembly 目录路径
    this.mxcadAssemblyDir = path.join(process.cwd(), 'mxcadassembly', 'linux');
  }

  /**
   * 模块初始化时执行
   */
  async onModuleInit(): Promise<void> {
    const platformInfo = getPlatformInfo();
    this.logger.log(`当前平台: ${platformInfo.platform}, SVN 路径: ${platformInfo.svnPath}`);

    // 检查 SVN 是否可用
    const svnCheck = checkSvnAvailableSync();
    if (!svnCheck.available) {
      this.logger.error(`SVN 检查失败: ${svnCheck.message}`);
      // Linux 平台 SVN 必须安装
      if (os.platform() === 'linux') {
        throw new InternalServerErrorException(svnCheck.message);
      }
    } else {
      this.logger.log(`SVN 检查通过: ${svnCheck.message}`);
    }

    // 仅在 Linux 平台执行环境初始化
    if (os.platform() !== 'linux') {
      this.logger.log('当前平台非 Linux，跳过环境初始化');
      return;
    }

    this.logger.log('检测到 Linux 平台，开始环境初始化...');

    try {
      await this.initializeLinuxEnvironment();
      this.logger.log('Linux 环境初始化完成');
    } catch (error) {
      this.logger.error(`Linux 环境初始化失败: ${error.message}`);
      this.logger.warn('部分功能可能无法正常工作，请手动执行初始化脚本');
    }
  }

  /**
   * 初始化 Linux 环境
   * 根据文档要求：
   * 1. 设置 mxcadassembly 目录权限
   * 2. 设置 mx/so 目录权限
   * 3. 复制 locale 文件到系统目录
   */
  private async initializeLinuxEnvironment(): Promise<void> {
    const releaseDir = path.join(this.mxcadAssemblyDir, 'release');

    // 检查目录是否存在
    if (!fs.existsSync(releaseDir)) {
      this.logger.warn(`mxcadassembly 目录不存在: ${releaseDir}`);
      return;
    }

    // 1. 设置 mxcadassembly 主程序权限
    await this.setExecutablePermissions(releaseDir);

    // 2. 设置 mx/so 共享库权限
    await this.setSharedLibraryPermissions(releaseDir);

    // 3. 复制 locale 文件到系统目录
    await this.copyLocaleFiles(releaseDir);
  }

  /**
   * 设置 mxcadassembly 主程序权限
   */
  private async setExecutablePermissions(releaseDir: string): Promise<void> {
    const mxcadAssemblyPath = path.join(releaseDir, 'mxcadassembly');

    if (!fs.existsSync(mxcadAssemblyPath)) {
      this.logger.warn(`mxcadassembly 程序不存在: ${mxcadAssemblyPath}`);
      return;
    }

    try {
      // 设置可执行权限
      await execAsync(`chmod +x "${mxcadAssemblyPath}"`);
      this.logger.log(`已设置 mxcadassembly 可执行权限`);

      // 设置整个 release 目录权限
      await execAsync(`chmod -R 755 "${releaseDir}"`);
      this.logger.log(`已设置 release 目录权限`);
    } catch (error) {
      this.logger.error(`设置 mxcadassembly 权限失败: ${error.message}`);
      // 尝试使用 sudo（可能需要无密码 sudo 配置）
      this.logger.warn('如果权限不足，请手动执行: sudo chmod -R 777 mxcadassembly');
    }
  }

  /**
   * 设置 mx/so 共享库权限
   */
  private async setSharedLibraryPermissions(releaseDir: string): Promise<void> {
    const mxSoPath = path.join(releaseDir, 'mx', 'so');

    if (!fs.existsSync(mxSoPath)) {
      this.logger.warn(`mx/so 目录不存在: ${mxSoPath}`);
      return;
    }

    try {
      // 设置共享库目录权限
      await execAsync(`chmod -R 755 "${mxSoPath}"`);
      this.logger.log(`已设置 mx/so 目录权限`);
    } catch (error) {
      this.logger.error(`设置 mx/so 权限失败: ${error.message}`);
      this.logger.warn('如果权限不足，请手动执行: sudo chmod -R 777 ./mx/so/*');
    }
  }

  /**
   * 复制 locale 文件到系统目录
   */
  private async copyLocaleFiles(releaseDir: string): Promise<void> {
    const localeSourcePath = path.join(releaseDir, 'mx', 'locale');
    const localeTargetPath = '/usr/local/share/locale';

    if (!fs.existsSync(localeSourcePath)) {
      this.logger.warn(`locale 目录不存在: ${localeSourcePath}`);
      return;
    }

    try {
      // 检查目标目录是否存在
      if (!fs.existsSync(localeTargetPath)) {
        await execAsync(`mkdir -p "${localeTargetPath}"`);
      }

      // 复制 locale 文件
      await execAsync(`cp -r -f "${localeSourcePath}" "${localeTargetPath}"`);
      this.logger.log(`已复制 locale 文件到系统目录`);
    } catch (error) {
      this.logger.error(`复制 locale 文件失败: ${error.message}`);
      this.logger.warn(
        '如果权限不足，请手动执行: sudo cp -r -f ./mx/locale /usr/local/share/locale'
      );
    }
  }

  /**
   * 检查 Linux 环境是否已正确配置
   */
  async checkEnvironment(): Promise<{
    isConfigured: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // 检查 SVN 是否可用（所有平台）
    const svnCheck = checkSvnAvailableSync();
    if (!svnCheck.available) {
      issues.push(`SVN 不可用: ${svnCheck.message}`);
    }

    if (os.platform() !== 'linux') {
      return { isConfigured: issues.length === 0, issues };
    }

    const releaseDir = path.join(this.mxcadAssemblyDir, 'release');
    const mxcadAssemblyPath = path.join(releaseDir, 'mxcadassembly');

    // 检查主程序是否存在且可执行
    if (!fs.existsSync(mxcadAssemblyPath)) {
      issues.push('mxcadassembly 程序不存在');
    } else {
      try {
        await fs.promises.access(mxcadAssemblyPath, fs.constants.X_OK);
      } catch {
        issues.push('mxcadassembly 程序没有可执行权限');
      }
    }

    // 检查 mx/so 目录
    const mxSoPath = path.join(releaseDir, 'mx', 'so');
    if (!fs.existsSync(mxSoPath)) {
      issues.push('mx/so 共享库目录不存在');
    }

    // 检查 locale 文件
    const localeSourcePath = path.join(releaseDir, 'mx', 'locale');
    const localeTargetPath = '/usr/local/share/locale';
    if (fs.existsSync(localeSourcePath)) {
      const localeName = path.basename(localeSourcePath);
      if (!fs.existsSync(path.join(localeTargetPath, localeName))) {
        issues.push('locale 文件未复制到系统目录');
      }
    }

    return {
      isConfigured: issues.length === 0,
      issues,
    };
  }
}
