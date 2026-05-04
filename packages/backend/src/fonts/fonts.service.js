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
import { BadRequestException, Injectable, Logger, NotFoundException, } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { FontUploadTarget } from './dto/font.dto';
/**
 * 字体管理服务
 * 负责管理后端转换程序和前端的字体文件
 */
let FontsService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FontsService = _classThis = class {
        constructor(configService) {
            this.configService = configService;
            this.logger = new Logger(FontsService.name);
            /** 支持的字体文件扩展名 */
            this.allowedExtensions = [
                '.ttf',
                '.otf',
                '.woff',
                '.woff2',
                '.eot',
                '.ttc',
                '.shx',
            ];
            /** 最大文件大小（10MB） */
            this.maxFileSize = 10 * 1024 * 1024;
            // 从配置服务获取字体目录路径（配置已在 configuration.ts 中正确解析为绝对路径）
            this.backendFontsDir = this.configService.get('fonts.backendPath');
            this.frontendFontsDir = this.configService.get('fonts.frontendPath');
            this.logger.log(`后端字体目录: ${this.backendFontsDir}`);
            this.logger.log(`前端字体目录: ${this.frontendFontsDir}`);
        }
        /**
         * 获取字体列表
         * @param location 指定返回的字体位置：'backend'、'frontend' 或不指定返回全部
         */
        async getFonts(location) {
            try {
                // 确保目录存在
                await this.ensureDirectoriesExist();
                // 根据参数获取对应目录的字体文件
                if (location === 'backend') {
                    const backendFonts = await this.getFontsFromDirectory(this.backendFontsDir, 'backend');
                    return backendFonts.map((font) => ({
                        ...font,
                        existsInBackend: true,
                        existsInFrontend: false,
                        creator: '系统管理员',
                        updatedAt: font.createdAt,
                    }));
                }
                if (location === 'frontend') {
                    const frontendFonts = await this.getFontsFromDirectory(this.frontendFontsDir, 'frontend');
                    return frontendFonts.map((font) => ({
                        ...font,
                        existsInBackend: false,
                        existsInFrontend: true,
                        creator: '系统管理员',
                        updatedAt: font.createdAt,
                    }));
                }
                // 如果不指定 location，返回合并后的完整列表
                const backendFonts = await this.getFontsFromDirectory(this.backendFontsDir, 'backend');
                const frontendFonts = await this.getFontsFromDirectory(this.frontendFontsDir, 'frontend');
                // 合并字体信息
                const fontMap = new Map();
                backendFonts.forEach((font) => {
                    fontMap.set(font.name, {
                        ...font,
                        existsInBackend: true,
                        existsInFrontend: false,
                        creator: '系统管理员',
                        updatedAt: font.createdAt,
                    });
                });
                frontendFonts.forEach((font) => {
                    const existing = fontMap.get(font.name);
                    if (existing) {
                        existing.existsInFrontend = true;
                        existing.size = Math.max(existing.size, font.size);
                        // 使用最新的创建时间
                        if (font.createdAt > existing.createdAt) {
                            existing.createdAt = font.createdAt;
                        }
                    }
                    else {
                        fontMap.set(font.name, {
                            ...font,
                            existsInBackend: false,
                            existsInFrontend: true,
                            creator: '系统管理员',
                            updatedAt: font.createdAt,
                        });
                    }
                });
                return Array.from(fontMap.values());
            }
            catch (error) {
                this.logger.error(`获取字体列表失败: ${error.message}`, error.stack);
                throw new BadRequestException('获取字体列表失败');
            }
        }
        /**
         * 上传字体文件
         */
        async uploadFont(file, target = FontUploadTarget.BOTH) {
            try {
                // 验证文件
                this.validateFontFile(file);
                const fileName = file.originalname;
                const fileExt = path.extname(fileName).toLowerCase();
                // 确保目录存在
                await this.ensureDirectoriesExist();
                const results = [];
                // 根据目标上传到相应目录
                if (target === FontUploadTarget.BACKEND ||
                    target === FontUploadTarget.BOTH) {
                    const backendPath = path.join(this.backendFontsDir, fileName);
                    await fs.writeFile(backendPath, file.buffer);
                    results.push({ location: 'backend', path: backendPath });
                    this.logger.log(`字体已上传到后端目录: ${backendPath}`);
                }
                if (target === FontUploadTarget.FRONTEND ||
                    target === FontUploadTarget.BOTH) {
                    const frontendPath = path.join(this.frontendFontsDir, fileName);
                    await fs.writeFile(frontendPath, file.buffer);
                    results.push({ location: 'frontend', path: frontendPath });
                    this.logger.log(`字体已上传到前端目录: ${frontendPath}`);
                }
                // 返回字体信息
                const fontInfo = {
                    name: fileName,
                    size: file.size,
                    extension: fileExt,
                    existsInBackend: target !== FontUploadTarget.FRONTEND,
                    existsInFrontend: target !== FontUploadTarget.BACKEND,
                    createdAt: new Date(),
                };
                return {
                    message: `字体文件 ${fileName} 上传成功`,
                    font: fontInfo,
                };
            }
            catch (error) {
                this.logger.error(`上传字体失败: ${error.message}`, error.stack);
                throw new BadRequestException(`上传字体失败: ${error.message}`);
            }
        }
        /**
         * 删除字体文件
         */
        async deleteFont(fileName, target = FontUploadTarget.BOTH) {
            try {
                // 验证文件名
                if (!fileName || fileName.includes('..') || fileName.includes('/')) {
                    throw new BadRequestException('无效的文件名');
                }
                // 确保目录存在
                await this.ensureDirectoriesExist();
                const results = [];
                // 根据目标从相应目录删除
                if (target === FontUploadTarget.BACKEND ||
                    target === FontUploadTarget.BOTH) {
                    const backendPath = path.join(this.backendFontsDir, fileName);
                    try {
                        await fs.unlink(backendPath);
                        results.push({ location: 'backend', path: backendPath });
                        this.logger.log(`字体已从后端目录删除: ${backendPath}`);
                    }
                    catch (error) {
                        if (error.code !== 'ENOENT') {
                            throw error;
                        }
                        this.logger.warn(`后端目录中不存在字体: ${fileName}`);
                    }
                }
                if (target === FontUploadTarget.FRONTEND ||
                    target === FontUploadTarget.BOTH) {
                    const frontendPath = path.join(this.frontendFontsDir, fileName);
                    try {
                        await fs.unlink(frontendPath);
                        results.push({ location: 'frontend', path: frontendPath });
                        this.logger.log(`字体已从前端目录删除: ${frontendPath}`);
                    }
                    catch (error) {
                        if (error.code !== 'ENOENT') {
                            throw error;
                        }
                        this.logger.warn(`前端目录中不存在字体: ${fileName}`);
                    }
                }
                if (results.length === 0) {
                    throw new NotFoundException(`字体文件 ${fileName} 不存在`);
                }
                return {
                    message: `字体文件 ${fileName} 删除成功`,
                };
            }
            catch (error) {
                this.logger.error(`删除字体失败: ${error.message}`, error.stack);
                if (error instanceof NotFoundException) {
                    throw error;
                }
                throw new BadRequestException(`删除字体失败: ${error.message}`);
            }
        }
        /**
         * 下载字体文件
         */
        async downloadFont(fileName, location) {
            try {
                // 验证文件名（防止路径遍历攻击）
                if (!fileName ||
                    fileName.includes('..') ||
                    fileName.includes('/') ||
                    fileName.includes('\\')) {
                    throw new BadRequestException('无效的文件名');
                }
                const fontDir = location === 'backend' ? this.backendFontsDir : this.frontendFontsDir;
                const filePath = path.join(fontDir, fileName);
                // 检查文件是否存在
                try {
                    await fs.access(filePath);
                    // 检查路径是否是目录
                    const stats = await fs.stat(filePath);
                    if (stats.isDirectory()) {
                        throw new NotFoundException(`路径是目录而非文件: ${fileName}`);
                    }
                }
                catch (error) {
                    if (error instanceof NotFoundException) {
                        throw error;
                    }
                    throw new NotFoundException(`字体文件 ${fileName} 不存在`);
                }
                // 创建文件流
                const stream = fsSync.createReadStream(filePath);
                return { stream, fileName };
            }
            catch (error) {
                this.logger.error(`下载字体失败: ${error.message}`, error.stack);
                if (error instanceof NotFoundException) {
                    throw error;
                }
                throw new BadRequestException(`下载字体失败: ${error.message}`);
            }
        }
        /**
         * 从指定目录获取字体文件列表
         */
        async getFontsFromDirectory(dir, location) {
            try {
                const files = await fs.readdir(dir);
                const fonts = [];
                for (const file of files) {
                    try {
                        const filePath = path.join(dir, file);
                        const stat = await fs.stat(filePath);
                        if (stat.isFile()) {
                            const ext = path.extname(file).toLowerCase();
                            if (this.allowedExtensions.includes(ext)) {
                                fonts.push({
                                    name: file,
                                    size: stat.size,
                                    extension: ext,
                                    createdAt: stat.birthtime,
                                });
                            }
                        }
                    }
                    catch (fileError) {
                        // 单个文件读取失败时记录日志但继续处理其他文件
                        if (fileError.code === 'EPERM' || fileError.code === 'EACCES') {
                            this.logger.warn(`无法访问字体文件(可能正被使用): ${file}`);
                        }
                        else {
                            this.logger.warn(`读取字体文件信息失败: ${file}, ${fileError.message}`);
                        }
                        continue;
                    }
                }
                return fonts;
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    this.logger.warn(`目录不存在: ${dir}`);
                    return [];
                }
                throw error;
            }
        }
        /**
         * 验证字体文件
         */
        validateFontFile(file) {
            if (!file) {
                throw new BadRequestException('未提供文件');
            }
            const fileName = file.originalname;
            const ext = path.extname(fileName).toLowerCase();
            // 验证文件扩展名
            if (!this.allowedExtensions.includes(ext)) {
                throw new BadRequestException(`不支持的文件类型。支持的类型: ${this.allowedExtensions.join(', ')}`);
            }
            // 验证文件大小
            if (file.size > this.maxFileSize) {
                throw new BadRequestException(`文件大小超过限制。最大允许: ${this.maxFileSize / 1024 / 1024}MB`);
            }
            // 验证文件名
            if (!fileName || fileName.length > 255) {
                throw new BadRequestException('文件名无效');
            }
        }
        /**
         * 确保目录存在
         */
        async ensureDirectoriesExist() {
            try {
                await fs.mkdir(this.backendFontsDir, { recursive: true });
                await fs.mkdir(this.frontendFontsDir, { recursive: true });
            }
            catch (error) {
                this.logger.error(`创建目录失败: ${error.message}`, error.stack);
                throw new BadRequestException('无法创建字体目录');
            }
        }
    };
    __setFunctionName(_classThis, "FontsService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FontsService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FontsService = _classThis;
})();
export { FontsService };
//# sourceMappingURL=fonts.service.js.map