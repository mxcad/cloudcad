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
 * 文件类型检测工具
 */
export class FileTypeDetector {
    /**
     * 检查是否为CAD文件
     * @param fileName 文件名
     * @returns 是否为CAD文件
     */
    static isCadFile(fileName) {
        const ext = this.getFileExtension(fileName);
        return this.CAD_EXTENSIONS.includes(ext);
    }
    /**
     * 检查是否为MXWeb文件
     * @param fileName 文件名
     * @returns 是否为MXWeb文件
     */
    static isMxwebFile(fileName) {
        const ext = this.getFileExtension(fileName);
        return ext === this.MXWEB_EXTENSION;
    }
    /**
     * 检查是否为图片文件
     * @param fileName 文件名
     * @returns 是否为图片文件
     */
    static isImageFile(fileName) {
        const ext = this.getFileExtension(fileName);
        return this.IMAGE_EXTENSIONS.includes(ext);
    }
    /**
     * 检查是否为文档文件
     * @param fileName 文件名
     * @returns 是否为文档文件
     */
    static isDocumentFile(fileName) {
        const ext = this.getFileExtension(fileName);
        return this.DOCUMENT_EXTENSIONS.includes(ext);
    }
    /**
     * 检查是否为压缩文件
     * @param fileName 文件名
     * @returns 是否为压缩文件
     */
    static isArchiveFile(fileName) {
        const ext = this.getFileExtension(fileName);
        return this.ARCHIVE_EXTENSIONS.includes(ext);
    }
    /**
     * 检查是否需要转换（CAD文件）
     * @param fileName 文件名
     * @returns 是否需要转换
     */
    static needsConversion(fileName) {
        return this.isCadFile(fileName);
    }
    /**
     * 检查是否可以直接上传（非CAD文件）
     * @param fileName 文件名
     * @returns 是否可以直接上传
     */
    static canDirectUpload(fileName) {
        return !this.isCadFile(fileName);
    }
    /**
     * 获取文件类型分类
     * @param fileName 文件名
     * @returns 文件类型分类
     */
    static getFileCategory(fileName) {
        if (this.isCadFile(fileName))
            return 'cad';
        if (this.isImageFile(fileName))
            return 'image';
        if (this.isDocumentFile(fileName))
            return 'document';
        if (this.isArchiveFile(fileName))
            return 'archive';
        return 'other';
    }
    /**
     * 获取文件扩展名（小写）
     * @param fileName 文件名
     * @returns 文件扩展名
     */
    static getFileExtension(fileName) {
        const lastDotIndex = fileName.lastIndexOf('.');
        if (lastDotIndex === -1)
            return '';
        return fileName.substring(lastDotIndex).toLowerCase();
    }
    /**
     * 获取支持的文件扩展名列表
     * @returns 支持的文件扩展名列表
     */
    static getSupportedExtensions() {
        return [
            ...this.CAD_EXTENSIONS,
            ...this.IMAGE_EXTENSIONS,
            ...this.DOCUMENT_EXTENSIONS,
            ...this.ARCHIVE_EXTENSIONS,
        ];
    }
    /**
     * 检查文件是否支持
     * @param fileName 文件名
     * @returns 是否支持
     */
    static isSupported(fileName) {
        const ext = this.getFileExtension(fileName);
        return this.getSupportedExtensions().includes(ext);
    }
}
/**
 * CAD文件扩展名
 */
FileTypeDetector.CAD_EXTENSIONS = ['.dwg', '.dxf'];
/**
 * MXWeb文件扩展名
 */
FileTypeDetector.MXWEB_EXTENSION = '.mxweb';
/**
 * 图片文件扩展名
 */
FileTypeDetector.IMAGE_EXTENSIONS = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.svg',
    '.webp',
];
/**
 * 文档文件扩展名
 */
FileTypeDetector.DOCUMENT_EXTENSIONS = [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
];
/**
 * 压缩文件扩展名
 */
FileTypeDetector.ARCHIVE_EXTENSIONS = [
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.gz',
];
//# sourceMappingURL=file-type-detector.js.map