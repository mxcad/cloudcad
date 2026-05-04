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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Controller, Delete, Get, Header, Logger, Post, StreamableFile, UseGuards, UseInterceptors, } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes, ApiQuery, } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { FontUploadTarget } from './dto/font.dto';
/**
 * 字体管理控制器
 */
let FontsController = (() => {
    let _classDecorators = [ApiTags('字体管理'), ApiBearerAuth(), Controller('font-management'), UseGuards(JwtAuthGuard, PermissionsGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getFonts_decorators;
    let _uploadFont_decorators;
    let _deleteFont_decorators;
    let _downloadFont_decorators;
    var FontsController = _classThis = class {
        constructor(fontsService) {
            this.fontsService = (__runInitializers(this, _instanceExtraInitializers), fontsService);
            this.logger = new Logger(FontsController.name);
        }
        /**
         * 获取字体列表（返回所有数据，由前端处理分页、筛选、排序）
         */
        async getFonts(location) {
            try {
                const result = await this.fontsService.getFonts(location);
                return {
                    code: 'SUCCESS',
                    message: '获取字体列表成功',
                    data: result,
                    timestamp: new Date().toISOString(),
                };
            }
            catch (error) {
                this.logger.error(`获取字体列表失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        /**
         * 上传字体文件
         */
        async uploadFont(file, uploadFontDto, req) {
            try {
                this.logger.log(`[uploadFont] 收到上传请求`);
                this.logger.log(`[uploadFont] 文件对象: ${file ? '存在' : '不存在'}`);
                this.logger.log(`[uploadFont] target: ${uploadFontDto?.target}`);
                this.logger.log(`[uploadFont] req.files: ${req.files ? '存在' : '不存在'}`);
                this.logger.log(`[uploadFont] req.file: ${req.file ? '存在' : '不存在'}`);
                const target = uploadFontDto.target || FontUploadTarget.BOTH;
                const result = await this.fontsService.uploadFont(file, target);
                return {
                    code: 'SUCCESS',
                    message: result.message,
                    data: result.font,
                    timestamp: new Date().toISOString(),
                };
            }
            catch (error) {
                this.logger.error(`上传字体失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        /**
         * 删除字体文件
         */
        async deleteFont(req, fileName, deleteFontDto) {
            try {
                const target = deleteFontDto.target || FontUploadTarget.BOTH;
                const result = await this.fontsService.deleteFont(fileName, target);
                return {
                    code: 'SUCCESS',
                    message: result.message,
                    timestamp: new Date().toISOString(),
                };
            }
            catch (error) {
                this.logger.error(`删除字体失败: ${error.message}`, error.stack);
                throw error;
            }
        }
        /**
         * 下载字体文件
         */
        async downloadFont(req, fileName, location) {
            const result = await this.fontsService.downloadFont(fileName, location);
            // 设置 Content-Disposition 响应头
            return new StreamableFile(result.stream, {
                type: 'application/octet-stream',
                disposition: `attachment; filename="${encodeURIComponent(result.fileName)}"`,
            });
        }
    };
    __setFunctionName(_classThis, "FontsController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getFonts_decorators = [Get(), ApiOperation({
                summary: '获取字体列表',
                description: '获取所有字体文件，前端负责分页、筛选和排序',
            }), ApiQuery({
                name: 'location',
                enum: ['backend', 'frontend'],
                required: false,
                description: '字体位置：backend 或 frontend，不指定则返回全部',
            }), RequirePermissions([SystemPermission.SYSTEM_FONT_READ])];
        _uploadFont_decorators = [Post('upload'), ApiOperation({
                summary: '上传字体文件',
                description: '上传字体文件到指定目录',
            }), ApiConsumes('multipart/form-data'), UseInterceptors(FileInterceptor('file')), RequirePermissions([SystemPermission.SYSTEM_FONT_UPLOAD])];
        _deleteFont_decorators = [Delete(':fileName'), ApiOperation({
                summary: '删除字体文件',
                description: '从指定目录删除字体文件',
            }), ApiQuery({
                name: 'target',
                enum: Object.values(FontUploadTarget),
                enumName: 'FontUploadTarget',
                required: false,
                description: '删除目标',
            }), RequirePermissions([SystemPermission.SYSTEM_FONT_DELETE])];
        _downloadFont_decorators = [Get('download/:fileName'), ApiOperation({
                summary: '下载字体文件',
                description: '下载指定位置的字体文件',
            }), ApiQuery({
                name: 'location',
                enum: ['backend', 'frontend'],
                required: true,
                description: '下载位置',
            }), Header('Content-Type', 'application/octet-stream'), RequirePermissions([SystemPermission.SYSTEM_FONT_DOWNLOAD])];
        __esDecorate(_classThis, null, _getFonts_decorators, { kind: "method", name: "getFonts", static: false, private: false, access: { has: obj => "getFonts" in obj, get: obj => obj.getFonts }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _uploadFont_decorators, { kind: "method", name: "uploadFont", static: false, private: false, access: { has: obj => "uploadFont" in obj, get: obj => obj.uploadFont }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _deleteFont_decorators, { kind: "method", name: "deleteFont", static: false, private: false, access: { has: obj => "deleteFont" in obj, get: obj => obj.deleteFont }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _downloadFont_decorators, { kind: "method", name: "downloadFont", static: false, private: false, access: { has: obj => "downloadFont" in obj, get: obj => obj.downloadFont }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FontsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FontsController = _classThis;
})();
export { FontsController };
//# sourceMappingURL=fonts.controller.js.map