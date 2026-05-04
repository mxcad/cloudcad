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
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';
/**
 * CAD 文件下载格式枚举
 */
export var CadDownloadFormat;
(function (CadDownloadFormat) {
    /** DWG 格式（通过 mxweb 转换） */
    CadDownloadFormat["DWG"] = "dwg";
    /** DXF 格式（通过 mxweb 转换） */
    CadDownloadFormat["DXF"] = "dxf";
    /** MXWEB 格式（直接下载） */
    CadDownloadFormat["MXWEB"] = "mxweb";
    /** PDF 格式（通过 mxweb 转换） */
    CadDownloadFormat["PDF"] = "pdf";
})(CadDownloadFormat || (CadDownloadFormat = {}));
/**
 * PDF 转换参数
 */
let PdfConversionParams = (() => {
    var _a;
    let _width_decorators;
    let _width_initializers = [];
    let _width_extraInitializers = [];
    let _height_decorators;
    let _height_initializers = [];
    let _height_extraInitializers = [];
    let _colorPolicy_decorators;
    let _colorPolicy_initializers = [];
    let _colorPolicy_extraInitializers = [];
    return _a = class PdfConversionParams {
            constructor() {
                this.width = __runInitializers(this, _width_initializers, void 0);
                this.height = (__runInitializers(this, _width_extraInitializers), __runInitializers(this, _height_initializers, void 0));
                this.colorPolicy = (__runInitializers(this, _height_extraInitializers), __runInitializers(this, _colorPolicy_initializers, void 0));
                __runInitializers(this, _colorPolicy_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _width_decorators = [ApiProperty({
                    description: '输出宽度（像素）',
                    required: false,
                    default: '2000',
                }), IsOptional(), IsString()];
            _height_decorators = [ApiProperty({
                    description: '输出高度（像素）',
                    required: false,
                    default: '2000',
                }), IsOptional(), IsString()];
            _colorPolicy_decorators = [ApiProperty({
                    description: '颜色策略：mono（单色）、color（彩色）',
                    required: false,
                    default: 'mono',
                }), IsOptional(), IsString()];
            __esDecorate(null, null, _width_decorators, { kind: "field", name: "width", static: false, private: false, access: { has: obj => "width" in obj, get: obj => obj.width, set: (obj, value) => { obj.width = value; } }, metadata: _metadata }, _width_initializers, _width_extraInitializers);
            __esDecorate(null, null, _height_decorators, { kind: "field", name: "height", static: false, private: false, access: { has: obj => "height" in obj, get: obj => obj.height, set: (obj, value) => { obj.height = value; } }, metadata: _metadata }, _height_initializers, _height_extraInitializers);
            __esDecorate(null, null, _colorPolicy_decorators, { kind: "field", name: "colorPolicy", static: false, private: false, access: { has: obj => "colorPolicy" in obj, get: obj => obj.colorPolicy, set: (obj, value) => { obj.colorPolicy = value; } }, metadata: _metadata }, _colorPolicy_initializers, _colorPolicy_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PdfConversionParams };
/**
 * 节点下载查询参数 DTO
 */
let DownloadNodeQueryDto = (() => {
    var _a;
    let _format_decorators;
    let _format_initializers = [];
    let _format_extraInitializers = [];
    let _width_decorators;
    let _width_initializers = [];
    let _width_extraInitializers = [];
    let _height_decorators;
    let _height_initializers = [];
    let _height_extraInitializers = [];
    let _colorPolicy_decorators;
    let _colorPolicy_initializers = [];
    let _colorPolicy_extraInitializers = [];
    return _a = class DownloadNodeQueryDto {
            constructor() {
                this.format = __runInitializers(this, _format_initializers, void 0);
                this.width = (__runInitializers(this, _format_extraInitializers), __runInitializers(this, _width_initializers, void 0));
                this.height = (__runInitializers(this, _width_extraInitializers), __runInitializers(this, _height_initializers, void 0));
                this.colorPolicy = (__runInitializers(this, _height_extraInitializers), __runInitializers(this, _colorPolicy_initializers, void 0));
                __runInitializers(this, _colorPolicy_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _format_decorators = [ApiProperty({
                    description: '下载格式（仅 CAD 文件有效）',
                    enum: Object.values(CadDownloadFormat),
                    enumName: 'CadDownloadFormat',
                    required: false,
                    default: CadDownloadFormat.MXWEB,
                }), IsOptional(), IsIn(Object.values(CadDownloadFormat))];
            _width_decorators = [ApiProperty({
                    description: 'PDF 输出宽度（像素），仅当 format=pdf 时有效',
                    required: false,
                    default: '2000',
                }), IsOptional(), IsString()];
            _height_decorators = [ApiProperty({
                    description: 'PDF 输出高度（像素），仅当 format=pdf 时有效',
                    required: false,
                    default: '2000',
                }), IsOptional(), IsString()];
            _colorPolicy_decorators = [ApiProperty({
                    description: 'PDF 颜色策略（mono/color），仅当 format=pdf 时有效',
                    required: false,
                    default: 'mono',
                }), IsOptional(), IsString()];
            __esDecorate(null, null, _format_decorators, { kind: "field", name: "format", static: false, private: false, access: { has: obj => "format" in obj, get: obj => obj.format, set: (obj, value) => { obj.format = value; } }, metadata: _metadata }, _format_initializers, _format_extraInitializers);
            __esDecorate(null, null, _width_decorators, { kind: "field", name: "width", static: false, private: false, access: { has: obj => "width" in obj, get: obj => obj.width, set: (obj, value) => { obj.width = value; } }, metadata: _metadata }, _width_initializers, _width_extraInitializers);
            __esDecorate(null, null, _height_decorators, { kind: "field", name: "height", static: false, private: false, access: { has: obj => "height" in obj, get: obj => obj.height, set: (obj, value) => { obj.height = value; } }, metadata: _metadata }, _height_initializers, _height_extraInitializers);
            __esDecorate(null, null, _colorPolicy_decorators, { kind: "field", name: "colorPolicy", static: false, private: false, access: { has: obj => "colorPolicy" in obj, get: obj => obj.colorPolicy, set: (obj, value) => { obj.colorPolicy = value; } }, metadata: _metadata }, _colorPolicy_initializers, _colorPolicy_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { DownloadNodeQueryDto };
//# sourceMappingURL=download-node.dto.js.map