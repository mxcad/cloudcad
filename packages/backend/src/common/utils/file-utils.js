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
import { BadRequestException, Logger } from '@nestjs/common';
/**
 * 文件操作工具类
 * 提供文件和目录的常用操作方法
 */
export class FileUtils {
    /**
     * 复制文件
     * @param source 源文件路径
     * @param target 目标文件路径
     * @returns 操作是否成功
     */
    static async copyFile(source, target) {
        try {
            // 确保目标目录存在
            await this.ensureDirectory(path.dirname(target));
            await fs.copyFile(source, target);
            this.logger.log(`文件复制成功: ${source} -> ${target}`);
            return true;
        }
        catch (error) {
            this.logger.error(`文件复制失败: ${source} -> ${target}`, error);
            return false;
        }
    }
    /**
     * 复制目录（递归）
     * @param source 源目录路径
     * @param target 目标目录路径
     * @returns 操作是否成功
     */
    static async copyDirectory(source, target) {
        try {
            // 确保目标目录存在
            await this.ensureDirectory(target);
            const entries = await fs.readdir(source, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(source, entry.name);
                const destPath = path.join(target, entry.name);
                if (entry.isDirectory()) {
                    // 递归复制子目录
                    const success = await this.copyDirectory(srcPath, destPath);
                    if (!success) {
                        return false;
                    }
                }
                else {
                    // 复制文件
                    const success = await this.copyFile(srcPath, destPath);
                    if (!success) {
                        return false;
                    }
                }
            }
            this.logger.log(`目录复制成功: ${source} -> ${target}`);
            return true;
        }
        catch (error) {
            this.logger.error(`目录复制失败: ${source} -> ${target}`, error);
            return false;
        }
    }
    /**
     * 获取目录中指定前缀的所有文件
     * @param dir 目录路径
     * @param prefix 文件名前缀
     * @returns 文件路径列表
     */
    static async getFilesByPrefix(dir, prefix) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const files = [];
            for (const entry of entries) {
                if (entry.isFile() && entry.name.startsWith(prefix)) {
                    files.push(path.join(dir, entry.name));
                }
            }
            this.logger.debug(`在目录 ${dir} 中找到 ${files.length} 个前缀为 ${prefix} 的文件`);
            return files;
        }
        catch (error) {
            this.logger.error(`获取目录文件失败: ${dir}, 前缀: ${prefix}`, error);
            return [];
        }
    }
    /**
     * 确保目录存在，不存在则创建
     * @param dirPath 目录路径
     * @returns 操作是否成功
     */
    static async ensureDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return true;
        }
        catch (error) {
            this.logger.error(`创建目录失败: ${dirPath}`, error);
            return false;
        }
    }
    /**
     * 检查路径是否存在
     * @param path 文件或目录路径
     * @returns 是否存在
     */
    static async exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * 获取文件大小（字节）
     * @param filePath 文件路径
     * @returns 文件大小，获取失败返回 0
     */
    static async getFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return stats.size;
        }
        catch (error) {
            this.logger.error(`获取文件大小失败: ${filePath}`, error);
            return 0;
        }
    }
    /**
     * 读取目录内容
     * @param dirPath 目录路径
     * @returns 目录项名称列表
     */
    static async readDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath);
            return entries;
        }
        catch (error) {
            this.logger.error(`读取目录失败: ${dirPath}`, error);
            return [];
        }
    }
    /**
     * 删除文件
     * @param filePath 文件路径
     * @returns 操作是否成功
     */
    static async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
            this.logger.log(`文件删除成功: ${filePath}`);
            return true;
        }
        catch (error) {
            this.logger.error(`文件删除失败: ${filePath}`, error);
            return false;
        }
    }
    /**
     * 删除目录（递归）
     * @param dirPath 目录路径
     * @returns 操作是否成功
     */
    static async deleteDirectory(dirPath) {
        try {
            await fs.rm(dirPath, { recursive: true, force: true });
            this.logger.log(`目录删除成功: ${dirPath}`);
            return true;
        }
        catch (error) {
            this.logger.error(`目录删除失败: ${dirPath}`, error);
            return false;
        }
    }
    /**
     * 移动文件或目录
     * @param source 源路径
     * @param target 目标路径
     * @returns 操作是否成功
     */
    static async move(source, target) {
        try {
            await fs.rename(source, target);
            this.logger.log(`移动成功: ${source} -> ${target}`);
            return true;
        }
        catch (error) {
            this.logger.error(`移动失败: ${source} -> ${target}`, error);
            return false;
        }
    }
    /**
     * 验证路径安全性，防止路径遍历攻击
     * @param inputPath 输入路径
     * @param baseDir 基础目录（用于验证路径是否在允许范围内）
     * @returns 验证通过后的安全路径
     * @throws Error 如果路径不安全
     */
    static validatePath(inputPath, baseDir) {
        if (!inputPath) {
            throw new BadRequestException('路径不能为空');
        }
        // 规范化路径，移除 .. 和 .
        const normalizedPath = path.normalize(inputPath);
        // 检查是否包含路径遍历尝试
        if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
            throw new BadRequestException('路径包含非法字符');
        }
        // 检查绝对路径
        if (path.isAbsolute(normalizedPath)) {
            // 如果提供了基础目录，验证路径是否在基础目录内
            if (baseDir) {
                const normalizedBaseDir = path.normalize(baseDir);
                const relativePath = path.relative(normalizedBaseDir, normalizedPath);
                // 如果相对路径以 .. 开头，说明路径在基础目录之外
                if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                    throw new BadRequestException('路径不在允许的目录内');
                }
            }
        }
        // 检查特殊文件名
        const basename = path.basename(normalizedPath);
        if (basename === '.' || basename === '..' || basename === '') {
            throw new BadRequestException('无效的文件名');
        }
        // 检查 Windows 保留设备名称
        const windowsReservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
        if (windowsReservedNames.test(basename.split('.')[0])) {
            throw new BadRequestException('Windows 保留文件名');
        }
        return normalizedPath;
    }
    /**
     * 验证文件名安全性
     * @param filename 文件名
     * @returns 验证通过后的安全文件名
     * @throws Error 如果文件名不安全
     */
    static validateFilename(filename) {
        if (!filename) {
            throw new BadRequestException('文件名不能为空');
        }
        // 移除路径部分，只保留文件名
        const basename = path.basename(filename);
        // 检查文件名长度
        if (basename.length > 255) {
            throw new BadRequestException('文件名过长');
        }
        // 验证文件名字符（只允许字母、数字、下划线、连字符、点、空格、中文字符）
        const validFilenameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9._\-\s]+$/;
        if (!validFilenameRegex.test(basename)) {
            throw new BadRequestException('文件名包含非法字符');
        }
        // 检查是否以点开头（隐藏文件）
        if (basename.startsWith('.')) {
            throw new BadRequestException('文件名不能以点开头');
        }
        // 检查是否包含特殊危险字符
        const dangerousChars = ['<', '>', ':', '"', '|', '?', '*', '\0'];
        if (dangerousChars.some((char) => basename.includes(char))) {
            throw new BadRequestException('文件名包含危险字符');
        }
        return basename;
    }
    /**
     * 清理文件名，移除或替换非法字符
     * @param filename 原始文件名
     * @returns 清理后的安全文件名
     */
    static sanitizeFilename(filename) {
        if (!filename) {
            throw new BadRequestException('文件名不能为空');
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
            throw new BadRequestException('清理后的文件名为空');
        }
        return basename;
    }
}
FileUtils.logger = new Logger(FileUtils.name);
//# sourceMappingURL=file-utils.js.map