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
/**
 * 节点工具类
 * 提供文件名处理、MIME 类型检测、文件验证等纯逻辑工具方法
 * 不依赖数据库，只返回成功或失败结果
 */
export class NodeUtils {
    /**
     * 生成唯一的文件名（处理重复）
     * @param existingNames 已存在的文件名列表
     * @param originalName 原始文件名
     * @returns 唯一文件名
     */
    static generateUniqueFileName(existingNames, originalName) {
        // 提取文件名和扩展名
        const baseName = this.getBaseName(originalName);
        const extension = this.getExtension(originalName);
        let candidate = `${baseName}${extension}`;
        let counter = 1;
        // 检查是否已存在，如果存在则添加序号
        while (existingNames.includes(candidate)) {
            candidate = `${baseName} (${counter})${extension}`;
            counter++;
        }
        return candidate;
    }
    /**
     * 从文件名解析文件哈希（SHA-256）
     * @param filename 文件名
     * @returns 文件哈希或 null
     */
    static parseFileHash(filename) {
        // 文件名格式：{hash}.{extension}
        const baseName = this.getBaseName(filename);
        // SHA-256 哈希应该是 64 位十六进制字符
        const sha256Pattern = /^[a-f0-9]{64}$/i;
        if (sha256Pattern.test(baseName)) {
            return baseName;
        }
        return null;
    }
    /**
     * 获取文件的 MIME 类型
     * @param extension 文件扩展名（带或不带点）
     * @returns MIME 类型
     */
    static getMimeType(extension) {
        if (!extension) {
            return 'application/octet-stream';
        }
        // 确保扩展名以点开头
        const normalizedExt = extension.startsWith('.')
            ? extension.slice(1)
            : extension;
        // 转换为小写
        const lowerExt = normalizedExt.toLowerCase();
        return this.MIME_TYPES[lowerExt] || 'application/octet-stream';
    }
    /**
     * 验证文件名是否有效
     * @param filename 文件名
     * @returns 是否有效
     */
    static validateFileName(filename) {
        // 检查文件名是否为空
        if (!filename || filename.trim().length === 0) {
            return false;
        }
        // 检查文件名长度
        if (filename.length > this.MAX_FILENAME_LENGTH) {
            return false;
        }
        // 检查是否包含路径遍历字符
        if (filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')) {
            return false;
        }
        // 检查是否包含非法字符
        if (this.INVALID_CHARS.test(filename)) {
            return false;
        }
        // 检查是否包含控制字符
        if (this.CONTROL_CHARS.test(filename)) {
            return false;
        }
        // 检查是否为 Windows 保留名称
        const nameWithoutExt = this.getBaseName(filename);
        if (this.RESERVED_NAMES.test(nameWithoutExt)) {
            return false;
        }
        // 检查是否为点开头（隐藏文件或当前目录）
        if (filename.startsWith('.') && filename.length === 1) {
            return false;
        }
        return true;
    }
    /**
     * 清理文件名，移除非法字符
     * @param filename 原始文件名
     * @returns 清理后的文件名
     */
    static sanitizeFileName(filename) {
        // 移除路径遍历字符
        let sanitized = filename.replace(/[/\\]/g, '_');
        // 移除控制字符
        sanitized = sanitized.replace(this.CONTROL_CHARS, '_');
        // 移除非法字符
        sanitized = sanitized.replace(this.INVALID_CHARS, '_');
        // 限制文件名长度
        if (sanitized.length > this.MAX_FILENAME_LENGTH) {
            const ext = this.getExtension(sanitized);
            const nameWithoutExt = this.getBaseName(sanitized);
            const maxNameLength = this.MAX_FILENAME_LENGTH - ext.length;
            sanitized = nameWithoutExt.substring(0, maxNameLength) + ext;
        }
        // 确保文件名不为空
        if (sanitized.trim() === '' || sanitized === '.') {
            sanitized = 'unnamed';
        }
        return sanitized;
    }
    /**
     * 获取文件扩展名（带点）
     * @param filename 文件名
     * @returns 扩展名（如 ".dwg"）
     */
    static getExtension(filename) {
        if (!filename) {
            return '';
        }
        const lastDotIndex = filename.lastIndexOf('.');
        // 没有点，或者点是最后一个字符
        if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
            return '';
        }
        // 点是第一个字符（隐藏文件）
        if (lastDotIndex === 0) {
            return '';
        }
        return filename.substring(lastDotIndex);
    }
    /**
     * 获取文件主名（不含扩展名）
     * @param filename 文件名
     * @returns 主文件名
     */
    static getBaseName(filename) {
        if (!filename) {
            return '';
        }
        const lastDotIndex = filename.lastIndexOf('.');
        // 没有点
        if (lastDotIndex === -1) {
            return filename;
        }
        // 点是第一个字符（隐藏文件）
        if (lastDotIndex === 0) {
            return filename;
        }
        return filename.substring(0, lastDotIndex);
    }
    /**
     * 检查是否为支持的文件类型
     * @param filename 文件名
     * @returns 是否支持
     */
    static isSupportedFileType(filename) {
        const extension = this.getExtension(filename).toLowerCase();
        return this.SUPPORTED_EXTENSIONS.includes(extension);
    }
    /**
     * 检查是否为 CAD 文件
     * @param filename 文件名
     * @returns 是否为 CAD 文件
     */
    static isCADFile(filename) {
        const extension = this.getExtension(filename).toLowerCase();
        return ['.dwg', '.dxf'].includes(extension);
    }
    /**
     * 检查是否为图片文件
     * @param filename 文件名
     * @returns 是否为图片文件
     */
    static isImageFile(filename) {
        const extension = this.getExtension(filename).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(extension);
    }
    /**
     * 检查是否为文档文件
     * @param filename 文件名
     * @returns 是否为文档文件
     */
    static isDocumentFile(filename) {
        const extension = this.getExtension(filename).toLowerCase();
        return [
            '.pdf',
            '.doc',
            '.docx',
            '.xls',
            '.xlsx',
            '.ppt',
            '.pptx',
            '.txt',
            '.rtf',
            '.odt',
            '.ods',
            '.odp',
        ].includes(extension);
    }
    /**
     * 检查是否为 MxCAD 文件
     * @param filename 文件名
     * @returns 是否为 MxCAD 文件
     */
    static isMxCADFile(filename) {
        const extension = this.getExtension(filename).toLowerCase();
        return extension === '.mxweb' || extension === '.mxwbe';
    }
    /**
     * 标准化文件扩展名（确保以点开头且为小写）
     * @param extension 文件扩展名
     * @returns 标准化后的扩展名
     */
    static normalizeExtension(extension) {
        if (!extension) {
            return '';
        }
        // 确保以点开头
        let normalized = extension.startsWith('.') ? extension : `.${extension}`;
        // 转换为小写
        normalized = normalized.toLowerCase();
        return normalized;
    }
    /**
     * 格式化文件大小
     * @param bytes 字节数
     * @returns 格式化后的字符串
     */
    static formatFileSize(bytes) {
        if (bytes === 0) {
            return '0 B';
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const size = bytes / Math.pow(k, i);
        return `${size.toFixed(2)} ${units[i]}`;
    }
    /**
     * 验证文件哈希格式（SHA-256）
     * @param fileHash 文件哈希
     * @returns 是否有效
     */
    static isValidFileHash(fileHash) {
        // SHA-256 哈希应该是 64 位十六进制字符
        const sha256Pattern = /^[a-f0-9]{64}$/i;
        return sha256Pattern.test(fileHash);
    }
    /**
     * 从文件名构建安全的存储文件名
     * @param originalName 原始文件名
     * @param fileHash 文件哈希
     * @returns 存储文件名
     */
    static buildStorageFileName(originalName, fileHash) {
        const extension = this.getExtension(originalName);
        return `${fileHash}${extension}`;
    }
    /**
     * 检查文件扩展名是否匹配
     * @param filename1 文件名1
     * @param filename2 文件名2
     * @returns 是否匹配
     */
    static isExtensionMatch(filename1, filename2) {
        const ext1 = this.getExtension(filename1).toLowerCase();
        const ext2 = this.getExtension(filename2).toLowerCase();
        return ext1 === ext2;
    }
}
// 支持的文件扩展名
NodeUtils.SUPPORTED_EXTENSIONS = [
    // CAD 文件
    '.dwg',
    '.dxf',
    // 文档文件
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
    '.rtf',
    '.odt',
    '.ods',
    '.odp',
    // 图片文件
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    'webp',
    // MxCAD 文件
    '.mxweb',
    '.mxwbe',
];
// MIME 类型映射
NodeUtils.MIME_TYPES = {
    // CAD 文件
    dwg: 'application/acad',
    dxf: 'application/dxf',
    // 文档文件
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain; charset=utf-8',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
    // 图片文件
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    // MxCAD 文件
    mxweb: 'application/octet-stream',
};
// Windows 保留文件名
NodeUtils.RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
// 非法字符（Windows 和 Linux 都不允许，包含控制字符是故意的用于安全验证）
// eslint-disable-next-line no-control-regex
NodeUtils.INVALID_CHARS = /[<>:"|?*\x00-\x1F]/;
// 控制字符（故意匹配控制字符用于安全清理）
// eslint-disable-next-line no-control-regex
NodeUtils.CONTROL_CHARS = /[\x00-\x1F\x7F]/;
// 最大文件名长度
NodeUtils.MAX_FILENAME_LENGTH = 255;
//# sourceMappingURL=node-utils.js.map