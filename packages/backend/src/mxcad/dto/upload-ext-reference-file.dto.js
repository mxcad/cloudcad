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
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
/**
 * 上传外部参照文件 DTO
 */
let UploadExtReferenceFileDto = (() => {
    var _a;
    let _file_decorators;
    let _file_initializers = [];
    let _file_extraInitializers = [];
    let _hash_decorators;
    let _hash_initializers = [];
    let _hash_extraInitializers = [];
    let _nodeId_decorators;
    let _nodeId_initializers = [];
    let _nodeId_extraInitializers = [];
    let _ext_ref_file_decorators;
    let _ext_ref_file_initializers = [];
    let _ext_ref_file_extraInitializers = [];
    let _updatePreloading_decorators;
    let _updatePreloading_initializers = [];
    let _updatePreloading_extraInitializers = [];
    return _a = class UploadExtReferenceFileDto {
            constructor() {
                this.file = __runInitializers(this, _file_initializers, void 0);
                this.hash = (__runInitializers(this, _file_extraInitializers), __runInitializers(this, _hash_initializers, void 0));
                this.nodeId = (__runInitializers(this, _hash_extraInitializers), __runInitializers(this, _nodeId_initializers, void 0));
                this.ext_ref_file = (__runInitializers(this, _nodeId_extraInitializers), __runInitializers(this, _ext_ref_file_initializers, void 0));
                this.updatePreloading = (__runInitializers(this, _ext_ref_file_extraInitializers), __runInitializers(this, _updatePreloading_initializers, void 0));
                __runInitializers(this, _updatePreloading_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _file_decorators = [ApiProperty({
                    description: '上传的文件',
                    type: 'string',
                    format: 'binary',
                }), IsOptional()];
            _hash_decorators = [ApiProperty({
                    description: '文件哈希值（用于 Multer 文件名生成）',
                    example: '25e89b5adf19984330f4e68b0f99db64',
                    required: false,
                }), IsString(), IsOptional()];
            _nodeId_decorators = [ApiProperty({
                    description: '源图纸文件的节点 ID（FileSystemNode ID）',
                    example: 'cml8t8wg60004ucufd7pb3sq6',
                    required: false,
                }), IsString(), IsOptional()];
            _ext_ref_file_decorators = [ApiProperty({
                    description: '外部参照文件名（含扩展名）',
                    example: 'ref1.dwg',
                }), IsString(), IsNotEmpty()];
            _updatePreloading_decorators = [ApiProperty({
                    description: '是否更新 mxweb_preloading.json（默认 false）',
                    example: false,
                    required: false,
                }), IsBoolean(), IsOptional()];
            __esDecorate(null, null, _file_decorators, { kind: "field", name: "file", static: false, private: false, access: { has: obj => "file" in obj, get: obj => obj.file, set: (obj, value) => { obj.file = value; } }, metadata: _metadata }, _file_initializers, _file_extraInitializers);
            __esDecorate(null, null, _hash_decorators, { kind: "field", name: "hash", static: false, private: false, access: { has: obj => "hash" in obj, get: obj => obj.hash, set: (obj, value) => { obj.hash = value; } }, metadata: _metadata }, _hash_initializers, _hash_extraInitializers);
            __esDecorate(null, null, _nodeId_decorators, { kind: "field", name: "nodeId", static: false, private: false, access: { has: obj => "nodeId" in obj, get: obj => obj.nodeId, set: (obj, value) => { obj.nodeId = value; } }, metadata: _metadata }, _nodeId_initializers, _nodeId_extraInitializers);
            __esDecorate(null, null, _ext_ref_file_decorators, { kind: "field", name: "ext_ref_file", static: false, private: false, access: { has: obj => "ext_ref_file" in obj, get: obj => obj.ext_ref_file, set: (obj, value) => { obj.ext_ref_file = value; } }, metadata: _metadata }, _ext_ref_file_initializers, _ext_ref_file_extraInitializers);
            __esDecorate(null, null, _updatePreloading_decorators, { kind: "field", name: "updatePreloading", static: false, private: false, access: { has: obj => "updatePreloading" in obj, get: obj => obj.updatePreloading, set: (obj, value) => { obj.updatePreloading = value; } }, metadata: _metadata }, _updatePreloading_initializers, _updatePreloading_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadExtReferenceFileDto };
//# sourceMappingURL=upload-ext-reference-file.dto.js.map