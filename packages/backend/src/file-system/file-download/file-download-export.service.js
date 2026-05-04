///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger, NotFoundException, BadRequestException, } from '@nestjs/common';
import { CadDownloadFormat } from '../dto/download-node.dto';
import * as path from 'path';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';
let FileDownloadExportService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileDownloadExportService = _classThis = class {
        constructor(prisma, storageService, storageManager, configService, permissionService, moduleRef) {
            this.prisma = prisma;
            this.storageService = storageService;
            this.storageManager = storageManager;
            this.configService = configService;
            this.permissionService = permissionService;
            this.moduleRef = moduleRef;
            this.logger = new Logger(FileDownloadExportService.name);
            this.mxCadService = null;
            const limits = this.configService.get('fileLimits', { infer: true });
            this.fileLimits = {
                zipMaxTotalSize: limits.zipMaxTotalSize,
                zipMaxFileCount: limits.zipMaxFileCount,
                zipMaxDepth: limits.zipMaxDepth,
                zipMaxSingleFileSize: limits.zipMaxSingleFileSize,
                zipCompressionLevel: limits.zipCompressionLevel,
                maxFilenameLength: limits.maxFilenameLength,
                maxRecursionDepth: limits.maxRecursionDepth,
            };
        }
        async getMxCadServiceInstance() {
            if (!this.mxCadService) {
                const { MxCadService } = await import('../../mxcad/core/mxcad.service');
                this.mxCadService = this.moduleRef.get(MxCadService, { strict: false });
            }
            return this.mxCadService;
        }
        sanitizeFileName(fileName) {
            let sanitized = fileName.replace(/[\/\\]/g, '_');
            // eslint-disable-next-line no-control-regex
            sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '_');
            if (sanitized.length > this.fileLimits.maxFilenameLength) {
                const ext = path.extname(sanitized);
                const nameWithoutExt = path.basename(sanitized, ext);
                const maxNameLength = this.fileLimits.maxFilenameLength - ext.length;
                sanitized = nameWithoutExt.substring(0, maxNameLength) + ext;
            }
            if (sanitized.trim() === '' || sanitized === '.') {
                sanitized = 'unnamed';
            }
            return sanitized;
        }
        getStoragePath(node) {
            if (!node.path) {
                throw new NotFoundException('文件路径不存在');
            }
            return this.storageManager.getFullPath(node.path);
        }
        async getFileStream(filePath) {
            try {
                return await this.storageService.getFileStream(filePath);
            }
            catch (error) {
                this.logger.error(`获取文件流失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async checkFileAccess(nodeId, userId) {
            try {
                const role = await this.permissionService.getNodeAccessRole(userId, nodeId);
                return role !== null;
            }
            catch (error) {
                this.logger.error(`检查文件访问权限失败: ${error.message}`, error.stack);
                return false;
            }
        }
        async downloadNode(nodeId, userId) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                if (!node.isFolder) {
                    const filename = node.originalName || node.name;
                    let actualFilename = filename;
                    const ext = path.extname(filename).toLowerCase();
                    if (['.dwg', '.dxf'].includes(ext)) {
                        actualFilename = `${filename}.mxweb`;
                    }
                    const stream = await this.getFileStream(node.path);
                    const mimeType = this.getMimeType(actualFilename);
                    this.logger.log(`文件下载: ${filename} (${nodeId}) by user ${userId}`);
                    return { stream, filename, mimeType };
                }
                const zipResult = await this.downloadNodeAsZip(nodeId, userId);
                this.logger.log(`目录下载: ${node.name} (${nodeId}) by user ${userId}`);
                return zipResult;
            }
            catch (error) {
                this.logger.error(`节点下载失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async downloadNodeWithFormat(nodeId, userId, format = CadDownloadFormat.MXWEB, pdfParams) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                if (node.isFolder) {
                    const zipResult = await this.downloadNodeAsZip(nodeId, userId);
                    this.logger.log(`目录下载: ${node.name} (${nodeId}) by user ${userId}`);
                    return zipResult;
                }
                const originalFilename = node.originalName || node.name;
                const ext = path.extname(originalFilename).toLowerCase();
                const isCadFile = ['.dwg', '.dxf'].includes(ext);
                if (!isCadFile) {
                    const stream = await this.getFileStream(node.path);
                    const mimeType = this.getMimeType(originalFilename);
                    this.logger.log(`文件下载（非CAD）: ${originalFilename} (${nodeId}) by user ${userId}`);
                    return { stream, filename: originalFilename, mimeType };
                }
                if (!node.path) {
                    throw new NotFoundException('文件路径不存在');
                }
                const mxwebPath = node.path;
                const mxwebExists = await this.storageService.fileExists(mxwebPath);
                if (!mxwebExists) {
                    throw new NotFoundException('MXWEB 文件不存在，请确认文件已转换完成');
                }
                switch (format) {
                    case CadDownloadFormat.MXWEB: {
                        const stream = await this.getFileStream(mxwebPath);
                        const mxwebFilename = `${originalFilename}.mxweb`;
                        const mimeType = this.getMimeType(mxwebFilename);
                        this.logger.log(`文件下载（MXWEB）: ${originalFilename} -> ${mxwebFilename} (${nodeId}) by user ${userId}`);
                        return { stream, filename: mxwebFilename, mimeType };
                    }
                    case CadDownloadFormat.DWG:
                    case CadDownloadFormat.DXF:
                    case CadDownloadFormat.PDF: {
                        let targetExt;
                        if (format === CadDownloadFormat.DWG) {
                            targetExt = '.dwg';
                        }
                        else if (format === CadDownloadFormat.DXF) {
                            targetExt = '.dxf';
                        }
                        else {
                            targetExt = '.pdf';
                        }
                        const targetFilename = `${path.basename(originalFilename, ext)}${targetExt}`;
                        const conversionOptions = {
                            srcpath: this.storageManager.getFullPath(mxwebPath).replace(/\\/g, '/'),
                            src_file_md5: node.fileHash || '',
                            outname: targetFilename,
                            create_preloading_data: false,
                        };
                        if (format === CadDownloadFormat.PDF) {
                            conversionOptions.width = pdfParams?.width || '2000';
                            conversionOptions.height = pdfParams?.height || '2000';
                            conversionOptions.colorPolicy = pdfParams?.colorPolicy || 'mono';
                        }
                        this.logger.log(`开始转换文件: ${originalFilename} -> ${targetFilename}`);
                        const mxCadService = await this.getMxCadServiceInstance();
                        const result = await mxCadService.convertServerFile(conversionOptions);
                        const resultObj = result;
                        if (resultObj.code !== 0) {
                            this.logger.error(`文件转换失败: ${resultObj.message}`);
                            throw new BadRequestException(`文件转换失败: ${resultObj.message}`);
                        }
                        const mxwebDir = path.dirname(node.path);
                        const targetRelativePath = `${mxwebDir}/${targetFilename}`;
                        const targetExists = await this.storageService.fileExists(targetRelativePath);
                        if (!targetExists) {
                            throw new NotFoundException(`转换后的文件不存在: ${targetFilename}`);
                        }
                        const convertedStream = await this.getFileStream(targetRelativePath);
                        const convertedMimeType = this.getMimeType(targetFilename);
                        convertedStream.on('end', async () => {
                            try {
                                await this.storageService.deleteFile(targetRelativePath);
                                this.logger.log(`临时转换文件已删除: ${targetRelativePath}`);
                            }
                            catch (error) {
                                this.logger.warn(`删除临时文件失败: ${targetRelativePath}, error: ${error.message}`);
                            }
                        });
                        convertedStream.on('error', async () => {
                            try {
                                await this.storageService.deleteFile(targetRelativePath);
                                this.logger.log(`流出错时删除临时文件: ${targetRelativePath}`);
                            }
                            catch (error) {
                                this.logger.warn(`删除临时文件失败: ${targetRelativePath}, error: ${error.message}`);
                            }
                        });
                        this.logger.log(`文件下载（${format.toUpperCase()}）: ${originalFilename} -> ${targetFilename} (${nodeId}) by user ${userId}`);
                        return {
                            stream: convertedStream,
                            filename: targetFilename,
                            mimeType: convertedMimeType,
                        };
                    }
                    default:
                        throw new BadRequestException(`不支持的下载格式: ${format}`);
                }
            }
            catch (error) {
                this.logger.error(`多格式下载失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async downloadNodeAsZip(nodeId, userId) {
            try {
                const node = await this.prisma.fileSystemNode.findUnique({
                    where: { id: nodeId },
                });
                if (!node) {
                    throw new NotFoundException('节点不存在');
                }
                const output = new PassThrough();
                const archive = archiver.create('zip', {
                    zlib: { level: this.fileLimits.zipCompressionLevel },
                });
                archive.on('error', (error) => {
                    this.logger.error(`ZIP 压缩失败: ${error.message}`, error.stack);
                    output.emit('error', error);
                });
                archive.pipe(output);
                const result = await this.addFilesToArchive(nodeId, archive, node.name, 0, 0, 0);
                await archive.finalize();
                const filename = `${node.name}.zip`;
                const mimeType = 'application/zip';
                this.logger.log(`目录压缩下载: ${node.name} (${nodeId}), files: ${result.fileCount}, size: ${result.totalSize} bytes by user ${userId}`);
                return { stream: output, filename, mimeType };
            }
            catch (error) {
                this.logger.error(`目录压缩下载失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        async addFilesToArchive(nodeId, archive, basePath, depth = 0, currentTotalSize = 0, currentFileCount = 0) {
            if (depth > this.fileLimits.zipMaxDepth) {
                this.logger.warn(`目录深度超过限制: ${depth}`);
                throw new BadRequestException('目录深度超过限制');
            }
            const node = await this.prisma.fileSystemNode.findUnique({
                where: { id: nodeId },
            });
            if (!node) {
                return { totalSize: currentTotalSize, fileCount: currentFileCount };
            }
            if (!node.isFolder && node.path) {
                if (node.size && node.size > this.fileLimits.zipMaxSingleFileSize) {
                    this.logger.warn(`文件大小超过限制: ${node.name} (${node.size} bytes)`);
                    throw new BadRequestException(`文件大小超过限制: ${node.name}`);
                }
                const filename = node.originalName || node.name;
                const ext = path.extname(filename).toLowerCase();
                const isCadFile = ['.dwg', '.dxf'].includes(ext);
                let filePath;
                if (isCadFile) {
                    const nodeDir = path.dirname(node.path);
                    filePath = `${nodeDir}/${filename}.mxweb`;
                }
                else {
                    filePath = node.path;
                }
                let stream = null;
                try {
                    stream = await this.getFileStream(filePath);
                    const sanitizedFileName = this.sanitizeFileName(filename);
                    archive.append(stream, { name: sanitizedFileName });
                    stream.on('close', () => {
                        this.logger.debug(`文件流已关闭: ${filename}`);
                    });
                    const fileSize = node.size || 0;
                    currentTotalSize += fileSize;
                    currentFileCount++;
                    return { totalSize: currentTotalSize, fileCount: currentFileCount };
                }
                catch (error) {
                    this.logger.warn(`添加文件到压缩包失败: ${node.name} - ${error.message}`);
                    if (stream && typeof stream.destroy === 'function') {
                        stream.destroy();
                    }
                    throw error;
                }
            }
            if (node.isFolder) {
                const children = await this.prisma.fileSystemNode.findMany({
                    where: {
                        parentId: nodeId,
                        deletedAt: null,
                    },
                });
                for (const child of children) {
                    const sanitizedChildName = this.sanitizeFileName(child.name);
                    const childPath = path.join(basePath, sanitizedChildName);
                    const result = await this.addFilesToArchive(child.id, archive, childPath, depth + 1, currentTotalSize, currentFileCount);
                    currentTotalSize = result.totalSize;
                    currentFileCount = result.fileCount;
                    if (currentTotalSize > this.fileLimits.zipMaxTotalSize) {
                        this.logger.warn(`压缩包总大小超过限制: ${currentTotalSize} bytes`);
                        throw new BadRequestException('压缩包总大小超过限制');
                    }
                    if (currentFileCount > this.fileLimits.zipMaxFileCount) {
                        this.logger.warn(`文件数量超过限制: ${currentFileCount}`);
                        throw new BadRequestException('文件数量超过限制');
                    }
                }
            }
            return { totalSize: currentTotalSize, fileCount: currentFileCount };
        }
        getMimeType(filename) {
            const ext = filename.split('.').pop()?.toLowerCase();
            const mimeTypes = {
                dwg: 'application/acad',
                dxf: 'application/dxf',
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
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                gif: 'image/gif',
                webp: 'image/webp',
                bmp: 'image/bmp',
                svg: 'image/svg+xml',
                ico: 'image/x-icon',
                tiff: 'image/tiff',
                tif: 'image/tiff',
                mp3: 'audio/mpeg',
                wav: 'audio/wav',
                ogg: 'audio/ogg',
                m4a: 'audio/mp4',
                flac: 'audio/flac',
                mp4: 'video/mp4',
                avi: 'video/x-msvideo',
                mov: 'video/quicktime',
                wmv: 'video/x-ms-wmv',
                mkv: 'video/x-matroska',
                webm: 'video/webm',
                zip: 'application/zip',
                rar: 'application/vnd.rar',
                '7z': 'application/x-7z-compressed',
                tar: 'application/x-tar',
                gz: 'application/gzip',
                bz2: 'application/x-bzip2',
                json: 'application/json',
                xml: 'application/xml',
                yaml: 'application/x-yaml',
                yml: 'application/x-yaml',
                csv: 'text/csv',
                sql: 'application/sql',
                js: 'application/javascript',
                ts: 'application/typescript',
                html: 'text/html',
                css: 'text/css',
                md: 'text/markdown',
                py: 'text/x-python',
                java: 'text/x-java-source',
                c: 'text/x-c',
                cpp: 'text/x-c++',
                h: 'text/x-c',
                hpp: 'text/x-c++',
            };
            return mimeTypes[ext || ''] || 'application/octet-stream';
        }
        formatBytes(bytes) {
            if (bytes === 0)
                return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        /**
         * 获取节点的完整存储路径（公共方法）
         * @param nodePath 节点的相对路径
         * @returns 本地存储的完整路径
         */
        getFullPath(nodePath) {
            if (!nodePath) {
                throw new NotFoundException('文件路径不存在');
            }
            return this.storageManager.getFullPath(nodePath);
        }
        /**
         * 检查节点是否属于图书馆节点（公共方法）
         * @param nodeId 节点 ID
         * @returns 是否为图书馆节点
         */
        async isLibraryNode(nodeId) {
            return await this.permissionService.isLibraryNode(nodeId);
        }
    };
    __setFunctionName(_classThis, "FileDownloadExportService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileDownloadExportService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileDownloadExportService = _classThis;
})();
export { FileDownloadExportService };
//# sourceMappingURL=file-download-export.service.js.map