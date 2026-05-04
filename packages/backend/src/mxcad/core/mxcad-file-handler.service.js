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
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
/**
 * MxCAD 文件处理服务
 *
 * 统一处理项目文件、图纸库、图块库的文件访问请求
 * 支持 mxweb 文件和外部参照文件的访问
 */
let MxcadFileHandlerService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MxcadFileHandlerService = _classThis = class {
        constructor(configService, db) {
            this.configService = configService;
            this.db = db;
            this.logger = new Logger(MxcadFileHandlerService.name);
        }
        /**
         * 统一处理文件访问请求
         * @param filename 文件路径（格式：YYYYMM/nodeId/fileHash.dwg.mxweb 或 YYYYMM/nodeId/fileHash/image.jpg）
         * @param res Express Response 对象
         */
        async serveFile(filename, res) {
            try {
                this.logger.log(`
----------------------------------------
[serveFile] 处理文件请求
- 文件路径: ${filename}
- 时间: ${new Date().toISOString()}
----------------------------------------
      `);
                const filesDataPath = this.configService.get('filesDataPath', {
                    infer: true,
                });
                const absoluteFilePath = path.resolve(filesDataPath, filename);
                this.logger.log(`[serveFile] 绝对路径: ${absoluteFilePath}`);
                // 文件存在，直接返回
                if (fs.existsSync(absoluteFilePath)) {
                    this.logger.log(`[serveFile] 文件存在: ${absoluteFilePath}`);
                    const fileStats = fs.statSync(absoluteFilePath);
                    this.logger.log(`[serveFile] 文件大小: ${fileStats.size} bytes`);
                    return this.streamFile(absoluteFilePath, res);
                }
                // 文件不存在，尝试外部参照路径 {dir}/{fileHash}/{fileName}
                this.logger.warn(`[serveFile] 文件不存在，尝试查找外部参照: ${filename}`);
                const extRefPath = await this.findExternalReferencePath(filename);
                if (extRefPath) {
                    this.logger.log(`[serveFile] 找到外部参照文件: ${extRefPath}`);
                    return this.streamFile(extRefPath, res);
                }
                this.logger.error(`[serveFile] 文件不存在: ${absoluteFilePath}`);
                throw new NotFoundException('文件不存在');
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                const errorStack = error instanceof Error ? error.stack : undefined;
                const errorStatus = error.status;
                const errorStatusCode = error.statusCode;
                const errorResponse = error
                    .response;
                this.logger.error(`[serveFile] 处理失败: ${errorMessage}`, errorStack);
                if (!res.headersSent) {
                    const status = errorStatus || errorStatusCode || 500;
                    res.status(status).json({
                        message: errorMessage || '获取文件失败',
                        error: errorResponse?.error || 'Internal Server Error',
                    });
                }
            }
        }
        /**
         * 查找外部参照文件路径
         * @param filename 请求的文件路径
         * @returns 外部参照文件路径，如果不存在则返回 null
         */
        async findExternalReferencePath(filename) {
            try {
                // 解析路径：YYYYMM/{nodeId}/...
                const parts = filename.split('/');
                if (parts.length < 2) {
                    return null;
                }
                const nodeId = parts[1];
                // 获取节点的 fileHash
                const node = await this.db.fileSystemNode.findUnique({
                    where: { id: nodeId },
                    select: { fileHash: true },
                });
                if (!node?.fileHash) {
                    return null;
                }
                // 构建外部参照路径：{dir}/{fileHash}/{fileName}
                const dir = path.dirname(filename);
                const extRefPath = path.join(dir, node.fileHash, path.basename(filename));
                const filesDataPath = this.configService.get('filesDataPath', {
                    infer: true,
                });
                const fullPath = path.resolve(filesDataPath, extRefPath);
                // 检查外部参照文件是否存在
                if (fs.existsSync(fullPath)) {
                    return fullPath;
                }
                return null;
            }
            catch (error) {
                this.logger.error(`[findExternalReferencePath] 查找失败：${error.message}`);
                return null;
            }
        }
        /**
         * 流式传输文件
         * @param filePath 文件绝对路径
         * @param res Express Response 对象
         */
        streamFile(filePath, res) {
            const fileStats = fs.statSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            // 设置 Content-Type
            const contentTypes = {
                '.mxweb': 'application/octet-stream',
                '.dwg': 'application/acad',
                '.dxf': 'application/dxf',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.bmp': 'image/bmp',
            };
            const contentType = contentTypes[ext] || 'application/octet-stream';
            // 设置响应头
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', fileStats.size);
            // 禁用缓存，确保每次请求都获取最新文件
            // 特别是对于图纸库/图块库文件，用户可能刚刚保存并需要立即使用
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问
            // 对文件名进行编码，避免中文等非 ASCII 字符导致的响应头错误
            const encodedFilename = encodeURIComponent(path.basename(filePath));
            res.setHeader('Content-Disposition', `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
            // 创建文件流并返回
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
            // 监听流错误
            fileStream.on('error', (error) => {
                this.logger.error(`[streamFile] 文件流错误：${error.message}`);
                if (!res.headersSent) {
                    res.status(500).json({ message: '文件读取失败' });
                }
            });
            this.logger.log(`[streamFile] 开始传输文件：${filePath}`);
        }
    };
    __setFunctionName(_classThis, "MxcadFileHandlerService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MxcadFileHandlerService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MxcadFileHandlerService = _classThis;
})();
export { MxcadFileHandlerService };
//# sourceMappingURL=mxcad-file-handler.service.js.map