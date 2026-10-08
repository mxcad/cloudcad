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

import { promises as fs } from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';
/**
 * 文件操作工具类
 * 提供路径校验、存储路径解析、文件存在性检查等纯逻辑工具方法
 */
export class FileUtils {
  /**
   * 检查路径是否存在
   * @param path 文件或目录路径
   * @returns 是否存在
   */
  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 剥离存储路径前缀（/mxcad/file/、filesData/，兼容反斜杠）
   * 调用方可能传入绝对路径、相对路径或带前缀的相对路径，统一归一化
   * @param inputPath 输入路径
   * @returns 剥离前缀后的路径（相对路径原样返回，绝对路径保留）
   */
  static stripStoragePrefix(inputPath: string): string {
    let storagePath = inputPath.replace(/^\/mxcad\/file\//, '');
    if (
      storagePath.startsWith('filesData/') ||
      storagePath.startsWith('filesData\\')
    ) {
      storagePath = storagePath.slice('filesData'.length + 1);
    }
    return storagePath;
  }

  /**
   * 解析存储路径为 baseDir 下的绝对路径
   * 支持三种调用形态：绝对路径（直接采用）、相对路径（拼到 baseDir 下）、
   * 带 filesData/ 或 /mxcad/file/ 前缀的相对路径（剥离前缀再拼接）
   * 使用 path.resolve 而非 path.join：join 遇到绝对路径仍会拼接 baseDir 导致双重前缀
   * @param inputPath 输入路径
   * @param baseDir 存储根目录（如 filesDataPath）
   * @returns 绝对路径
   */
  static resolveStoragePath(inputPath: string, baseDir: string): string {
    const storagePath = FileUtils.stripStoragePrefix(inputPath);
    return path.resolve(baseDir, storagePath);
  }

  /**
   * 验证路径安全性，防止路径遍历攻击
   * @param inputPath 输入路径
   * @param baseDir 基础目录（用于验证路径是否在允许范围内）
   * @returns 验证通过后的安全路径
   * @throws Error 如果路径不安全
   */
  static validatePath(inputPath: string, baseDir?: string): string {
    if (!inputPath) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.path_empty') ?? '路径不能为空'
      );
    }

    // 检查原始输入是否包含路径遍历尝试（在 normalize 之前，避免 normalize 展开 .. 导致绕过）
    if (inputPath.includes('..') || inputPath.includes('~')) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.path_illegal_chars') ??
          '路径包含非法字符'
      );
    }

    // 规范化路径，移除 .. 和 .
    const normalizedPath = path.normalize(inputPath);

    // 检查绝对路径
    if (path.isAbsolute(normalizedPath)) {
      // 如果提供了基础目录，验证路径是否在基础目录内
      if (baseDir) {
        const normalizedBaseDir = path.normalize(baseDir);
        const relativePath = path.relative(normalizedBaseDir, normalizedPath);

        // 如果相对路径以 .. 开头，说明路径在基础目录之外
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.file.path_out_of_bounds') ??
              '路径不在允许的目录内'
          );
        }
      }
    }

    // 检查特殊文件名
    const basename = path.basename(normalizedPath);
    if (basename === '.' || basename === '..' || basename === '') {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.name_invalid') ?? '无效的文件名'
      );
    }

    // 检查 Windows 保留设备名称
    const windowsReservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (windowsReservedNames.test(basename.split('.')[0])) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.name_windows_reserved') ??
          'Windows 保留文件名'
      );
    }

    return normalizedPath;
  }

  /**
   * 验证文件名安全性
   * @param filename 文件名
   * @returns 验证通过后的安全文件名
   * @throws Error 如果文件名不安全
   */
  static validateFilename(filename: string): string {
    if (!filename) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.name_empty') ?? '文件名不能为空'
      );
    }

    // 移除路径部分，只保留文件名
    const basename = path.basename(filename);

    // 检查文件名长度
    if (basename.length > 255) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.name_too_long') ?? '文件名过长'
      );
    }

    // 验证文件名字符（只允许字母、数字、下划线、连字符、点、空格、中文字符）
    const validFilenameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9._\-\s]+$/;
    if (!validFilenameRegex.test(basename)) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.name_contains_illegal_chars') ??
          '文件名包含非法字符'
      );
    }

    // 检查是否以点开头（隐藏文件）
    if (basename.startsWith('.')) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file_extra.filename_starts_with_dot') ??
          '文件名不能以点开头'
      );
    }

    // 检查是否包含特殊危险字符
    const dangerousChars = ['<', '>', ':', '"', '|', '?', '*', '\0'];
    if (dangerousChars.some((char) => basename.includes(char))) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.name_dangerous_chars') ??
          '文件名包含危险字符'
      );
    }

    return basename;
  }

  /**
   * 清理文件名，移除或替换非法字符
   * @param filename 原始文件名
   * @returns 清理后的安全文件名
   */
  static sanitizeFilename(filename: string): string {
    if (!filename) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.name_empty') ?? '文件名不能为空'
      );
    }

    // 移除路径部分，只保留文件名
    let basename = path.basename(filename);

    // 移除路径遍历字符
    basename = basename.replace(/\.\./g, '');
    basename = basename.replace(/\.\//g, '');
    basename = basename.replace(/\.\\/g, '');

    // 移除危险字符
    basename = basename.replace(/[<>:"|?*\0]/g, '');

    // 移除前后空格和点
    basename = basename.trim().replace(/^\.+|\.+$/g, '');

    // 移除以点开头的隐藏文件标记
    if (basename.startsWith('.')) {
      basename = basename.substring(1);
    }

    // 确保文件名不为空
    if (!basename) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.name_sanitized_empty') ??
          '清理后的文件名为空'
      );
    }

    return basename;
  }

  /**
   * 将相对路径解析到根目录下，并校验结果仍在根目录内（防 `..` 路径遍历逃逸）。
   *
   * 用于所有「把用户可控路径拼到 filesDataPath 等根目录下再读盘」的场景：
   * 先 resolve 再校验前缀，逃逸即拒绝，避免 `path.resolve(root, '../../etc/passwd')`
   * 跳出根目录读取任意文件（Express 通配符 `*path` 会原样捕获 `..` 段，不经过
   * 浏览器/客户端的路径归一化）。
   *
   * @param root 根目录（如 filesDataPath）
   * @param relative 相对路径（可能含用户输入）
   * @returns 解析后的绝对路径（保证在 root 内，含 root 本身）
   * @throws BadRequestException 若解析结果逃逸出 root
   */
  static resolveWithinRoot(root: string, relative: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, relative);
    if (
      resolved !== resolvedRoot &&
      !resolved.startsWith(resolvedRoot + path.sep)
    ) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径'
      );
    }
    return resolved;
  }
}
